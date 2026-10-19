from azure.search.documents.aio import SearchClient
from azure.search.documents.models import VectorizableTextQuery

from backend.graph.config import RagSettings, SearchQueryType
from backend.graph.state import Citation, GraphState
from backend.utils import parse_multi_columns


def search_arguments(state: GraphState, settings: RagSettings) -> dict[str, object]:
    query_type = settings.query_type
    arguments = {
        "search_text": state.query,
        "query_type": "simple",
        "top": settings.azure_search_top_k,
        "filter": state.search_filter,
        "select": list(
            dict.fromkeys(
                [
                    *parse_multi_columns(settings.azure_search_content_columns),
                    settings.azure_search_title_column,
                    settings.azure_search_filename_column,
                    settings.azure_search_url_column,
                ]
            )
        ),
    }
    if query_type in (SearchQueryType.SEMANTIC, SearchQueryType.VECTOR_SEMANTIC_HYBRID):
        arguments["query_type"] = "semantic"
        arguments["semantic_configuration_name"] = (
            settings.azure_search_semantic_search_config
        )
    if query_type == SearchQueryType.VECTOR:
        arguments["search_text"] = None
    if query_type in (
        SearchQueryType.VECTOR,
        SearchQueryType.VECTOR_SIMPLE_HYBRID,
        SearchQueryType.VECTOR_SEMANTIC_HYBRID,
    ):
        arguments["vector_queries"] = [
            VectorizableTextQuery(
                text=state.query,
                fields=",".join(
                    parse_multi_columns(settings.azure_search_vector_columns)
                ),
                k_nearest_neighbors=max(50, settings.azure_search_top_k),
            )
        ]
        arguments["vector_filter_mode"] = "preFilter"
    return arguments


def citation_from_document(
    document: dict[str, object], position: int, settings: RagSettings
) -> Citation:
    content = "\n\n".join(
        document.get(column) or ""
        for column in parse_multi_columns(settings.azure_search_content_columns)
    )
    return Citation.model_validate(
        {
            "content": content,
            "title": document.get(settings.azure_search_title_column),
            "filepath": document.get(settings.azure_search_filename_column),
            "url": document.get(settings.azure_search_url_column),
            "chunk_id": str(position),
        }
    )


async def retrieve_documents(
    state: GraphState, *, search_client: SearchClient | None, settings: RagSettings
) -> dict[str, list[Citation]]:
    if search_client is None:
        return {"citations": []}
    if settings.azure_search_permitted_groups_column and not state.search_filter:
        raise ValueError("Document-level access control requires a permission filter.")

    results = await search_client.search(**search_arguments(state, settings))
    citations = []
    async for document in results:
        citations.append(citation_from_document(document, len(citations), settings))
    return {"citations": citations}
