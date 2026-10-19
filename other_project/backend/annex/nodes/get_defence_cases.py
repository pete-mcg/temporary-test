from datetime import datetime
from dateutil.relativedelta import relativedelta
from backend.annex.config import previous_cases_retriever_client, config
from backend.annex.state import AnnexState
from azure.search.documents.models import QueryType, VectorizableTextQuery
import logging


async def get_defence_cases(state: AnnexState) -> dict:
    """
    Retrieve defence cases for the given MP using Azure Search.

    Args:
        state (AnnexState): The current state of the workflow, containing the MP ID.

    Returns:
        dict: A dictionary containing the retrieved defence cases data, to be stored in the state for downstream nodes.
    """

    try:
        query = config.defence_cases_retrieval_prompt

        vector_query = VectorizableTextQuery(
            text=query, fields="vector", k_nearest_neighbors=50, exhaustive=True
        )

        # Only looking at records from the last ANNEX_MONTHS_CUTOFF months to ensure relevance.
        date_cutoff = (
            datetime.now() - relativedelta(months=config.ANNEX_MONTHS_CUTOFF)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

        # Escape single quotes in MP name for OData filter (e.g., O'Brien -> O''Brien)
        escaped_mp_name = state.mp_name_display.replace("'", "''")

        results = await previous_cases_retriever_client.search(
            search_text=query,
            query_type=QueryType.SEMANTIC,
            semantic_configuration_name=config.AZURE_SEARCH_SEMANTIC_CONFIG_CORE,
            top=10,
            vector_queries=[vector_query],
            filter=f"""
            member_of_parliament eq '{escaped_mp_name}'
            and date_received ge {date_cutoff} and
            (case_type eq 'PQLW' or
            case_type eq 'PQLO' or
            case_type eq 'PQN' or
            case_type eq 'PQW' or
            case_type eq 'MC' or
            case_type eq 'MCSOS' or
            case_type eq 'POA')
            """,
        )

        cases_data = [
            {
                "case_title": hit.get("case_title"),
                "member_of_parliament": hit.get("member_of_parliament"),
                "case_type": hit.get("case_type"),
                "case_ref": hit.get("case_ref"),
                "date_received": hit.get("date_received"),
                "year": hit.get("year"),
                "@search.score": hit.get("@search.score"),
                "@search.reranker_score": hit.get("@search.reranker_score"),
            }
            async for hit in results
        ]

        # Sort by most recent first
        cases_data.sort(key=lambda x: x.get("date_received") or "", reverse=True)

        logging.info(
            f"Retrieved {len(cases_data)} relevant chunks for defence cases with MP name '{state.mp_name_display}'."
        )

        raw_error_messages = []
        public_error_messages = []
    except Exception as error:
        logging.error(f"Error retrieving defence cases data: {error}")
        cases_data = []
        raw_error_messages = [str(error)]
        public_error_messages = [
            "Error retrieving historic defence-related cases for the MP."
        ]

    return {
        "defence_cases_data": cases_data,
        "raw_error_messages": raw_error_messages,
        "public_error_messages": public_error_messages,
    }
