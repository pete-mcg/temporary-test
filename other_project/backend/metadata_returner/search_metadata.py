import os
import logging
import asyncio
from typing import List, Dict, Any
from datetime import datetime
from dateutil.relativedelta import relativedelta
from azure.search.documents.aio import SearchClient
from azure.search.documents.models import QueryType, VectorizableTextQuery
from backend.azure_identity import get_azure_credential
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# Azure Search configuration
AZURE_SEARCH_SERVICE = os.environ.get("AZURE_SEARCH_SERVICE")
AZURE_SEARCH_INDEX_CORE = os.environ.get("AZURE_SEARCH_INDEX_CORE")
AZURE_SEARCH_SEMANTIC_CONFIG_CORE = os.environ.get("AZURE_SEARCH_SEMANTIC_CONFIG_CORE")
AZURE_SEARCH_SCORE_THRESHOLD_FIND_ALL = float(
    os.environ.get("AZURE_SEARCH_SCORE_THRESHOLD_FIND_ALL", 1.8)
)

# Azure Search result field names
SEARCH_SCORE_FIELD = "@search.score"
SEARCH_RERANKER_SCORE_FIELD = "@search.reranker_score"


def _validate_search_inputs(query: str, case_types: List[str]) -> Dict[str, Any]:
    """Validate search inputs and return error dict if validation fails, None if valid."""
    if not AZURE_SEARCH_SERVICE or not AZURE_SEARCH_INDEX_CORE:
        error_msg = "Azure Search configuration is missing"
        logger.error(error_msg)
        return {
            "grouped_metadata": {},
            "raw_error_messages": [error_msg],
            "public_error_messages": ["Search service configuration error."],
        }

    if not case_types:
        logger.warning("No case types provided")
        return {
            "grouped_metadata": {},
            "raw_error_messages": ["No case types provided"],
            "public_error_messages": ["Please select at least one case type."],
        }

    if not query or not query.strip():
        return {
            "grouped_metadata": {},
            "raw_error_messages": ["Empty query provided"],
            "public_error_messages": ["Please provide a search query."],
        }

    return None


def _build_date_filter(months_cutoff: int = None) -> str:
    """Build date filter string for Azure Search query."""
    base_filter = "(guidance ne 'true')"
    if months_cutoff:
        date_cutoff = (datetime.now() - relativedelta(months=months_cutoff)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        base_filter += f" and date_received ge {date_cutoff}"
    return base_filter


def _extract_result_metadata(result: Dict[str, Any]) -> Dict[str, Any]:
    """Extract metadata fields from a search result."""
    return {
        "case_ref": result.get("case_ref"),
        "case_type": result.get("case_type"),
        "case_title": result.get("case_title"),
        "date_received": result.get("date_received"),
        "reporting_team": result.get("reporting_team"),
        SEARCH_SCORE_FIELD: result.get(SEARCH_SCORE_FIELD),
        SEARCH_RERANKER_SCORE_FIELD: result.get(SEARCH_RERANKER_SCORE_FIELD),
    }


async def _filter_by_reranker_score(results, threshold: float) -> List[Dict[str, Any]]:
    """Filter results by best available search score and extract metadata."""
    filtered_results = []
    async for result in results:
        score = result.get(SEARCH_RERANKER_SCORE_FIELD)
        if score is None:
            score = result.get(SEARCH_SCORE_FIELD)

        if score is not None and score >= threshold:
            filtered_results.append(_extract_result_metadata(result))
    return filtered_results


def _deduplicate_by_case_ref(
    results: List[Dict[str, Any]], max_results: int = 100
) -> List[Dict[str, Any]]:
    """Deduplicate results by case_ref, keeping the first (highest scoring) occurrence."""
    seen_case_refs = set()
    deduplicated = []
    for result in results:
        case_ref = result.get("case_ref")
        if case_ref and case_ref not in seen_case_refs:
            seen_case_refs.add(case_ref)
            deduplicated.append(result)
            if len(deduplicated) >= max_results:
                break
    return deduplicated


def _get_query_type() -> QueryType:
    """Get query type based on semantic configuration availability."""
    return QueryType.SEMANTIC if AZURE_SEARCH_SEMANTIC_CONFIG_CORE else QueryType.SIMPLE


async def _search_single_case_type(
    search_client: SearchClient,
    query: str,
    case_type: str,
    base_filter: str,
) -> tuple[str, List[Dict[str, Any]]]:
    """Search for a specific case type and return filtered, deduplicated results."""
    filter_query = f"case_type eq '{case_type}' and {base_filter}"

    vector_query = VectorizableTextQuery(
        text=query,
        fields="vector",
        k_nearest_neighbors=100,
        exhaustive=True,
    )

    logger.info(f"Searching {case_type} with filter: {filter_query}")

    results = await search_client.search(
        search_text=query,
        query_type=_get_query_type(),
        semantic_configuration_name=AZURE_SEARCH_SEMANTIC_CONFIG_CORE,
        filter=filter_query,
        select=[
            "case_ref",
            "case_type",
            "case_title",
            "date_received",
            "reporting_team",
        ],
        top=250,
        vector_queries=[vector_query] if vector_query else None,
    )

    # Collect and filter results
    case_type_results = await _filter_by_reranker_score(
        results, AZURE_SEARCH_SCORE_THRESHOLD_FIND_ALL
    )

    # Deduplicate
    deduplicated_results = _deduplicate_by_case_ref(case_type_results, max_results=100)

    return (case_type, deduplicated_results)


async def search_metadata_by_query(
    query: str, case_types: List[str], months_cutoff: int = None, top: int = 10
) -> Dict[str, Any]:
    """
    Perform vector/semantic search and return metadata for matching cases, grouped by case type.

    This function uses the same search logic as the conversation endpoint,
    but returns only metadata instead of generating LLM responses. Results are grouped
    by case type with the top 10 most relevant results per type.

    Args:
        query (str): The search query from the user
        case_types (List[str]): List of case types to search (e.g., ['FOI', 'PQLO', 'MC', 'TO'])
        months_cutoff (int, optional): Only return cases from the last N months
        top (int): Maximum number of results to return per case type. Default is 10.

    Returns:
        Dict[str, Any]: Dictionary containing:
            - grouped_metadata: Dict with case types as keys and lists of metadata as values
            - raw_error_messages: List of raw error messages (if any)
            - public_error_messages: List of user-friendly error messages (if any)
    """
    validation_error = _validate_search_inputs(query, case_types)
    if validation_error:
        return validation_error

    try:
        endpoint = f"https://{AZURE_SEARCH_SERVICE}.search.windows.net"
        credential = get_azure_credential()
        search_client = SearchClient(
            endpoint=endpoint, index_name=AZURE_SEARCH_INDEX_CORE, credential=credential
        )

        try:
            base_filter = _build_date_filter(months_cutoff)

            # Execute all searches in parallel
            logger.info(f"Executing parallel searches for {len(case_types)} case types")
            search_tasks = [
                _search_single_case_type(search_client, query, ct, base_filter)
                for ct in case_types
            ]
            search_results = await asyncio.gather(*search_tasks)

            # Build grouped metadata, taking top N per type
            grouped_metadata = {
                case_type: results[:top] for case_type, results in search_results
            }

            total_results = sum(len(results) for results in grouped_metadata.values())
            logger.info(
                f"Retrieved {total_results} high-quality metadata records (reranker score >= {AZURE_SEARCH_SCORE_THRESHOLD_FIND_ALL}) grouped into {len(grouped_metadata)} case types for query: '{query}'"
            )

            return {
                "grouped_metadata": grouped_metadata,
                "raw_error_messages": [],
                "public_error_messages": [],
            }
        finally:
            await search_client.close()

    except Exception as error:
        logger.error(f"Error retrieving metadata by query: {error}")
        return {
            "grouped_metadata": {},
            "raw_error_messages": [str(error)],
            "public_error_messages": [
                "An error has occurred and the metadata could not be retrieved for this query. This may be because the session or your authentication token has timed out. Please refresh the page and try again. If the problem persists, please use the feedback form to raise a performance related issue providing the details of your query and the resulting error."
            ],
        }
