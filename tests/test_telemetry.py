import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from microsoft.opentelemetry._genai._langchain import LangChainInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode

from backend.graph.graph import build_graph
from backend.graph.invoker import complete_graph, stream_graph
from backend.graph.nodes.generate_response import INSUFFICIENT_INFORMATION
from backend.graph.state import ChatRequest


@pytest.mark.parametrize(
    "standard,legacy,expected",
    [
        ("", "", ""),
        ("standard", "", "standard"),
        ("", "legacy", "legacy"),
        ("standard", "legacy", "standard"),
    ],
)
def test_startup_once_per_worker(standard, legacy, expected):
    # App imports configure process-global providers, so isolate startup checks.
    environment = {
        **os.environ,
        "APPLICATIONINSIGHTS_CONNECTION_STRING": standard,
        "AZURE_APPLICATION_INSIGHTS_CONNECTION_STRING": legacy,
        "EXPECTED_CONNECTION": expected,
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "AUTH_ENABLED": "false",
        "AUTH_HOST": "https://identity.example",
        "AUTH_CLIENT_ID": "test",
        "AUTH_CLIENT_SECRET": "test",
        "AUTH_SCOPE": "openid",
        "AUTH_REDIRECT_URI": "https://app.example/callback",
        "AUTH_VERIFY_SSL": "true",
    }
    script = """
import os
import sys
from unittest.mock import patch
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from backend.config import Config
from backend.telemetry import configure_telemetry

Config.model_config["env_file"] = None
def before_clients(**options):
    assert "backend.utils" not in sys.modules

with patch(
    "backend.telemetry.use_microsoft_opentelemetry", side_effect=before_clients
) as setup:
    configure_telemetry(None)
    configure_telemetry("")
    setup.assert_not_called()
    import app
    expected = os.environ["EXPECTED_CONNECTION"]
    for application in (app.app, app.create_app(), app.create_app()):
        assert isinstance(application.asgi_app, OpenTelemetryMiddleware) == bool(expected)
        if expected:
            assert not isinstance(application.asgi_app.app, OpenTelemetryMiddleware)
    if expected:
        setup.assert_called_once_with(
            enable_azure_monitor=True,
            azure_monitor_connection_string=expected,
            enable_sensitive_data=True,
            instrumentation_options={
                "langchain": {
                    "enabled": True, "agent_id": "hr-chatbot", "agent_name": "HR chatbot"
                },
                "openai": {"enabled": False},
            },
        )
    else:
        setup.assert_not_called()
"""
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).resolve().parents[1],
        env=environment,
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.fixture
def spans(monkeypatch):
    # Pass a local provider; leave the process-global providers untouched.
    monkeypatch.setenv("AZURE_EXPERIMENTAL_ENABLE_GENAI_TRACING", "true")
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    instrumentor = LangChainInstrumentor()
    instrumentor.instrument(
        tracer_provider=provider,
        agent_id="hr-chatbot",
        agent_name="HR chatbot",
        enable_sensitive_data=True,
    )
    try:
        yield exporter
    finally:
        instrumentor.uninstrument()
        provider.shutdown()


def chat_request(conversation_id="saved-conversation"):
    history = {} if conversation_id is None else {"conversation_id": conversation_id}
    return ChatRequest.model_validate(
        {
            "messages": [
                {"role": "user", "content": "Tell me about leave"},
                {"role": "assistant", "content": "Previous answer"},
                {"role": "user", "content": "How much annual leave do I get?"},
            ],
            "history_metadata": history,
        }
    )


async def invoke(graph, request, settings, streaming):
    if streaming:
        return [event async for event in stream_graph(graph, request, settings)]
    return await complete_graph(graph, request, settings)


def root_spans(exporter):
    return [span for span in exporter.get_finished_spans() if span.parent is None]


def output_text(span):
    messages = json.loads(span.attributes["gen_ai.output.messages"])
    return messages[-1]["parts"][0]["content"]


@pytest.mark.asyncio
@pytest.mark.parametrize("streaming", [False, True])
@pytest.mark.parametrize("empty", [False, True])
async def test_graph_spans_and_content(
    spans, model, model_api, search, settings, streaming, empty
):
    if empty:
        search.documents = []
    result = await invoke(
        build_graph(model, search, settings), chat_request(), settings, streaming
    )
    finished = spans.get_finished_spans()
    (root,) = root_spans(spans)
    steps = [
        span
        for span in finished
        if span.parent and span.parent.span_id == root.context.span_id
    ]
    assert {span.name for span in steps} == {
        "invoke_agent rewrite_query",
        "invoke_agent retrieve_documents",
        "invoke_agent generate_response",
    }
    models = [
        span
        for span in finished
        if span.attributes.get("gen_ai.operation.name") == "chat"
    ]
    assert len(models) == (1 if empty else 2)
    assert len(finished) == 4 + len(models)
    assert {span.context.trace_id for span in finished} == {root.context.trace_id}
    assert all(span.status.status_code == StatusCode.OK for span in finished)
    assert root.attributes["gen_ai.agent.id"] == "hr-chatbot"
    assert root.attributes["gen_ai.conversation.id"] == "saved-conversation"
    answer = INSUFFICIENT_INFORMATION if empty else model_api.answer
    assert output_text(root) == answer
    assert (
        output_text(next(span for span in steps if "generate_response" in span.name))
        == answer
    )
    content = json.dumps([dict(span.attributes) for span in finished])
    assert "How much annual leave do I get?" in content
    if not empty:
        assert search.documents[0]["content"] in content
    events = result if streaming else [result]
    messages = [
        message for event in events for message in event["choices"][0]["messages"]
    ]
    assert (
        "".join(
            message["content"] for message in messages if message["role"] == "assistant"
        )
        == answer
    )


@pytest.mark.asyncio
async def test_conversation_correlation_and_concurrent_trace_isolation(
    spans, model, search, settings
):
    graph = build_graph(model, search, settings)
    await asyncio.gather(
        invoke(graph, chat_request("saved"), settings, False),
        invoke(graph, chat_request("saved"), settings, True),
        invoke(graph, chat_request("other"), settings, True),
        invoke(graph, chat_request(None), settings, False),
    )
    roots = root_spans(spans)
    assert len(roots) == len({span.context.trace_id for span in roots}) == 4
    conversation_ids = [span.attributes.get("gen_ai.conversation.id") for span in roots]
    assert conversation_ids.count("saved") == 2
    assert conversation_ids.count("other") == conversation_ids.count(None) == 1


@pytest.mark.asyncio
async def test_rewrite_fallback_keeps_model_error_visible(
    spans, model, model_api, search, settings
):
    model_api.rewrite_error = True
    await complete_graph(build_graph(model, search, settings), chat_request(), settings)
    assert search.calls[0]["search_text"] == chat_request().messages[-1].content
    (root,) = root_spans(spans)
    assert root.status.status_code == StatusCode.OK
    assert output_text(root) == model_api.answer
    assert any(
        span.status.status_code == StatusCode.ERROR
        for span in spans.get_finished_spans()
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("streaming", [False, True])
@pytest.mark.parametrize("failure", ["search", "model"])
async def test_failures_remain_visible(
    spans, model, model_api, search, settings, streaming, failure
):
    if failure == "search":
        search.error = RuntimeError("search unavailable")
    else:
        model_api.answer_error = True
    graph = build_graph(model, search, settings)
    if streaming and failure == "model":
        events = await invoke(graph, chat_request(), settings, streaming)
        assert events[0]["choices"][0]["messages"][0]["role"] == "tool"
        assert "model unavailable" in events[-1]["error"]
    else:
        with pytest.raises(Exception, match=f"{failure} unavailable"):
            await invoke(graph, chat_request(), settings, streaming)
    (root,) = root_spans(spans)
    assert root.status.status_code == StatusCode.ERROR
    assert any(event.name == "exception" for event in root.events)
