import asyncio
import importlib
import json
from dataclasses import dataclass, field

import httpx
import pytest
import pytest_asyncio
from langchain_azure_ai.callbacks.tracers import AzureAIOpenTelemetryTracer
from langchain_openai import AzureChatOpenAI
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from backend.graph.config import RagSettings
from backend.graph.graph import build_graph


@dataclass
class ModelApi:
    rewrite: str | None = "annual leave policy"
    answer: str = "Policy answer [doc1]"
    title: str = '{"title": "Annual leave"}'
    rewrite_error: bool = False
    answer_error: bool = False
    calls: list[dict] = field(default_factory=list)
    urls: list[str] = field(default_factory=list)
    headers: list[dict] = field(default_factory=list)

    async def respond(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        self.calls.append(body)
        self.urls.append(str(request.url))
        self.headers.append(dict(request.headers))
        messages = body["messages"]
        rewriting = messages[0]["content"].startswith("Rewrite the latest")
        if (rewriting and self.rewrite_error) or (not rewriting and self.answer_error):
            return httpx.Response(429, json={"error": {"message": "model unavailable"}})
        text = self.answer
        if rewriting:
            text = self.rewrite if self.rewrite is not None else messages[-1]["content"]
        elif "Summarize the conversation" in messages[-1]["content"]:
            text = self.title

        response = {
            "id": "provider-id",
            "model": "chat",
            "created": 1,
            "object": "chat.completion",
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": text},
                    "finish_reason": "stop",
                }
            ],
        }
        usage = {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
        if not body.get("stream"):
            return httpx.Response(200, json={**response, "usage": usage})
        events = []
        for token in (text[:8], text[8:]):
            chunk = {
                **response,
                "object": "chat.completion.chunk",
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": token},
                        "finish_reason": None,
                    }
                ],
            }
            events.append(f"data: {json.dumps(chunk)}\n\n")
        if body.get("stream_options", {}).get("include_usage"):
            chunk = {
                **response,
                "object": "chat.completion.chunk",
                "choices": [],
                "usage": usage,
            }
            events.append(f"data: {json.dumps(chunk)}\n\n")
        events.append("data: [DONE]\n\n")
        return httpx.Response(
            200, content="".join(events), headers={"content-type": "text/event-stream"}
        )


@dataclass
class SearchApi:
    documents: list[dict] = field(
        default_factory=lambda: [
            {
                "content": "Employees receive annual leave.",
                "title": "Leave policy",
                "filepath": "leave.pdf",
                "url": "https://storage.example/documents/leave.pdf",
            }
        ]
    )
    calls: list[dict] = field(default_factory=list)
    error: Exception | None = None

    async def search(self, **arguments):
        self.calls.append(arguments)
        if self.error:
            raise self.error
        await asyncio.sleep(0)

        async def results():
            for document in self.documents:
                yield document.copy()

        return results()


@pytest.fixture
def settings():
    return RagSettings(
        _env_file=None,
        applicationinsights_connection_string=None,
        azure_openai_endpoint="https://openai.example/",
        azure_openai_key="test-key",
        azure_openai_model="chat",
        azure_search_service="search",
        azure_search_index="documents",
        azure_search_query_type="vector_simple_hybrid",
    )


@pytest.fixture
def model_api():
    return ModelApi()


@pytest_asyncio.fixture
async def model(model_api, settings):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(model_api.respond)
    ) as http:
        model = AzureChatOpenAI(
            azure_endpoint=settings.azure_openai_endpoint,
            api_version=settings.azure_openai_preview_api_version,
            api_key=settings.azure_openai_key,
            model=settings.azure_openai_model,
            http_async_client=http,
            stream_usage=True,
            max_retries=0,
        )
        try:
            yield model
        finally:
            await model.root_async_client.close()
            model.root_client.close()


@pytest.fixture
def search():
    return SearchApi()


@pytest.fixture
def app_module(monkeypatch):
    environment = {
        "REDIS_HOST": "localhost",
        "REDIS_PORT": "6379",
        "AUTH_ENABLED": "false",
        "AUTH_HOST": "https://identity.example",
        "AUTH_CLIENT_ID": "test",
        "AUTH_CLIENT_SECRET": "test",
        "AUTH_SCOPE": "openid",
        "AUTH_REDIRECT_URI": "https://app.example/callback",
        "AUTH_VERIFY_SSL": "true",
        "APPLICATIONINSIGHTS_CONNECTION_STRING": "",
    }
    for name, value in environment.items():
        monkeypatch.setenv(name, value)
    return importlib.import_module("app")


@pytest.fixture
def span_exporter(monkeypatch):
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    monkeypatch.setattr("opentelemetry.trace.get_tracer_provider", lambda: provider)
    monkeypatch.setattr(AzureAIOpenTelemetryTracer, "_azure_monitor_configured", False)
    yield exporter
    provider.shutdown()


@pytest.fixture
def traced_graph(app_module, model, search, settings, span_exporter):
    return app_module.configure_graph_tracing(
        build_graph(model, search, settings),
        settings.model_copy(
            update={"applicationinsights_connection_string": "test-connection-string"}
        ),
    )
