import json
import time
from contextlib import AsyncExitStack
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from azure.core.credentials import AccessToken, AzureKeyCredential
from langchain_openai import AzureChatOpenAI

from backend.graph.graph import build_graph
from backend.history.cosmosdbservice import CosmosConversationClient
from backend.utils import generateFilterString

pytestmark = pytest.mark.asyncio


@pytest.fixture
def application(app_module, model, search, settings, monkeypatch):
    application = app_module.create_app()
    application.rag_settings = settings
    application.azure_openai_client = model
    application.chat_graph = build_graph(model, search, settings)
    app_module.azure_openai_ready.set()
    app_module.cosmos_db_ready.set()
    monkeypatch.setattr(app_module, "get_puid", AsyncMock(return_value="user"))
    yield application
    app_module.azure_openai_ready.clear()
    app_module.cosmos_db_ready.clear()


def request_body(question="How much annual leave do I get?"):
    return {
        "messages": [
            {"role": "user", "content": question, "id": "user-id", "date": "today"}
        ],
        "history_metadata": {"conversation_id": "existing-conversation"},
    }


@pytest.mark.parametrize("streaming", [True, False])
async def test_conversation_endpoint(application, model_api, streaming):
    application.rag_settings = application.rag_settings.model_copy(
        update={"azure_openai_stream": streaming}
    )
    response = await application.test_client().post(
        "/conversation", json=request_body()
    )
    assert response.status_code == 200
    if streaming:
        assert response.mimetype == "application/json-lines"
        events = [
            json.loads(line)
            for line in (await response.get_data(as_text=True)).splitlines()
        ]
    else:
        events = [await response.get_json()]
    messages = [
        message for event in events for message in event["choices"][0]["messages"]
    ]
    assert messages[0]["role"] == "tool"
    assert "".join(message["content"] for message in messages[1:]) == model_api.answer
    assert all(
        event["history_metadata"] == request_body()["history_metadata"]
        for event in events
    )


async def test_permission_filter_before_stream(
    application, app_module, model_api, search, monkeypatch
):
    application.rag_settings = application.rag_settings.model_copy(
        update={"azure_search_permitted_groups_column": "groups"}
    )
    application.chat_graph = build_graph(
        application.azure_openai_client, search, application.rag_settings
    )
    response = await application.test_client().post(
        "/conversation", json=request_body()
    )
    assert response.status_code == 500
    assert "user access token" in (await response.get_json())["error"]
    assert not search.calls and not model_api.calls

    resolver = MagicMock(return_value="groups/any(g:search.in(g, 'group-id'))")
    monkeypatch.setattr(app_module, "generateFilterString", resolver)
    response = await application.test_client().post(
        "/conversation",
        json=request_body(),
        headers={"X-MS-TOKEN-AAD-ACCESS-TOKEN": "user-token"},
    )
    assert response.status_code == 200
    resolver.assert_called_once_with("user-token", "groups")
    assert search.calls[0]["filter"] == resolver.return_value


async def test_no_group_membership_keeps_filter(monkeypatch):
    monkeypatch.setattr("backend.utils.fetchUserGroups", lambda token: [])
    assert generateFilterString("token", "groups") == "groups/any(g:search.in(g, ''))"


async def test_http_error_before_first_public_event(application, model_api):
    settings = application.rag_settings.model_copy(
        update={"azure_search_service": None}
    )
    application.rag_settings = settings
    application.chat_graph = build_graph(
        application.azure_openai_client, None, settings
    )
    model_api.answer_error = True
    response = await application.test_client().post(
        "/conversation", json=request_body()
    )
    assert response.status_code == 429 and response.mimetype == "application/json"
    result = await response.get_json()
    assert "model unavailable" in result["error"]
    assert result["history_metadata"] == request_body()["history_metadata"]


async def test_search_error_before_stream(application, search):
    search.error = RuntimeError("search unavailable")
    response = await application.test_client().post(
        "/conversation", json=request_body()
    )
    assert response.status_code == 500
    assert (await response.get_json())["error"] == "search unavailable"


async def test_ndjson_error_after_citations(application, model_api):
    model_api.answer_error = True
    response = await application.test_client().post(
        "/conversation", json=request_body()
    )
    events = [
        json.loads(line)
        for line in (await response.get_data(as_text=True)).splitlines()
    ]
    assert response.status_code == 200 and len(events) == 2
    assert events[0]["choices"][0]["messages"][0]["role"] == "tool"
    assert "model unavailable" in events[1]["error"]
    assert events[0]["id"] == events[1]["id"]
    assert events[0]["history_metadata"] == events[1]["history_metadata"]


async def test_nad_intercept(application, model_api, search):
    response = await application.test_client().post(
        "/conversation", json=request_body("What is NAD policy?")
    )
    result = await response.get_json()
    assert response.status_code == 200
    assert (
        "National Armaments Director Group"
        in result["choices"][0]["messages"][0]["content"]
    )
    assert result["history_metadata"] == request_body()["history_metadata"]
    assert not search.calls and not model_api.calls


@pytest.mark.parametrize(
    "title,expected",
    [('{"title":"Annual leave"}', "Annual leave"), ("invalid JSON", "User question")],
)
async def test_title_and_fallback(application, app_module, model_api, title, expected):
    model_api.title = title
    async with application.app_context():
        result = await app_module.generate_title(
            [{"role": "user", "content": "User question"}]
        )
    assert result == expected
    call = model_api.calls[0]
    assert call["temperature"] == 1 and call["stream"] is False
    assert call.get("max_tokens", call.get("max_completion_tokens")) == 64
    assert "4-word or less title" in call["messages"][-1]["content"]


@pytest.mark.parametrize("streaming", [True, False])
async def test_history_round_trip_and_feedback(
    application, app_module, model_api, streaming, monkeypatch
):
    items = {}

    async def upsert(item):
        items[item["id"]] = item.copy()
        return item

    def query_items(query, parameters):
        user = next(
            parameter["value"]
            for parameter in parameters
            if parameter["name"] == "@userId"
        )
        is_conversation = "c.type='conversation'" in query
        conversation_id = next(
            parameter["value"]
            for parameter in parameters
            if parameter["name"] == "@conversationId"
        )

        async def results():
            for item in list(items.values()):
                matches = (
                    item["id"] == conversation_id
                    if is_conversation
                    else item.get("conversationId") == conversation_id
                )
                if item["userId"] == user and matches:
                    yield item.copy()

        return results()

    container = MagicMock()
    container.upsert_item = AsyncMock(side_effect=upsert)
    container.query_items.side_effect = query_items
    container.read_item = AsyncMock(
        side_effect=lambda item, partition_key: items[item].copy()
    )
    cosmos = MagicMock()
    cosmos.get_database_client.return_value.get_container_client.return_value = (
        container
    )
    monkeypatch.setattr(
        "backend.history.cosmosdbservice.CosmosClient", MagicMock(return_value=cosmos)
    )
    application.cosmos_conversation_client = CosmosConversationClient(
        "https://cosmos.example",
        "test-key",
        "history",
        "conversations",
        enable_message_feedback=True,
    )
    application.rag_settings = application.rag_settings.model_copy(
        update={"azure_openai_stream": streaming}
    )
    client = application.test_client()
    response = await client.post("/history/generate", json=request_body())
    assert response.status_code == 200
    if streaming:
        events = [
            json.loads(line)
            for line in (await response.get_data(as_text=True)).splitlines()
        ]
    else:
        events = [await response.get_json()]
    metadata = events[-1]["history_metadata"]
    assert metadata["title"] == "Annual leave" and metadata["date"]
    messages = [
        message for event in events for message in event["choices"][0]["messages"]
    ]
    tool = messages[0]
    assistant = {
        "role": "assistant",
        "content": "".join(message["content"] for message in messages[1:]),
        "id": events[-1]["id"],
    }
    response = await client.post(
        "/history/update",
        json={
            "conversation_id": metadata["conversation_id"],
            "messages": [tool, assistant],
        },
    )
    assert response.status_code == 200
    stored = [item for item in items.values() if item["type"] == "message"]
    assert [item["role"] for item in stored] == ["user", "tool", "assistant"]
    assert set(stored[-1]) == {
        "id",
        "type",
        "userId",
        "createdAt",
        "updatedAt",
        "conversationId",
        "role",
        "content",
        "feedback",
        "comment",
    }
    response = await client.post(
        "/history/read", json={"conversation_id": metadata["conversation_id"]}
    )
    reloaded = (await response.get_json())["messages"]
    assert reloaded[1]["content"] == tool["content"]
    assert (
        reloaded[2]["content"] == model_api.answer
        and reloaded[2]["id"] == assistant["id"]
    )
    response = await client.post(
        "/history/message_feedback",
        json={
            "message_id": assistant["id"],
            "message_feedback": "positive",
            "message_comment": "Useful",
        },
    )
    assert response.status_code == 200
    assert items[assistant["id"]]["feedback"] == "positive"


@pytest.mark.parametrize("use_keys", [True, False])
async def test_clients_authentication_and_shutdown(
    app_module, settings, model_api, use_keys, monkeypatch
):
    sync_credential = MagicMock(spec=["get_token", "__enter__", "__exit__"])
    sync_credential.__enter__.return_value = sync_credential
    sync_credential.get_token.return_value = AccessToken(
        "identity-token", int(time.time()) + 3600
    )
    async_credential = MagicMock(spec=["get_token", "__aenter__", "__aexit__"])
    async_credential.__aenter__ = AsyncMock(return_value=async_credential)
    async_credential.__aexit__ = AsyncMock(return_value=False)
    async_credential.get_token = AsyncMock(
        return_value=sync_credential.get_token.return_value
    )
    monkeypatch.setattr(
        app_module,
        "create_sync_chained_credential",
        MagicMock(return_value=sync_credential),
    )
    monkeypatch.setattr(
        app_module,
        "create_async_chained_credential",
        MagicMock(return_value=async_credential),
    )
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    settings = settings.model_copy(
        update={
            "azure_managed_identity_id": "identity-id",
            "azure_openai_key": "test-key" if use_keys else None,
            "azure_search_key": "search-key" if use_keys else None,
        }
    )
    search_context = MagicMock()
    search_context.__aenter__ = AsyncMock(return_value=search_context)
    search_context.__aexit__ = AsyncMock(return_value=False)
    search_factory = MagicMock(return_value=search_context)
    monkeypatch.setattr(app_module, "SearchClient", search_factory)
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(model_api.respond)
    ) as http:
        monkeypatch.setattr(
            app_module,
            "AzureChatOpenAI",
            lambda **arguments: AzureChatOpenAI(
                **arguments, http_async_client=http, max_retries=0
            ),
        )
        async with AsyncExitStack() as resources:
            model = await app_module.init_openai_client(settings, resources)
            assert model.stream_usage is True
            await app_module.init_search_client(settings, resources)
            response = await model.ainvoke(
                [("user", "Question")], model="selected-deployment", stream=False
            )
            assert model_api.calls, response
            assert not model.root_async_client.is_closed()
        assert model.root_async_client.is_closed() and model.root_client.is_closed()
    search_context.__aexit__.assert_awaited_once()
    if use_keys:
        assert model_api.headers[0]["api-key"] == "test-key"
        assert isinstance(
            search_factory.call_args.kwargs["credential"], AzureKeyCredential
        )
        app_module.create_async_chained_credential.assert_not_called()
    else:
        assert model_api.headers[0]["authorization"] == "Bearer identity-token"
        sync_credential.__exit__.assert_called_once()
        assert async_credential.__aexit__.await_count == 2
        app_module.create_sync_chained_credential.assert_called_once_with("identity-id")
        assert search_factory.call_args.kwargs["credential"] is async_credential
    assert "/deployments/selected-deployment/" in model_api.urls[0]


@pytest.mark.parametrize(
    "connection_string", [None, "", "   ", "test-connection-string"]
)
async def test_graph_built_once_at_startup(
    application, app_module, search, monkeypatch, span_exporter, connection_string
):
    application.rag_settings = application.rag_settings.model_copy(
        update={"applicationinsights_connection_string": connection_string}
    )
    monkeypatch.setattr(
        app_module, "init_cosmosdb_client", AsyncMock(return_value=None)
    )
    redis = MagicMock()
    redis.init_redis = AsyncMock()
    monkeypatch.setattr(app_module, "RedisService", MagicMock(return_value=redis))
    monkeypatch.setattr(app_module, "Session", MagicMock())
    monkeypatch.setattr(
        app_module,
        "init_openai_client",
        AsyncMock(return_value=application.azure_openai_client),
    )
    monkeypatch.setattr(
        app_module, "init_search_client", AsyncMock(return_value=search)
    )
    builder = MagicMock(wraps=build_graph)
    monkeypatch.setattr(app_module, "build_graph", builder)
    tracer_factory = MagicMock(wraps=app_module.AzureAIOpenTelemetryTracer)
    monkeypatch.setattr(app_module, "AzureAIOpenTelemetryTracer", tracer_factory)
    async with application.test_app() as running:
        client = running.test_client()
        for _ in range(2):
            response = await client.post("/conversation", json=request_body())
            assert response.status_code == 200
        assert app_module.azure_openai_ready.is_set()
        builder.assert_called_once()
        if connection_string and connection_string.strip():
            tracer_factory.assert_called_once_with(
                connection_string=connection_string,
                name="hr-chatbot",
                enable_content_recording=True,
                trace_all_langgraph_nodes=True,
                trace_state=True,
            )
            assert len(application.chat_graph.config["callbacks"]) == 1
            assert span_exporter.get_finished_spans()
        else:
            tracer_factory.assert_not_called()
            assert not span_exporter.get_finished_spans()
    assert not app_module.azure_openai_ready.is_set()


@pytest.mark.parametrize(
    "body", [[], {}, {"messages": [{"role": "user", "content": ""}]}]
)
async def test_request_validation(application, body):
    response = await application.test_client().post("/conversation", json=body)
    assert response.status_code == 400
    assert "error" in await response.get_json()
