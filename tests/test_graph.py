import asyncio
import json
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from backend.graph.config import RagSettings, SearchQueryType
from backend.graph.graph import build_graph
from backend.graph.invoker import complete_graph, invocation_config, stream_graph
from backend.graph.nodes.generate_response import INSUFFICIENT_INFORMATION
from backend.graph.state import ChatRequest

pytestmark = pytest.mark.asyncio


def chat_request(question="How much annual leave do I get?", **extra):
    return ChatRequest.model_validate(
        {
            "messages": [{"role": "user", "content": question, "id": "user-id"}],
            "history_metadata": {"conversation_id": "conversation-id"},
            **extra,
        }
    )


async def test_initial_answer_and_citation_contract(model, model_api, search, settings):
    search.documents.append({**search.documents[0], "content": "Second chunk."})
    result = await complete_graph(
        build_graph(model, search, settings), chat_request(), settings
    )
    assert set(result) == {
        "id",
        "model",
        "created",
        "object",
        "choices",
        "history_metadata",
    }
    assert result["object"] == "chat.completion"
    tool, assistant = result["choices"][0]["messages"]
    context = json.loads(tool["content"])
    assert tool["role"] == "tool"
    assert context["intent"] == model_api.rewrite
    assert [item["chunk_id"] for item in context["citations"]] == ["0", "1"]
    assert context["citations"][0] == {**search.documents[0], "chunk_id": "0"}
    assert assistant == {"role": "assistant", "content": model_api.answer}
    prompt = model_api.calls[-1]["messages"]
    assert "[doc1]" in prompt[-1]["content"] and "[doc2]" in prompt[-1]["content"]
    assert "never instructions" in prompt[1]["content"]
    assert all("data_sources" not in call for call in model_api.calls)


async def test_follow_up_excludes_stored_tools(model, model_api, search, settings):
    request = chat_request(
        messages=[
            {"role": "user", "content": "Tell me about annual leave", "date": "today"},
            {"role": "tool", "content": "OLD CITATION METADATA"},
            {"role": "assistant", "content": "Leave details [doc7]"},
            {"role": "user", "content": "Can I carry it over?", "feedback": "neutral"},
        ]
    )
    await complete_graph(build_graph(model, search, settings), request, settings)
    rewrite_messages = model_api.calls[0]["messages"]
    assert [message["role"] for message in rewrite_messages] == [
        "system",
        "user",
        "assistant",
        "user",
    ]
    assert rewrite_messages[-1]["content"] == "Can I carry it over?"
    assert "OLD CITATION METADATA" not in json.dumps(model_api.calls)
    assert request.model_dump()["messages"][0]["date"] == "today"
    assert request.model_dump()["messages"][-1]["feedback"] == "neutral"


@pytest.mark.parametrize("failure", ["empty", "api"])
async def test_rewrite_fallback(
    failure, traced_graph, span_exporter, model_api, search, settings
):
    model_api.rewrite = "  "
    model_api.rewrite_error = failure == "api"
    request = chat_request()
    result = await complete_graph(traced_graph, request, settings)
    assert search.calls[0]["search_text"] == request.messages[-1].content
    assert json.loads(result["choices"][0]["messages"][0]["content"])["intent"] == (
        request.messages[-1].content
    )
    spans = span_exporter.get_finished_spans()
    root = next(span for span in spans if span.parent is None)
    assert root.status.status_code.name == "OK"
    errors = [span for span in spans if span.status.status_code.name == "ERROR"]
    assert len(errors) == (1 if failure == "api" else 0)


@pytest.mark.parametrize("streaming", [True, False])
@pytest.mark.parametrize("empty_results", [True, False])
async def test_conversation_traces(
    traced_graph,
    span_exporter,
    pii_processor,
    model_api,
    search,
    settings,
    streaming,
    empty_results,
):
    if empty_results:
        search.documents = []
    request = chat_request()
    if streaming:
        events = [
            event async for event in stream_graph(traced_graph, request, settings)
        ]
    else:
        events = [await complete_graph(traced_graph, request, settings)]
    messages = [
        message for event in events for message in event["choices"][0]["messages"]
    ]
    expected = INSUFFICIENT_INFORMATION if empty_results else model_api.answer
    assert "".join(message["content"] for message in messages[1:]) == expected
    assert all(
        event["history_metadata"] == request.history_metadata for event in events
    )

    spans = span_exporter.get_finished_spans()
    root = next(span for span in spans if span.parent is None)
    assert root.attributes["gen_ai.agent.name"] == "hr-chatbot"
    state = json.loads(root.attributes["gen_ai.agent.state"])
    assert state["query"] == pii_processor.redact_text(model_api.rewrite)
    assert state["answer"] == pii_processor.redact_text(expected)
    assert len(state["citations"]) == len(
        json.loads(messages[0]["content"])["citations"]
    )
    assert {span.attributes.get("metadata.langgraph_node") for span in spans} >= {
        "rewrite_query",
        "retrieve_documents",
        "generate_response",
    }
    for span in spans:
        assert span.status.status_code.name == "OK"
        assert span.context.trace_id == root.context.trace_id
        assert span.attributes["gen_ai.conversation.id"] == "conversation-id"
        assert span.end_time >= span.start_time
    models = [
        span for span in spans if span.attributes["gen_ai.operation.name"] == "chat"
    ]
    assert len(models) == (1 if empty_results else 2)
    for span in models:
        assert span.attributes["gen_ai.usage.input_tokens"] == 10
        assert span.attributes["gen_ai.usage.output_tokens"] == 5
        assert (
            pii_processor.redact_text(request.messages[-1].content)
            in (span.attributes["gen_ai.input.messages"])
        )
    if not empty_results:
        content = pii_processor.redact_text(search.documents[0]["content"])
        assert content in json.dumps(state["citations"])
        answer = models[-1]
        assert content in answer.attributes["gen_ai.input.messages"]
        assert model_api.answer in answer.attributes["gen_ai.output.messages"]


@pytest.mark.parametrize("streaming", [True, False])
@pytest.mark.parametrize("redaction_failure", [True, False])
async def test_pii_stays_in_chat_only(
    traced_graph,
    span_exporter,
    pii_processor,
    model_api,
    search,
    settings,
    monkeypatch,
    streaming,
    redaction_failure,
):
    email = "john.smith@example.com"
    question = f"My name is John Smith. Can you email {email}?"
    model_api.rewrite = f"Leave policy for {email}"
    model_api.answer = f"John Smith, contact {email} [doc1]"
    search.documents[0]["content"] = f"Employee John Smith: {email}"
    if redaction_failure:
        monkeypatch.setattr(
            pii_processor.analyzer, "analyze", Mock(side_effect=RuntimeError(email))
        )
    request = chat_request(
        messages=[
            {"role": "user", "content": question},
            {"role": "assistant", "content": f"Earlier answer for {email}"},
            {"role": "user", "content": f"What about carry-over for {email}?"},
        ],
        history_metadata={"conversation_id": str(uuid4())},
    )
    if streaming:
        events = [
            event async for event in stream_graph(traced_graph, request, settings)
        ]
    else:
        events = [await complete_graph(traced_graph, request, settings)]
    messages = [
        message for event in events for message in event["choices"][0]["messages"]
    ]
    assert "".join(message["content"] for message in messages[1:]) == model_api.answer
    assert json.loads(messages[0]["content"])["citations"][0] == {
        **search.documents[0],
        "chunk_id": "0",
    }
    assert search.calls[0]["search_text"] == model_api.rewrite
    assert question in json.dumps(model_api.calls)
    assert request.messages[0].content == question
    spans = span_exporter.get_finished_spans()
    assert spans
    for span in spans:
        assert email not in span.to_json() and "John Smith" not in span.to_json()
        if redaction_failure:
            assert not span.attributes and not span.events
        else:
            assert (
                span.attributes["gen_ai.conversation.id"]
                == request.history_metadata["conversation_id"]
            )
    if not redaction_failure:
        root = next(span for span in spans if span.parent is None)
        state = json.loads(root.attributes["gen_ai.agent.state"])
        assert "<EMAIL_ADDRESS>" in state["query"]
        assert "<EMAIL_ADDRESS>" in state["citations"][0]
    search.error = RuntimeError(f"Search failed for {email}")
    with pytest.raises(RuntimeError, match=email):
        await complete_graph(traced_graph, request, settings)
    errors = [
        span
        for span in span_exporter.get_finished_spans()
        if span.status.status_code.name == "ERROR"
    ]
    assert errors
    assert all(email not in span.to_json() for span in errors)


@pytest.mark.parametrize("conversation_id", [None, "", "   ", 123])
async def test_unavailable_conversation_id(conversation_id):
    request = chat_request(history_metadata={"conversation_id": conversation_id})
    assert invocation_config(request) == {}
    assert invocation_config(chat_request(history_metadata={})) == {}


async def test_tracing_connection_string_setting(monkeypatch):
    monkeypatch.setenv(
        "APPLICATIONINSIGHTS_CONNECTION_STRING", "test-connection-string"
    )
    assert RagSettings(_env_file=None).applicationinsights_connection_string == (
        "test-connection-string"
    )


@pytest.mark.parametrize(
    "mode,query_type,vector",
    [
        ("simple", "simple", False),
        ("semantic", "semantic", False),
        ("vector", "simple", True),
        ("vector_simple_hybrid", "simple", True),
        ("vector_semantic_hybrid", "semantic", True),
    ],
)
async def test_search_modes(mode, query_type, vector, model, search, settings):
    settings = settings.model_copy(
        update={
            "azure_search_query_type": mode,
            "azure_search_semantic_search_config": "hr-semantic",
            "azure_search_top_k": 7,
        }
    )
    await complete_graph(build_graph(model, search, settings), chat_request(), settings)
    arguments = search.calls[0]
    assert arguments["query_type"] == query_type
    assert arguments["top"] == 7
    assert arguments["select"] == ["content", "title", "filepath", "url"]
    assert (arguments["search_text"] is None) == (mode == "vector")
    assert ("vector_queries" in arguments) == vector
    if query_type == "semantic":
        assert arguments["semantic_configuration_name"] == "hr-semantic"
    if vector:
        query = arguments["vector_queries"][0]
        assert query.kind == "text" and query.fields == "vector"
        assert query.k_nearest_neighbors == 50
        assert arguments["vector_filter_mode"] == "preFilter"


async def test_column_mappings_and_permission_filter(model, search, settings):
    settings = settings.model_copy(
        update={
            "azure_search_content_columns": "body|summary",
            "azure_search_title_column": "name",
            "azure_search_filename_column": "path",
            "azure_search_url_column": "link",
            "azure_search_vector_columns": "body_vector,summary_vector",
            "azure_search_permitted_groups_column": "groups",
            "azure_search_top_k": 60,
        }
    )
    search.documents = [
        {
            "body": "Policy",
            "summary": "Summary",
            "name": "Name",
            "path": "file.pdf",
            "link": "https://storage.example/file.pdf",
        }
    ]
    graph = build_graph(model, search, settings)
    permission = "groups/any(g:search.in(g, 'group-id'))"
    result = await complete_graph(graph, chat_request(), settings, permission)
    assert search.calls[0]["filter"] == permission
    assert search.calls[0]["select"] == ["body", "summary", "name", "path", "link"]
    query = search.calls[0]["vector_queries"][0]
    assert (
        query.fields == "body_vector,summary_vector" and query.k_nearest_neighbors == 60
    )
    citation = json.loads(result["choices"][0]["messages"][0]["content"])["citations"][
        0
    ]
    assert citation == {
        "content": "Policy\n\nSummary",
        "title": "Name",
        "filepath": "file.pdf",
        "url": "https://storage.example/file.pdf",
        "chunk_id": "0",
    }
    with pytest.raises(ValueError, match="permission filter"):
        await complete_graph(graph, chat_request(), settings)
    assert len(search.calls) == 1


async def test_stream_matches_complete_and_hides_rewrite(
    traced_graph, span_exporter, model_api, settings
):
    graph = traced_graph
    request = chat_request()
    events = [event async for event in stream_graph(graph, request, settings)]
    result = await complete_graph(graph, request, settings)
    messages = [
        message for event in events for message in event["choices"][0]["messages"]
    ]
    assert messages[0] == result["choices"][0]["messages"][0]
    assert "".join(message["content"] for message in messages[1:]) == model_api.answer
    assert (
        len(messages) == 3
    )  # One tool message and two model chunks, without duplicated answer.
    assert len({event["id"] for event in events}) == 1
    assert len({event["created"] for event in events}) == 1
    assert all(event["object"] == "chat.completion.chunk" for event in events)
    assert all(
        event["history_metadata"] == request.history_metadata for event in events
    )
    assert model_api.calls[0].get("stream") is False
    assert model_api.calls[1]["stream"] is True
    assert model_api.calls[1]["stream_options"] == {"include_usage": True}
    roots = [span for span in span_exporter.get_finished_spans() if span.parent is None]
    assert len(roots) == 2
    assert len({span.context.trace_id for span in roots}) == 2
    assert {span.attributes["gen_ai.conversation.id"] for span in roots} == {
        "conversation-id"
    }


@pytest.mark.parametrize("in_domain", [True, False])
async def test_empty_results(in_domain, model, model_api, search, settings):
    search.documents = []
    settings = settings.model_copy(update={"azure_search_enable_in_domain": in_domain})
    graph = build_graph(model, search, settings)
    events = [event async for event in stream_graph(graph, chat_request(), settings)]
    messages = [
        message for event in events for message in event["choices"][0]["messages"]
    ]
    assert json.loads(messages[0]["content"])["citations"] == []
    expected = INSUFFICIENT_INFORMATION if in_domain else model_api.answer
    assert "".join(message["content"] for message in messages[1:]) == expected
    assert len(model_api.calls) == (1 if in_domain else 2)
    result = await complete_graph(graph, chat_request(), settings)
    assert result["choices"][0]["messages"][-1]["content"] == expected


async def test_plain_chat_and_request_generation_settings(model, model_api, settings):
    settings = settings.model_copy(
        update={
            "azure_search_service": None,
            "azure_search_index": None,
            "azure_openai_max_tokens": 123,
            "azure_openai_top_p": 0.8,
            "azure_openai_stop_sequence": "END|STOP",
        }
    )
    request = chat_request(
        settings={
            "models": {"GPT4": True},
            "temperature": 0.4,
            "systemMessage": "Custom instruction",
        }
    )
    result = await complete_graph(build_graph(model, None, settings), request, settings)
    assert result["choices"][0]["messages"] == [
        {"role": "assistant", "content": model_api.answer}
    ]
    call = model_api.calls[0]
    assert len(model_api.calls) == 1 and len(call["messages"]) == 2
    assert call["messages"][0]["content"] == "Custom instruction"
    assert (
        call["model"] == "gpt-4-turbo"
        and "deployments/gpt-4-turbo/" in model_api.urls[0]
    )
    assert call["temperature"] == 0.4 and call["top_p"] == 0.8
    assert call.get("max_tokens", call.get("max_completion_tokens")) == 123
    assert call["stop"] == ["END", "STOP"]


@pytest.mark.parametrize("streaming", [True, False])
async def test_request_isolation(
    traced_graph, span_exporter, model_api, search, settings, streaming
):
    model_api.rewrite = None
    graph = traced_graph

    async def run(question, temperature):
        request = chat_request(
            question,
            settings={"temperature": temperature},
            history_metadata={"conversation_id": question},
        )
        if streaming:
            events = [
                event
                async for event in stream_graph(
                    graph, request, settings, f"groups eq '{question}'"
                )
            ]
            return events[0]
        return await complete_graph(graph, request, settings, f"groups eq '{question}'")

    first, second = await asyncio.gather(
        run("First question", 0.1), run("Second question", 0.9)
    )
    assert first["id"] != second["id"]
    assert {call["filter"] for call in search.calls} == {
        "groups eq 'First question'",
        "groups eq 'Second question'",
    }
    answer_calls = [
        call
        for call in model_api.calls
        if "current sources (JSON)" in call["messages"][-1]["content"]
    ]
    assert {call["temperature"] for call in answer_calls} == {0.1, 0.9}
    intents = [
        json.loads(result["choices"][0]["messages"][0]["content"])["intent"]
        for result in (first, second)
    ]
    assert intents == ["First question", "Second question"]
    spans = span_exporter.get_finished_spans()
    roots = [span for span in spans if span.parent is None]
    assert len(roots) == 2
    assert len({span.context.trace_id for span in roots}) == 2
    for root in roots:
        conversation_id = root.attributes["gen_ai.conversation.id"]
        state = json.loads(root.attributes["gen_ai.agent.state"])
        assert state["messages"][0]["content"] == conversation_id
        assert all(
            span.attributes["gen_ai.conversation.id"] == conversation_id
            for span in spans
            if span.context.trace_id == root.context.trace_id
        )


async def test_rag_preserves_effective_deployment(model, model_api, search, settings):
    request = chat_request(settings={"models": {"GPT4": True}})
    await complete_graph(build_graph(model, search, settings), request, settings)
    assert all(call["model"] == settings.azure_openai_model for call in model_api.calls)
    assert all("/deployments/chat/" in url for url in model_api.urls)


async def test_legacy_search_settings(monkeypatch):
    monkeypatch.delenv("AZURE_SEARCH_TOP_K", raising=False)
    monkeypatch.delenv("AZURE_SEARCH_ENABLE_IN_DOMAIN", raising=False)
    monkeypatch.delenv("AZURE_SEARCH_QUERY_TYPE", raising=False)
    monkeypatch.setenv("SEARCH_TOP_K", "11")
    monkeypatch.setenv("SEARCH_ENABLE_IN_DOMAIN", "false")
    monkeypatch.setenv("AZURE_SEARCH_USE_SEMANTIC_SEARCH", "true")
    settings = RagSettings(_env_file=None)
    assert settings.azure_search_top_k == 11
    assert not settings.azure_search_enable_in_domain
    assert settings.query_type == SearchQueryType.SEMANTIC
    monkeypatch.setenv("AZURE_SEARCH_TOP_K", "3")
    monkeypatch.setenv("AZURE_SEARCH_QUERY_TYPE", "simple")
    settings = RagSettings(_env_file=None)
    assert settings.azure_search_top_k == 3
    assert settings.query_type == SearchQueryType.SIMPLE


async def test_stream_errors_before_and_after_first_event(
    traced_graph, span_exporter, model_api, search, settings
):
    search.error = RuntimeError("search unavailable")
    graph = traced_graph
    with pytest.raises(RuntimeError, match="search unavailable"):
        await anext(stream_graph(graph, chat_request(), settings))
    assert any(
        span.attributes.get("metadata.langgraph_node") == "retrieve_documents"
        and span.status.status_code.name == "ERROR"
        for span in span_exporter.get_finished_spans()
    )
    span_exporter.clear()
    search.error = None
    model_api.answer_error = True
    events = [event async for event in stream_graph(graph, chat_request(), settings)]
    assert len(events) == 2 and "model unavailable" in events[-1]["error"]
    assert events[0]["id"] == events[-1]["id"]
    assert events[0]["history_metadata"] == events[-1]["history_metadata"]
    assert any(
        span.attributes["gen_ai.operation.name"] == "chat"
        and span.status.status_code.name == "ERROR"
        for span in span_exporter.get_finished_spans()
    )


async def test_cancellation_reaches_search(
    traced_graph, span_exporter, search, settings
):
    started = asyncio.Event()
    cancelled = asyncio.Event()

    async def waiting_search(**arguments):
        started.set()
        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    search.search = AsyncMock(side_effect=waiting_search)
    graph = traced_graph
    task = asyncio.create_task(anext(stream_graph(graph, chat_request(), settings)))
    await asyncio.wait_for(started.wait(), timeout=5)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert cancelled.is_set()
    assert any(
        span.attributes.get("metadata.langgraph_node") == "retrieve_documents"
        and span.status.status_code.name == "ERROR"
        for span in span_exporter.get_finished_spans()
    )
