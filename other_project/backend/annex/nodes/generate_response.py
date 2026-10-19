from datetime import datetime
import os
from backend.annex.config import llm_client, config
from backend.annex.state import AnnexState
from langchain_core.prompts import (
    ChatPromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate,
    AIMessagePromptTemplate,
)
from langchain_core.messages import AIMessage
import json
import logging


def augment_data(state: AnnexState) -> str:
    """
    Augments a prompt composed of the Cosmos DB, Hansard data and previous defence cases, to be used as the user input.

    Note: Deliberately applying filters POST retrieval of data, so we can log the raw results.
    E.g. May want to modify the relevance score threshold in future, and want to be able to see the impact of this in the logs.

    Args:
        state (AnnexState): The current state of the workflow, containing the Cosmos DB, Hansard and previous defence cases data.

    Returns:
        str: The augmented prompt as a single JSON string.
    """

    def simplify_date(date_str: str) -> str:
        """Format date string from ISO format to DD-MM-YYYY."""
        try:
            date = datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%SZ")
            return date.strftime("%d-%m-%Y")
        except Exception:
            return date_str

    def simplify_score(score: float) -> float:
        """Round relevance score to 1 dp."""
        try:
            return round(score, 1)
        except Exception:
            return score

    def unique_by_case_ref(cases: list[dict]) -> list[dict]:
        """Remove duplicate cases by case_ref, keeping the first occurrence as ordered by score."""
        seen = set()
        unique = []
        for case in cases:
            case_ref = case.get("case_ref")
            if case_ref not in seen:
                seen.add(case_ref)
                unique.append(case)
        return unique

    def process_case_data(raw_cases: list[dict]) -> list[dict]:
        """Process case data: filter by score, transform fields, and deduplicate."""
        return unique_by_case_ref(
            [
                {
                    "case_ref": response.get("case_ref"),
                    "case_title": response.get("case_title"),
                    "reporting_team": response.get("reporting_team"),
                    "date_received": simplify_date(response.get("date_received")),
                    "relevance_score": simplify_score(
                        response.get("@search.reranker_score")
                    ),
                }
                for response in raw_cases
                if response.get("@search.reranker_score", 2.0)
                >= config.AZURE_SEARCH_SCORE_THRESHOLD_ANNEX
            ]
        )

    # Start with a copy of the cosmos_data
    prompt_data = dict(state.cosmos_data)

    # Add Hansard data as a list of dicts
    prompt_data["hansard_data"] = [
        {
            "transcript": transcript.get("content"),
            "debate_section": transcript.get("debate_section"),
            "sitting_date": transcript.get("sitting_date"),
        }
        for transcript in state.hansard_data
    ]

    # Add previous Defence cases data as a list of dicts
    prompt_data["defence_cases_data"] = unique_by_case_ref(
        [
            {
                "case_ref": response.get("case_ref"),
                "case_title": response.get("case_title"),
                "date_received": simplify_date(response.get("date_received")),
            }
            for response in state.defence_cases_data
        ]
    )

    prompt_data["previous_cases"] = {
        "foi_cases_data": process_case_data(state.foi_cases_data),
        "pq_cases_data": process_case_data(state.pq_cases_data),
        "mc_cases_data": process_case_data(state.mc_cases_data),
        "to_cases_data": process_case_data(state.to_cases_data),
    }

    combined = json.dumps(prompt_data, indent=2, ensure_ascii=False)

    logging.info(f"Augmented prompt created. Length: {len(combined)} characters.")

    return combined


chat_prompt = ChatPromptTemplate.from_messages(
    [
        SystemMessagePromptTemplate.from_template(config.system_prompt),
        HumanMessagePromptTemplate.from_template(
            "The MP is {mp_name_display} and their question is:\n\n<question>\n{mp_question}\n</question>\n\nHere is the relevant data:\n\n<data>\n{mp_data}\n</data>"
        ),
    ]
)


def fallback_response(error: list) -> AIMessage:
    """
    Generates a fallback response with appended error message.
    """
    error_message = "\n".join(f"- {message}" for message in error)
    fallback_template = AIMessagePromptTemplate.from_template(config.fallback_response)
    fallback_message = fallback_template.format(public_error_messages=error_message)
    return fallback_message


def footnote_message(content) -> AIMessage:
    """
    Generates a footnote message to be appended to the response.
    """
    return AIMessage(content=content)


async def generate_response(state: AnnexState) -> dict:
    """
    Generate a response with the LLM using the augmented prompt, with fallback response.

    Args:
        state (AnnexState): The current state of the workflow, containing the Cosmos DB, Hansard and previous defence cases data.

    Returns:
        dict: A dictionary containing the AI message to be added to the messages list.
    """
    if state.public_error_messages != []:
        logging.warning(
            "Using fallback response, as errors were found in the retrieved data."
        )
        response = fallback_response(error=state.public_error_messages)
        return {"messages": [response]}

    try:
        prompt_values = {
            "mp_data": augment_data(state),
            "mp_name_display": state.mp_name_display,
            "mp_question": state.mp_question,
            "user_timezone": datetime.now().strftime("%Z") or "UTC",
            "current_date": datetime.now().strftime("%d-%m-%Y"),
            "date_cutoff": config.ANNEX_MONTHS_CUTOFF,
        }
        prompt_messages = chat_prompt.format_messages(**prompt_values)
        response = await llm_client.ainvoke(prompt_messages)

        # Append footnote to the generated response
        # The footnote currently requires different handling for streaming vs non-streaming.
        # In future, we should investigate tidying this logic.
        streaming_enabled = (
            os.environ.get("AZURE_OPENAI_STREAM", "true").lower() == "true"
        )
        if streaming_enabled:
            messages_to_return = prompt_messages + [
                response,
                footnote_message(config.footnote),
            ]
        else:
            response = AIMessage(content=response.content + config.footnote)
            messages_to_return = prompt_messages + [response]

        logging.info("Generated chat response.")
        raw_error_messages = []
        public_error_messages = []

    except Exception as error:
        logging.error(
            f"Using fallback response, as generate_response node failed: {error}"
        )
        raw_error_messages = [str(error)]

        # Can add more error handling here in future, as we see the common types that come in.
        if "content_filter" in str(error):
            public_error_messages = [
                "The response was blocked by the content filter. Please try rephrasing your question or contact support if the issue persists."
            ]
        else:
            public_error_messages = ["The Large Language Model failed to generate."]

        response = fallback_response(error=public_error_messages)
        messages_to_return = [response]

    return {
        "messages": messages_to_return,
        "raw_error_messages": raw_error_messages,
        "public_error_messages": public_error_messages,
    }
