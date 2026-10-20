import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import aclosing
from dataclasses import dataclass, field

from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.runnables import RunnableConfig
from langgraph.graph.state import CompiledStateGraph

from backend.graph.config import RagSettings
from backend.graph.state import ChatRequest, Citation, GenerationSettings, GraphState
from backend.utils import parse_multi_columns


@dataclass(frozen=True)
class ResponseEnvelope:
    model: str
    history_metadata: dict[str, object]
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    created: int = field(default_factory=lambda: int(time.time()))

    def format(
        self, messages: list[dict[str, str]], *, streaming: bool
    ) -> dict[str, object]:
        return {
            "id": self.id,
            "model": self.model,
            "created": self.created,
            "object": "chat.completion.chunk" if streaming else "chat.completion",
            "choices": [{"messages": messages}],
            "history_metadata": self.history_metadata,
        }


def prepare_state(
    request: ChatRequest, settings: RagSettings, search_filter: str | None
) -> GraphState:
    model = settings.azure_openai_model
    temperature = settings.azure_openai_temperature
    system_message = settings.azure_openai_system_message
    if request.settings:
        # RAG has always used the configured deployment; plain chat honors GPT4.
        if request.settings.models.GPT4 and not settings.search_enabled:
            model = "gpt-4-turbo"
        if request.settings.temperature is not None:
            temperature = request.settings.temperature
        if request.settings.systemMessage is not None:
            system_message = request.settings.systemMessage

    return GraphState(
        messages=request.messages,
        search_filter=search_filter,
        generation=GenerationSettings(
            model=model,
            temperature=temperature,
            system_message=system_message,
            max_tokens=settings.azure_openai_max_tokens,
            top_p=settings.azure_openai_top_p,
            stop=(
                parse_multi_columns(settings.azure_openai_stop_sequence)
                if settings.azure_openai_stop_sequence
                else None
            ),
        ),
    )


def citation_message(citations: list[Citation], query: str) -> dict[str, str]:
    return {
        "role": "tool",
        "content": json.dumps(
            {
                "citations": [citation.model_dump() for citation in citations],
                "intent": query,
            }
        ),
    }


def trace_config(request: ChatRequest) -> RunnableConfig:
    conversation_id = request.history_metadata.get("conversation_id")
    if isinstance(conversation_id, str) and conversation_id:
        return {"metadata": {"conversation_id": conversation_id}}
    return {}


async def complete_graph(
    graph: CompiledStateGraph,
    request: ChatRequest,
    settings: RagSettings,
    search_filter: str | None = None,
) -> dict[str, object]:
    state = prepare_state(request, settings, search_filter)
    result = GraphState.model_validate(
        await graph.ainvoke(state.model_dump(), config=trace_config(request))
    )
    messages = []
    if settings.search_enabled:
        messages.append(citation_message(result.citations, result.query))
    messages.append({"role": "assistant", "content": result.answer})
    envelope = ResponseEnvelope(state.generation.model, request.history_metadata)
    return envelope.format(messages, streaming=False)


async def stream_graph(
    graph: CompiledStateGraph,
    request: ChatRequest,
    settings: RagSettings,
    search_filter: str | None = None,
) -> AsyncIterator[dict[str, object]]:
    state = prepare_state(request, settings, search_filter)
    envelope = ResponseEnvelope(state.generation.model, request.history_metadata)
    query = state.question
    emitted_event = False
    streamed_answer = False
    events = graph.astream(
        state.model_dump(),
        config=trace_config(request),
        stream_mode=["messages", "updates"],
    )
    try:
        async with aclosing(events):
            async for mode, data in events:
                if mode == "messages":
                    message, metadata = data
                    if metadata.get("langgraph_node") != "generate_response":
                        continue
                    if (
                        isinstance(message, (AIMessage, AIMessageChunk))
                        and message.text
                    ):
                        emitted_event = True
                        streamed_answer = True
                        yield envelope.format(
                            [{"role": "assistant", "content": message.text}],
                            streaming=True,
                        )
                    continue

                if "rewrite_query" in data:
                    query = data["rewrite_query"]["query"]
                if "retrieve_documents" in data and settings.search_enabled:
                    citations = data["retrieve_documents"]["citations"]
                    emitted_event = True
                    yield envelope.format(
                        [citation_message(citations, query)], streaming=True
                    )
                if "generate_response" in data and not streamed_answer:
                    # A deterministic answer does not produce model token events.
                    emitted_event = True
                    yield envelope.format(
                        [
                            {
                                "role": "assistant",
                                "content": data["generate_response"]["answer"],
                            }
                        ],
                        streaming=True,
                    )
    except Exception as error:
        if not emitted_event:
            raise
        logging.exception("Exception while streaming the chat graph")
        yield {**envelope.format([], streaming=True), "error": str(error)}
