from datetime import datetime
from dateutil.relativedelta import relativedelta
from backend.annex.config import hansard_retriever_client, config
from backend.annex.state import AnnexState
from azure.search.documents.models import QueryType, VectorizableTextQuery
import logging


async def get_hansard_data(state: AnnexState) -> dict:
    """
    Retrieve relevant Hansard Contributions for the given MP using Azure Search with semantic search.

    Args:
        state (AnnexState): The current state of the workflow, containing the MP ID.

    Returns:
        dict: A dictionary containing the retrieved Hansard Contributions, to be stored in the state for downstream nodes.
    """

    try:
        query = config.hansard_retrieval_prompt

        vector_query = VectorizableTextQuery(
            text=query, fields="content_vector", k_nearest_neighbors=50, exhaustive=True
        )

        # Only looking at records from the last ANNEX_MONTHS_CUTOFF months to ensure relevance.
        date_cutoff = (
            datetime.now() - relativedelta(months=config.ANNEX_MONTHS_CUTOFF)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

        results = await hansard_retriever_client.search(
            search_text=query,
            query_type=QueryType.SEMANTIC,
            semantic_configuration_name=config.AZURE_SEARCH_SEMANTIC_CONFIG_HANSARD,
            top=10,
            vector_queries=[vector_query],
            filter=f"member_id eq {state.mp_id} and sitting_date ge {date_cutoff}",
        )

        hansard_data = [
            {
                "content": hit.get("content"),
                "member_id": hit.get("member_id"),
                "member_name": hit.get("member_name"),
                "section": hit.get("section"),
                "debate_section": hit.get("debate_section"),
                "sitting_date": hit.get("sitting_date"),
                "@search.score": hit.get("@search.score"),
                "@search.reranker_score": hit.get("@search.reranker_score"),
            }
            async for hit in results
        ]

        logging.info(
            f"Retrieved {len(hansard_data)} relevant chunks for Hansard Contributions with MP ID {state.mp_id}."
        )

        raw_error_messages = []
        public_error_messages = []
    except Exception as error:
        logging.error(f"Error retrieving Hansard data: {error}")
        hansard_data = []
        raw_error_messages = [str(error)]
        public_error_messages = ["Error retrieving Hansard data for the MP."]

    return {
        "hansard_data": hansard_data,
        "raw_error_messages": raw_error_messages,
        "public_error_messages": public_error_messages,
    }
