from typing import Any, Dict, List, Annotated
from pydantic import BaseModel, Field
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from operator import add


class AnnexState(BaseModel):
    """State definition for LangGraph, backed by a Pydantic model for type safety and validation."""

    # User Input
    mp_name_list: str = ""
    mp_question: str = ""

    # MP details
    mp_id: int = 0
    mp_name_display: str = ""

    # LLM generated cases search query
    cases_search_query: str = ""

    # Fetched data from various sources
    cosmos_data: Dict[str, Any] = Field(default_factory=dict)
    hansard_data: List[Dict[str, Any]] = Field(default_factory=list)
    defence_cases_data: List[Dict[str, Any]] = Field(default_factory=list)
    foi_cases_data: List[Dict[str, Any]] = Field(default_factory=list)
    pq_cases_data: List[Dict[str, Any]] = Field(default_factory=list)
    mc_cases_data: List[Dict[str, Any]] = Field(default_factory=list)
    to_cases_data: List[Dict[str, Any]] = Field(default_factory=list)

    # Error messages that can be surfaced to the user
    raw_error_messages: Annotated[List[str], add] = Field(default_factory=list)
    public_error_messages: Annotated[List[str], add] = Field(default_factory=list)

    # System Prompt, Human Message, and Assistant Message
    messages: Annotated[List[BaseMessage], add_messages] = Field(default_factory=list)
