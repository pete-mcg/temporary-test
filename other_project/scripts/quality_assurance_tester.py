import csv
import json
import os
from typing import TypedDict
from dotenv import load_dotenv
import httpx
import asyncio
from azure.identity.aio import (
    AzureCliCredential,
    get_bearer_token_provider,
)
import json
from openai import AsyncAzureOpenAI
from time import sleep
import datetime

load_dotenv()

BACKEND_API_URL = (
    os.environ.get("BACKEND_API_URL") or "http://127.0.0.1:50505/conversation"
)
TESTER_SCORE_TARGET = int(os.environ.get("TESTER_SCORE_TARGET", 60))
TESTER_TIMEOUT_SECONDS = int(os.environ.get("TESTER_TIMEOUT_SECONDS", 20))
AZURE_OPENAI_MODEL = os.environ.get("AZURE_OPENAI_MODEL", "gpt-4")
AZURE_OPENAI_MAX_TOKENS = int(os.environ.get("AZURE_OPENAI_MAX_TOKENS", 1500))
AZURE_OPENAI_TEMPERATURE = float(os.environ.get("AZURE_OPENAI_TEMPERATURE", 0.0))
AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT")
AZURE_MANAGED_IDENTITY_ID = os.environ.get("AZURE_MANAGED_IDENTITY_ID")


class ApiResponse(TypedDict):
    answer: str
    citations: list


class CitationComparison(TypedDict):
    correct_count: int
    correct_citations: list
    incorrect_count: int
    incorrect_citations: list
    missing_count: int
    missing_citations: list
    total_expected: int


# Returns a dict of csv columns { "question": str, "expected": str, "citations": str }
def parse_csv(file_path) -> list:
    data = []

    with open(file_path, mode="r", newline="") as file:
        csv_reader = csv.reader(file)

        next(
            csv_reader
        )  # Skip the header row i.e Golden question, expected output, expected citations

        for row in csv_reader:
            data.append({"question": row[0], "expected": row[1], "citations": row[2]})

    return data


# Returns a dict { "answer": str, "citations": list }
async def perform_backend_api_request(question: str) -> ApiResponse:
    data = {
        "messages": [
            {
                "role": "user",
                "content": question,
                "date": datetime.datetime.now().isoformat(),
            }
        ],
        "mode": "ask_anything",
        "settings": {
            "casetypes": {
                "FOI": False,
                "PQLO": False,
                "PQLW": False,
                "PQN": False,
                "PQO": False,
                "PQW": False,
            },
            "years": [2014, 2024],
        },
    }
    headers = {"Content-Type": "application/json"}
    json_data = json.dumps(data)

    httpx_client = httpx.AsyncClient(verify=False, timeout=60)
    try:
        response = await httpx_client.post(
            BACKEND_API_URL, data=json_data, headers=headers
        )
        response.raise_for_status()
        response_json = response.json()

        answer_messages = [
            message
            for choice in response_json["choices"]
            for message in choice["messages"]
            if message["role"] == "assistant"
        ]

        tool_messages = [
            message
            for choice in response_json["choices"]
            for message in choice["messages"]
            if message["role"] == "tool"
        ]

        # Extract Citations
        tool_content = tool_messages[0]["content"]
        tool_json = json.loads(tool_content)
        citations_json = tool_json["citations"]
        citations = [
            citation["filepath"].strip().upper().replace(" ", "")
            for citation in citations_json
            if citation["filepath"]
        ]

        return {"answer": answer_messages[0]["content"], "citations": citations}
    except Exception as e:
        print("Failed to get response from backend API")
        raise e
    finally:
        await httpx_client.aclose()


async def evaluate(expected: str, actual: str) -> int:
    credential = AzureCliCredential()
    ad_token_provider = get_bearer_token_provider(
        credential, "https://cognitiveservices.azure.com/.default"
    )

    azure_open_ai_client = AsyncAzureOpenAI(
        api_version="2024-10-21",
        azure_ad_token_provider=ad_token_provider,
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
    )

    try:
        system_message = "You are an evaluator for the MOD. Your job is to evaluate the expected response with the response given by an AI model and evaluate if they are semantically the same."

        response = await azure_open_ai_client.chat.completions.create(
            model=AZURE_OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_message},
                {"role": "user", "content": f"Expected: {expected} Actual: {actual}"},
            ],
            max_tokens=AZURE_OPENAI_MAX_TOKENS,
            temperature=AZURE_OPENAI_TEMPERATURE,
            function_call="auto",
            # Function ensures that OpenAI will run the evaluator function and return the output as a structured JSON response
            functions=[
                {
                    "name": "evaluator",
                    "description": "Evaluates the difference between the expected and actual response. Returns a score between 0 and 100. Format the response as json",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "expected": {
                                "type": "string",
                                "description": "The expected response.",
                            },
                            "actual": {
                                "type": "string",
                                "description": "The actual response.",
                            },
                            "semantic_score": {
                                "type": "number",
                                "description": "The semantic similarity score between the expected and actual response.",
                            },
                        },
                        "required": ["semantic_score"],
                    },
                }
            ],
        )

        if not response and not response.choices:
            raise Exception("Failed to get response from evaluation model.")

        response_function = response.choices[0].message.function_call
        arguments = response_function.arguments
        arguments_obj = json.loads(arguments)

        score = arguments_obj.get("semantic_score")

        return score
    except Exception as e:
        print("Failed to evaluate response")
        raise e
    finally:
        await azure_open_ai_client.close()


def extract_citations(citations: str) -> list:
    if citations.strip() == "":
        return []

    split_lines = citations.splitlines()
    formatted_split_lines = [
        splitLine.strip().upper().replace(" ", "") for splitLine in split_lines
    ]
    filtered_citations = [
        citation for citation in formatted_split_lines if citation != ""
    ]

    return filtered_citations


# Returns a dict of citations comparison { "correct_count": int, "correct_citations": list, "incorrect_count": int, "incorrect_citations": list, "missing_count": int, "missing_citations": list, "total_expected": int }
def compare_citations(expected: list, actual: list) -> dict:
    expected_set = set(expected)
    actual_set = set(actual)

    correct = expected_set & actual_set
    incorrect = actual_set - expected_set
    missing = expected_set - actual_set

    return {
        "actual_citations": actual,
        "expected_citations": expected,
        "correct_count": len(correct),
        "correct_citations": list(correct),
        "incorrect_count": len(incorrect),
        "incorrect_citations": list(incorrect),
        "missing_count": len(missing),
        "missing_citations": list(missing),
        "total_expected": len(expected_set),
    }


def generate_json_report(results: list):
    with open("results.json", "w") as file:
        json.dump(results, file)


def generate_csv_report(results: list):
    with open("results.csv", mode="w", newline="") as file:
        csv_writer = csv.writer(file)
        csv_writer.writerow(
            [
                "Question",
                "Successful",
                "Similarity Score",
                "Citation count",
                "Expected Citations",
                "Actual Citations",
                "Expected",
                "Actual",
            ]
        )

        for result in results:
            csv_writer.writerow(
                [
                    result["question"],
                    result["successful"],
                    result["score"],
                    f"{result['correct_count']}/{result['total_expected']}",
                    "\n".join(
                        [str(citations) for citations in result["expected_citations"]]
                    ),
                    "\n".join(
                        [str(citations) for citations in result["actual_citations"]]
                    ),
                    result["expected"],
                    result["answer"],
                ]
            )


async def main():
    data = parse_csv("goldenquestions.csv")
    results = []

    for index, record in enumerate(data):
        print(f"Processing question: {index + 1}/{len(data)}")

        try:
            response = await perform_backend_api_request(record["question"])

            if not response:
                raise Exception("Answer not found in API response")

            score = await evaluate(record["expected"], response["answer"])

            # Compare Citations
            expected_citations = extract_citations(record["citations"])
            citations_comparison = compare_citations(
                expected_citations, response["citations"]
            )

            results.append(
                {
                    "question": record["question"],
                    "successful": score > TESTER_SCORE_TARGET,
                    "score": score,
                    "expected": record["expected"],
                    "answer": response["answer"],
                    **citations_comparison,
                }
            )
        except Exception as e:
            print(e)
            results.append({"question": record["question"], "successful": False})
        finally:
            sleep(TESTER_TIMEOUT_SECONDS)  # Sleep for 5 seconds to avoid rate limiting

    generate_json_report(results)
    generate_csv_report(results)


asyncio.run(main())
