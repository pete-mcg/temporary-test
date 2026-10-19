from datetime import datetime
from dateutil.relativedelta import relativedelta
from backend.annex.config import previous_cases_retriever_client, config
from backend.annex.state import AnnexState
from azure.search.documents.models import QueryType, VectorizableTextQuery
import logging


async def get_cases(state: AnnexState, case_types: list[str]) -> dict:
    """
    Retrieve cases using Azure Search.

    Args:
        state (AnnexState): The current state of the workflow, containing the MP ID.
        case_types (list[str]): The case types to retrieve. e.g. ['FOI', 'PQLO', 'PQLW', 'PQN', 'PQO', 'PQW'].

    Returns:
        dict: A dictionary containing the retrieved cases data, to be stored in the state for downstream nodes.
    """

    try:
        query = state.cases_search_query

        vector_query = VectorizableTextQuery(
            text=query, fields="vector", k_nearest_neighbors=50, exhaustive=True
        )

        # Only looking at records from the last ANNEX_MONTHS_CUTOFF months to ensure relevance.
        date_cutoff = (
            datetime.now() - relativedelta(months=config.ANNEX_MONTHS_CUTOFF)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

        results = await previous_cases_retriever_client.search(
            search_text=query,
            query_type=QueryType.SEMANTIC,
            semantic_configuration_name=config.AZURE_SEARCH_SEMANTIC_CONFIG_CORE,
            top=5,
            vector_queries=[vector_query],
            filter=f"search.in(case_type, '{','.join(case_types)}', ',') and date_received ge {date_cutoff}",
        )

        cases_data = [
            {
                "content": hit.get("content"),
                "case_type": hit.get("case_type"),
                "case_ref": hit.get("case_ref"),
                "date_received": hit.get("date_received"),
                "case_title": hit.get("case_title"),
                "reporting_team": hit.get("reporting_team"),
                "@search.score": hit.get("@search.score"),
                "@search.reranker_score": hit.get("@search.reranker_score"),
            }
            async for hit in results
        ]

        logging.info(
            f"Retrieved {len(cases_data)} relevant chunks for case_types {case_types}."
        )
        raw_error_messages = []
        public_error_messages = []
    except Exception as error:
        logging.error(f"Error retrieving cases data: {error}")
        cases_data = []
        raw_error_messages = [str(error)]
        public_error_messages = [f"Error retrieving previous {case_types} cases."]

    if case_types == ["FOI"]:
        return {
            "foi_cases_data": cases_data,
            "raw_error_messages": raw_error_messages,
            "public_error_messages": public_error_messages,
        }
    elif case_types == ["PQLO", "PQLW", "PQN", "PQO", "PQW"]:
        return {
            "pq_cases_data": cases_data,
            "raw_error_messages": raw_error_messages,
            "public_error_messages": public_error_messages,
        }
    elif case_types == ["MC", "MCSOS", "POA"]:
        return {
            "mc_cases_data": cases_data,
            "raw_error_messages": raw_error_messages,
            "public_error_messages": public_error_messages,
        }
    elif case_types == ["TO"]:
        return {
            "to_cases_data": cases_data,
            "raw_error_messages": raw_error_messages,
            "public_error_messages": public_error_messages,
        }
    else:
        logging.warning(
            f"Unexpected case types: {case_types}. No data assigned to state."
        )
        return {
            "public_error_messages": [
                f"Unexpected case types: {case_types}. No data retrieved."
            ],
            "raw_error_messages": raw_error_messages,
        }


async def get_foi_cases(state: AnnexState) -> dict:
    """Retrieve FOI cases."""
    return await get_cases(state, ["FOI"])


async def get_pq_cases(state: AnnexState) -> dict:
    """Retrieve PQ cases."""
    return await get_cases(state, ["PQLO", "PQLW", "PQN", "PQO", "PQW"])


async def get_mc_cases(state: AnnexState) -> dict:
    """Retrieve MC cases."""
    return await get_cases(state, ["MC", "MCSOS", "POA"])


async def get_to_cases(state: AnnexState) -> dict:
    """Retrieve TO cases."""
    return await get_cases(state, ["TO"])
