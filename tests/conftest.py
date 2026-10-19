import asyncio
import json
from dataclasses import dataclass, field

import httpx
import pytest
import pytest_asyncio
from langchain_openai import AzureChatOpenAI

from backend.graph.config import RagSettings


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
        if not body.get("stream"):
            return httpx.Response(200, json=response)
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
            stream_usage=False,
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
