from langgraph.graph import StateGraph, START, END
from backend.annex.state import AnnexState

from backend.annex.nodes.get_cosmos_data import get_cosmos_data
from backend.annex.nodes.get_hansard_data import get_hansard_data
from backend.annex.nodes.generate_response import generate_response
from backend.annex.nodes.get_defence_cases import get_defence_cases
from backend.annex.nodes.get_cases_data import (
    get_foi_cases,
    get_pq_cases,
    get_mc_cases,
    get_to_cases,
)
from backend.annex.nodes.generate_cases_query import generate_cases_query


def build_graph() -> StateGraph:
    """Build and return the graph"""

    # Initialise the graph
    graph = StateGraph(AnnexState)

    # Add nodes
    graph.add_node("get_cosmos_data", get_cosmos_data)
    graph.add_node("get_hansard_data", get_hansard_data)
    graph.add_node("get_defence_cases", get_defence_cases)
    graph.add_node("get_foi_cases", get_foi_cases)
    graph.add_node("get_pq_cases", get_pq_cases)
    graph.add_node("get_mc_cases", get_mc_cases)
    graph.add_node("get_to_cases", get_to_cases)
    graph.add_node("generate_cases_query", generate_cases_query)
    graph.add_node("generate_response", generate_response)

    # Edges — fan-out from START into parallel branches
    graph.add_edge(START, "get_cosmos_data")
    graph.add_edge(START, "generate_cases_query")
    graph.add_edge("generate_cases_query", "get_foi_cases")
    graph.add_edge("generate_cases_query", "get_pq_cases")
    graph.add_edge("generate_cases_query", "get_mc_cases")
    graph.add_edge("generate_cases_query", "get_to_cases")

    # get_cosmos_data fans out into two further parallel branches
    graph.add_edge("get_cosmos_data", "get_hansard_data")
    graph.add_edge("get_cosmos_data", "get_defence_cases")

    # All six parallel branches fan-in to generate_response
    graph.add_edge(
        [
            "get_hansard_data",
            "get_defence_cases",
            "get_foi_cases",
            "get_pq_cases",
            "get_mc_cases",
            "get_to_cases",
        ],
        "generate_response",
    )

    graph.add_edge("generate_response", END)

    # Compile the graph
    app = graph.compile()

    return app
