from functools import partial

from azure.search.documents.aio import SearchClient
from langchain_core.language_models import BaseChatModel
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph

from backend.graph.config import RagSettings, load_prompt
from backend.graph.nodes.generate_response import generate_response
from backend.graph.nodes.retrieve_documents import retrieve_documents
from backend.graph.nodes.rewrite_query import rewrite_query
from backend.graph.state import GraphState


def build_graph(
    model: BaseChatModel, search_client: SearchClient | None, settings: RagSettings
) -> CompiledStateGraph:
    graph = StateGraph(GraphState)
    graph.add_node(
        "rewrite_query",
        partial(
            rewrite_query,
            model=model,
            prompt=load_prompt("rewrite_query"),
            use_search=search_client is not None,
        ),
        metadata={"otel_trace": True},
    )
    graph.add_node(
        "retrieve_documents",
        partial(retrieve_documents, search_client=search_client, settings=settings),
        metadata={"otel_trace": True},
    )
    graph.add_node(
        "generate_response",
        partial(
            generate_response,
            model=model,
            prompt=load_prompt("grounding"),
            settings=settings,
        ),
        metadata={"otel_trace": True},
    )
    graph.add_edge(START, "rewrite_query")
    graph.add_edge("rewrite_query", "retrieve_documents")
    graph.add_edge("retrieve_documents", "generate_response")
    graph.add_edge("generate_response", END)
    return graph.compile()
