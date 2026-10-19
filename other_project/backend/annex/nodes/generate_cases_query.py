import logging
from backend.annex.config import llm_client, config
from backend.annex.state import AnnexState
from langchain_core.prompts import (
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate,
)
from langchain_core.runnables import RunnableLambda

chat_prompt = ChatPromptTemplate.from_messages(
    [
        SystemMessagePromptTemplate.from_template(config.query_rewrite),
        HumanMessagePromptTemplate.from_template("{mp_question}"),
    ]
)

chat_chain = (
    RunnableLambda(
        lambda state: {
            "mp_question": state.mp_question,
        }
    )
    | chat_prompt
    | llm_client
)


async def generate_cases_query(state: AnnexState) -> dict:
    """
    Re-write the MP question with an LLM for vector search, falling back to the original MP question if the LLM fails.

    Args:
        state (AnnexState): The current state of the workflow, containing the MP's question.

    Returns:
        dict: A dictionary containing the generated cases search query.
    """
    try:
        response = await chat_chain.ainvoke(state)
        reply_text = response.content.strip()
        logging.info("Generated cases search query.")

    # If LLM fails, use original query.
    except Exception as error:
        logging.error(
            f"Using original MP question, as generate_cases_query node failed: {error}"
        )
        reply_text = state.mp_question

    return {"cases_search_query": reply_text}
