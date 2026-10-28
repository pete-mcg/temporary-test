import os
import re
import uuid
import secrets
import asyncio
from collections.abc import AsyncIterator
from contextlib import AsyncExitStack
from dotenv import load_dotenv
from backend.logger import logger

from quart import (
    Response,
    Blueprint,
    Quart,
    jsonify,
    make_response,
    request,
    send_from_directory,
    render_template,
    current_app,
    url_for,
)
from quart_cors import cors
from quart_session import Session

from langchain_openai import AzureChatOpenAI
from langchain_azure_ai.callbacks.tracers import AzureAIOpenTelemetryTracer
from langgraph.graph.state import CompiledStateGraph
from pydantic import ValidationError
from azure.core.credentials import AzureKeyCredential
from azure.search.documents.aio import SearchClient
from azure.storage.blob import BlobServiceClient
from azure.identity import get_bearer_token_provider
from azure.identity.aio import get_bearer_token_provider as get_async_bearer_token_provider
from backend.auth.auth_utils import get_puid
from backend.auth.credential_helpers import (
    create_async_chained_credential,
    create_sync_chained_credential,
)
from backend.config import Config
from backend.history.cosmosdbservice import CosmosConversationClient
from backend.graph.config import RagSettings
from backend.graph.graph import build_graph
from backend.graph.invoker import complete_graph, stream_graph
from backend.graph.state import ChatRequest, ConversationTitle

from backend.services.redis_service import RedisService
from backend.session.session_manager import SessionManager
from backend.telemetry import configure_telemetry
from backend.utils import (
    blob_service_client,
    format_as_ndjson,
    generateFilterString,
    generate_sas_token,
    download_file
)

from backend.auth.auth_controller import (
    login_auth,
    login_callback,
    check_auth,
    logout_auth
)

bp = Blueprint("routes", __name__, static_folder="static", template_folder="static")

load_dotenv()

AZURE_MANAGED_IDENTITY_ID = os.environ.get("AZURE_MANAGED_IDENTITY_ID")

# UI configuration
UI_TITLE = os.environ.get("UI_TITLE") or "Contoso"
UI_TAB_TITLE = os.environ.get("UI_TAB_TITLE") or "Contoso"
UI_KNOWLEDGE_BASE = os.environ.get("UI_KNOWLEDGE_BASE")
UI_LOGO = os.environ.get("UI_LOGO")
UI_CHAT_LOGO = os.environ.get("UI_CHAT_LOGO")
UI_CHAT_TITLE = os.environ.get("UI_CHAT_TITLE") or "Start chatting"
UI_CHAT_DESCRIPTION = os.environ.get("UI_CHAT_DESCRIPTION")
UI_FAVICON = os.environ.get("UI_FAVICON") or "/favicon.ico"
UI_SHOW_SHARE_BUTTON = os.environ.get("UI_SHOW_SHARE_BUTTON", "true").lower() == "true"
UI_SHOW_HISTORY = os.environ.get("UI_SHOW_HISTORY", "true").lower() == "true"
UI_SHOW_SETTINGS = os.environ.get("UI_SHOW_SETTINGS", "false").lower() == "true"
UI_SHOW_FEEDBACK = os.environ.get("UI_SHOW_FEEDBACK", "false").lower() == "true"
UI_SHOW_TOUR = os.environ.get("UI_SHOW_TOUR", "false").lower() == "true"
UI_SHOW_EDITABLE_SYSTEM_MESSAGE = os.environ.get(
    "UI_SHOW_EDITABLE_SYSTEM_MESSAGE", "false"
)
UI_EXAMPLE_PROMPT_1 = os.environ.get("UI_EXAMPLE_PROMPT_1")
UI_EXAMPLE_PROMPT_TITLE_1 = os.environ.get(
    "UI_EXAMPLE_PROMPT_TITLE_1", UI_EXAMPLE_PROMPT_1
)
UI_EXAMPLE_PROMPT_ICON_1 = os.environ.get("UI_EXAMPLE_PROMPT_ICON_1")
UI_EXAMPLE_PROMPT_2 = os.environ.get("UI_EXAMPLE_PROMPT_2")
UI_EXAMPLE_PROMPT_TITLE_2 = os.environ.get(
    "UI_EXAMPLE_PROMPT_TITLE_2", UI_EXAMPLE_PROMPT_2
)
UI_EXAMPLE_PROMPT_ICON_2 = os.environ.get("UI_EXAMPLE_PROMPT_ICON_2")
UI_EXAMPLE_PROMPT_3 = os.environ.get("UI_EXAMPLE_PROMPT_3")
UI_EXAMPLE_PROMPT_TITLE_3 = os.environ.get(
    "UI_EXAMPLE_PROMPT_TITLE_3", UI_EXAMPLE_PROMPT_3
)
UI_EXAMPLE_PROMPT_ICON_3 = os.environ.get("UI_EXAMPLE_PROMPT_ICON_3")

APP_ENV = os.environ.get("APP_ENV")

cosmos_db_ready = asyncio.Event()
table_storage_ready = asyncio.Event()
azure_openai_ready = asyncio.Event()
redis_ready = asyncio.Event()

config = Config()
rag_settings = RagSettings()

def create_app():
    app = Quart(__name__)
    app.secret_key = secrets.token_hex(16)
    app.register_blueprint(bp)
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    app.rag_settings = rag_settings

    if APP_ENV == "development":
        app = cors(
            app, 
            allow_origin=["http://127.0.0.1:5173"], 
            allow_credentials=True, 
            allow_headers=["Content-Type", "Authorization"],
            allow_methods=["GET", "PUT", "POST", "OPTIONS", "HEAD"]
        )

    @app.before_serving
    async def init_services():
        try:
            app.cosmos_conversation_client = await init_cosmosdb_client()
            cosmos_db_ready.set()
        except Exception as e:
            logger.exception("Failed to initialize CosmosDB client")
            app.cosmos_conversation_client = None
            raise e

        app.config["SESSION_TYPE"] = "redis"

        try:
            redis_service = RedisService()
            await redis_service.init_redis()
            app.config['SESSION_REDIS'] = redis_service.redis_client
            Session(app)
            redis_ready.set()
            app.session_manager = SessionManager()
        except Exception as e:
            logger.exception("Failed to initialize Redis client")
            raise e
        
    @app.while_serving
    async def graph_services():
        async with AsyncExitStack() as resources:
            app.azure_openai_client = await init_openai_client(app.rag_settings, resources)
            app.search_client = await init_search_client(app.rag_settings, resources)
            app.chat_graph = build_graph(
                app.azure_openai_client, app.search_client, app.rag_settings
            )
            app.chat_graph = configure_graph_tracing(app.chat_graph, app.rag_settings)
            azure_openai_ready.set()
            try:
                yield
            finally:
                azure_openai_ready.clear()
    return app


@bp.route("/")
async def index():
    return await render_template("index.html", title=UI_TAB_TITLE, favicon=UI_FAVICON)


@bp.route("/favicon.ico")
async def favicon():
    return await bp.send_static_file("favicon.ico")


@bp.route("/assets/<path:path>")
async def assets(path):
    return await send_from_directory("static/assets", path)

@bp.route("/healthz", methods=["GET", "HEAD"])
async def healthz() -> Response:
    """
    Lightweight endpoint used by infra to poll container health.
    """
    return Response(
        "Healthy",
        status=200,
        mimetype="text/plain",
        headers={"Cache-Control": "no-store"},
    )

USER_AGENT = "GitHubSampleWebApp/AsyncAzureOpenAI/1.0.0"

# Storage Settings
AZURE_STORAGE_ACCOUNT_KEY = os.environ.get("AZURE_STORAGE_ACCOUNT_KEY")
AZURE_STORAGE_ACCOUNT_NAME = os.environ.get("AZURE_STORAGE_ACCOUNT_NAME")
AZURE_STORAGE_CONTAINER_NAME = os.environ.get("AZURE_STORAGE_CONTAINER_NAME")

# Chat History CosmosDB Settings
AZURE_COSMOSDB_DATABASE = os.environ.get("AZURE_COSMOSDB_DATABASE")
AZURE_COSMOSDB_ACCOUNT = os.environ.get("AZURE_COSMOSDB_ACCOUNT")
AZURE_COSMOSDB_CONVERSATIONS_CONTAINER = os.environ.get(
    "AZURE_COSMOSDB_CONVERSATIONS_CONTAINER"
)
AZURE_COSMOSDB_ACCOUNT_KEY = os.environ.get("AZURE_COSMOSDB_ACCOUNT_KEY")
AZURE_COSMOSDB_ENABLE_FEEDBACK = (
    os.environ.get("AZURE_COSMOSDB_ENABLE_FEEDBACK", "false").lower() == "true"
)

# Frontend Settings via Environment Variables
AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "true").lower() == "true"
CHAT_HISTORY_ENABLED = (
    AZURE_COSMOSDB_ACCOUNT
    and AZURE_COSMOSDB_DATABASE
    and AZURE_COSMOSDB_CONVERSATIONS_CONTAINER
)
STORAGE_ACCOUNT_ENABLED = AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_CONTAINER_NAME

frontend_settings = {
    "auth_enabled": AUTH_ENABLED,
    "feedback_enabled": AZURE_COSMOSDB_ENABLE_FEEDBACK and CHAT_HISTORY_ENABLED,
    "ui": {
        "title": UI_TITLE,
        "knowledge_base": UI_KNOWLEDGE_BASE,
        "logo": UI_LOGO,
        "chat_logo": UI_CHAT_LOGO or UI_LOGO,
        "chat_title": UI_CHAT_TITLE,
        "chat_description": UI_CHAT_DESCRIPTION,
        "show_share_button": UI_SHOW_SHARE_BUTTON,
        "show_history": UI_SHOW_HISTORY,
        "show_settings": UI_SHOW_SETTINGS,
        "show_feedback": UI_SHOW_FEEDBACK,
        "show_tour": UI_SHOW_TOUR,
        "default_system_message": rag_settings.azure_openai_system_message,
        "show_editable_system_message": UI_SHOW_EDITABLE_SYSTEM_MESSAGE,
        "example_prompt_1": UI_EXAMPLE_PROMPT_1,
        "example_prompt_title_1": UI_EXAMPLE_PROMPT_TITLE_1,
        "example_prompt_icon_1": UI_EXAMPLE_PROMPT_ICON_1,
        "example_prompt_2": UI_EXAMPLE_PROMPT_2,
        "example_prompt_title_2": UI_EXAMPLE_PROMPT_TITLE_2,
        "example_prompt_icon_2": UI_EXAMPLE_PROMPT_ICON_2,
        "example_prompt_3": UI_EXAMPLE_PROMPT_3,
        "example_prompt_title_3": UI_EXAMPLE_PROMPT_TITLE_3,
        "example_prompt_icon_3": UI_EXAMPLE_PROMPT_ICON_3,
        "storage_account_name": AZURE_STORAGE_ACCOUNT_NAME,
    },
}


# Function to retrieve data from storage account
def list_blob_files(account_name, container_name):
    database_info = None
    if STORAGE_ACCOUNT_ENABLED:
        if not AZURE_STORAGE_ACCOUNT_KEY:
            credential = create_sync_chained_credential(AZURE_MANAGED_IDENTITY_ID)
        else:
            credential = AZURE_STORAGE_ACCOUNT_KEY

        blob_service_client = BlobServiceClient(
            account_url=f"https://{account_name}.blob.core.windows.net",
            credential=credential,
        )
        container_client = blob_service_client.get_container_client(container_name)

        document_list = []
        last_refresh = None

        try:
            blob_list = container_client.list_blobs()
            for blob in blob_list:
                document_list.append(blob.name)

                # find the latest date that documents were last modified
                if last_refresh is None:
                    last_refresh = blob.last_modified
                elif blob.last_modified > last_refresh:
                    last_refresh = blob.last_modified

        except Exception as e:
            print(f"Error: {e}")

        database_info = {"lastRefresh": last_refresh, "documentList": document_list}

    else:
        logger.debug("Storage Account not configured")

    return database_info


def configure_graph_tracing(
    graph: CompiledStateGraph, settings: RagSettings
) -> CompiledStateGraph:
    connection_string = (settings.applicationinsights_connection_string or "").strip()
    if not connection_string:
        return graph
    configure_telemetry(connection_string)
    tracer = AzureAIOpenTelemetryTracer(
        connection_string=connection_string,
        auto_configure_azure_monitor=False,
        name="hr-chatbot",
        enable_content_recording=True,
        trace_all_langgraph_nodes=True,
        trace_state=True,
    )
    return graph.with_config(callbacks=[tracer], run_name="hr-chatbot")


async def init_openai_client(
    settings: RagSettings, resources: AsyncExitStack
) -> AzureChatOpenAI:
    if not settings.azure_openai_endpoint and not settings.azure_openai_resource:
        raise ValueError("AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_RESOURCE is required")
    if not settings.azure_openai_model:
        raise ValueError("AZURE_OPENAI_MODEL is required")
    endpoint = settings.azure_openai_endpoint or (
        f"https://{settings.azure_openai_resource}.openai.azure.com/"
    )
    authentication = {}
    if not settings.azure_openai_key:
        credential = resources.enter_context(
            create_sync_chained_credential(settings.azure_managed_identity_id)
        )
        async_credential = await resources.enter_async_context(
            create_async_chained_credential(settings.azure_managed_identity_id)
        )
        authentication = {
            "azure_ad_token_provider": get_bearer_token_provider(
                credential, "https://cognitiveservices.azure.com/.default"
            ),
            "azure_ad_async_token_provider": get_async_bearer_token_provider(
                async_credential, "https://cognitiveservices.azure.com/.default"
            ),
        }

    client = AzureChatOpenAI(
        azure_endpoint=endpoint,
        api_version=settings.azure_openai_preview_api_version,
        api_key=settings.azure_openai_key,
        model=settings.azure_openai_model,
        default_headers={"x-ms-useragent": USER_AGENT},
        stream_usage=True,
        **authentication,
    )
    resources.callback(client.root_client.close)
    resources.push_async_callback(client.root_async_client.close)
    return client


async def init_search_client(
    settings: RagSettings, resources: AsyncExitStack
) -> SearchClient | None:
    if not settings.search_enabled:
        return None
    if settings.azure_search_key:
        credential = AzureKeyCredential(settings.azure_search_key)
    else:
        credential = await resources.enter_async_context(
            create_async_chained_credential(settings.azure_managed_identity_id)
        )
    return await resources.enter_async_context(SearchClient(
        endpoint=f"https://{settings.azure_search_service}.search.windows.net",
        index_name=settings.azure_search_index,
        credential=credential,
    ))


async def init_cosmosdb_client():
    cosmos_conversation_client = None
    if CHAT_HISTORY_ENABLED:
        try:
            cosmos_endpoint = (
                f"https://{AZURE_COSMOSDB_ACCOUNT}.documents.azure.com:443/"
            )

            if not AZURE_COSMOSDB_ACCOUNT_KEY:
                credential = create_async_chained_credential(AZURE_MANAGED_IDENTITY_ID)
            else:
                credential = AZURE_COSMOSDB_ACCOUNT_KEY

            cosmos_conversation_client = CosmosConversationClient(
                cosmosdb_endpoint=cosmos_endpoint,
                credential=credential,
                database_name=AZURE_COSMOSDB_DATABASE,
                container_name=AZURE_COSMOSDB_CONVERSATIONS_CONTAINER,
                enable_message_feedback=AZURE_COSMOSDB_ENABLE_FEEDBACK,
            )
        except Exception as e:
            logger.exception("Exception in CosmosDB initialization", e)
            cosmos_conversation_client = None
            raise e
    else:
        logger.debug("CosmosDB not configured")

    return cosmos_conversation_client


def nad_query_classifier(messages: list) -> str:
    """
    Classify the query to determine if it's a NAD-related question.

    Args:
        messages: List of message dicts (each with 'role' and 'content')

    Returns:
        str: "nad_query" if matches criteria, else "normal"
    """
    if not messages:
        return "normal"
    query = messages[-1]["content"].lower()
    keywords = [
        "nad", "nadg", "national armaments", "nads", "national armament", "nad-g", "nadgroup", "nade", "na director", "na directorate", "nad group", "national arms director", "national arms", "national arms group"
    ]
    #regex for word escape so it doesn't trigger on words like 'unadded' or 'unaddressed'
    if any(re.search(r'\b' + re.escape(keyword) + r'\b', query) for keyword in keywords):
        return "nad_query"
    return "normal"

async def permission_filter(settings: RagSettings) -> str | None:
    if not settings.search_enabled or not settings.azure_search_permitted_groups_column:
        return None
    user_token = request.headers.get("X-MS-TOKEN-AAD-ACCESS-TOKEN", "").strip()
    if not user_token:
        raise ValueError(
            "Document-level access control is enabled, but user access token could not be fetched."
        )
    return await asyncio.to_thread(
        generateFilterString, user_token, settings.azure_search_permitted_groups_column
    )


async def stream_chat_request(
    chat_request: ChatRequest, search_filter: str | None
) -> AsyncIterator[dict[str, object]]:
    events = stream_graph(
        current_app.chat_graph, chat_request, current_app.rag_settings, search_filter
    )
    # Fetch the first public event while HTTP errors can still set the response status.
    first_event = await anext(events)

    async def generate():
        try:
            yield first_event
            async for event in events:
                yield event
        finally:
            await events.aclose()

    return generate()


async def conversation_internal(request_body):
    history_metadata = (
        request_body.get("history_metadata", {}) if isinstance(request_body, dict) else {}
    )
    try:
        chat_request = ChatRequest.model_validate(request_body)
    except ValidationError as ex:
        return jsonify({"error": str(ex), "history_metadata": history_metadata}), 400

    try:
        # NAD classifier intercept
        messages = request_body.get("messages", [])
        if nad_query_classifier(messages) == "nad_query":
            history_metadata = request_body.get("history_metadata", {})
            return jsonify({
                "id": str(uuid.uuid4()),
                "model": current_app.rag_settings.azure_openai_model,
                "created": 0,
                "object": "chat.completion",
                "choices": [{
                    "messages": [{
                        "role": "assistant",
                        "content": "It seems like your question may be related to the National Armaments Director Group. Apologies, but I do not currently have access to any documentation relating specifically to the National Armaments Director Group. I have access to DE&S-specific HR documentation, so please feel free to ask me questions relating to that and I will do my best to help! For more information about the NAD, please visit: [National Armaments HR People Policies and Support Page](https://modgovuk.sharepoint.com/sites/IntranetNAD/SitePages/HR-People-policies-and-support-page.aspx)"
                    }]
                }],
                "history_metadata": history_metadata,
            })

        await azure_openai_ready.wait()
        search_filter = await permission_filter(current_app.rag_settings)
        if current_app.rag_settings.azure_openai_stream:
            result = await stream_chat_request(chat_request, search_filter)
            response = await make_response(format_as_ndjson(result))
            response.timeout = None
            response.mimetype = "application/json-lines"
            return response
        else:
            result = await complete_graph(
                current_app.chat_graph, chat_request, current_app.rag_settings, search_filter
            )
            return jsonify(result)

    except Exception as ex:
        logger.exception("Exception in conversation_internal")
        return (
            jsonify({"error": str(ex), "history_metadata": history_metadata}),
            getattr(ex, "status_code", None) or 500,
        )


@bp.route("/conversation", methods=["POST"])
async def conversation():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()

    return await conversation_internal(request_json)


@bp.route("/frontend_settings", methods=["GET"])
def get_frontend_settings():
    try:
        return jsonify(frontend_settings), 200
    except Exception as e:
        logger.exception("Exception in /frontend_settings")
        return jsonify({"error": str(e)}), 500


# Conversation History API
@bp.route("/history/generate", methods=["POST"])
async def add_conversation():
    await cosmos_db_ready.wait()
    puid = await get_puid()

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    try:
        # make sure cosmos is configured
        if not current_app.cosmos_conversation_client:
            raise Exception("CosmosDB is not configured or not working")

        # check for the conversation_id, if the conversation is not set, we will create a new one
        history_metadata = {}
        if not conversation_id:
            title = await generate_title(request_json["messages"])
            conversation_dict = (
                await current_app.cosmos_conversation_client.create_conversation(
                    user_id=puid, title=title
                )
            )
            conversation_id = conversation_dict["id"]
            history_metadata["title"] = title
            history_metadata["date"] = conversation_dict["createdAt"]

        # Format the incoming message object in the "chat/completions" messages format
        # then write it to the conversation history in cosmos
        messages = request_json["messages"]
        if len(messages) > 0 and messages[-1]["role"] == "user":
            createdMessageValue = (
                await current_app.cosmos_conversation_client.create_message(
                    uuid=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    user_id=puid,
                    input_message=messages[-1],
                )
            )
            if createdMessageValue == "Conversation not found":
                raise Exception(
                    "Conversation not found for the given conversation ID: "
                    + conversation_id
                    + "."
                )
        else:
            raise Exception("No user message found")

        # Submit request to Chat Completions for response
        request_body = await request.get_json()
        history_metadata["conversation_id"] = conversation_id
        request_body["history_metadata"] = history_metadata
        return await conversation_internal(request_body)

    except Exception as e:
        logger.exception("Exception in /history/generate")
        return jsonify({"error": str(e)}), 500


@bp.route("/history/update", methods=["POST"])
async def update_conversation():
    await cosmos_db_ready.wait()
    puid = await get_puid()

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    try:
        # make sure cosmos is configured
        if not current_app.cosmos_conversation_client:
            raise Exception("CosmosDB is not configured or not working")

        # check for the conversation_id, if the conversation is not set, we will create a new one
        if not conversation_id:
            raise Exception("No conversation_id found")

        # Format the incoming message object in the "chat/completions" messages format
        # then write it to the conversation history in cosmos
        messages = request_json["messages"]
        # Log assistant and tool messages
        if len(messages) > 0 and messages[-1]["role"] == "assistant":
            if len(messages) > 1 and messages[-2].get("role", None) == "tool":
                # write the tool message first
                await current_app.cosmos_conversation_client.create_message(
                    uuid=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    user_id=puid,
                    input_message=messages[-2],
                )
            # write the assistant message
            await current_app.cosmos_conversation_client.create_message(
                uuid=messages[-1]["id"],
                conversation_id=conversation_id,
                user_id=puid,
                input_message=messages[-1],
            )
        # Log error message, along with tool and assistant messages if they exist
        elif len(messages) > 0 and messages[-1]["role"] == "error":
            if len(messages) > 0 and messages[-2]["role"] == "assistant":
                if len(messages) > 1 and messages[-3].get("role", None) == "tool":
                    # write the tool message first
                    await current_app.cosmos_conversation_client.create_message(
                        uuid=str(uuid.uuid4()),
                        conversation_id=conversation_id,
                        user_id=puid,
                        input_message=messages[-2],
                    )
                # write the assistant message
                await current_app.cosmos_conversation_client.create_message(
                    uuid=messages[-2]["id"],
                    conversation_id=conversation_id,
                    user_id=puid,
                    input_message=messages[-1],
                )
            elif len(messages) > 1 and messages[-2].get("role", None) == "tool":
                # write the tool message first
                await current_app.cosmos_conversation_client.create_message(
                    uuid=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    user_id=puid,
                    input_message=messages[-2],
                )
            # write the error message
            await current_app.cosmos_conversation_client.create_message(
                uuid=messages[-1]["id"],
                conversation_id=conversation_id,
                user_id=puid,
                input_message=messages[-1],
            )
        else:
            raise Exception("No bot messages found")

        # Submit request to Chat Completions for response
        response = {"success": True}
        return jsonify(response), 200

    except Exception as e:
        logger.exception("Exception in /history/update")
        return jsonify({"error": str(e)}), 500


@bp.route("/history/message_feedback", methods=["POST"])
async def update_message():
    await cosmos_db_ready.wait()
    puid = await get_puid()

    # check request for message_id
    request_json = await request.get_json()
    message_id = request_json.get("message_id", None)
    message_feedback = request_json.get("message_feedback", None)
    message_comment = request_json.get("message_comment", None)
    try:
        if not message_id:
            return jsonify({"error": "message_id is required"}), 400

        if not message_feedback:
            return jsonify({"error": "message_feedback is required"}), 400

        # update the message in cosmos
        updated_message = (
            await current_app.cosmos_conversation_client.update_message_feedback(
                puid, message_id, message_feedback, message_comment
            )
        )
        if updated_message:
            return (
                jsonify(
                    {
                        "message": f"Successfully updated message with feedback {message_feedback}",
                        "message_id": message_id,
                    }
                ),
                200,
            )
        else:
            return (
                jsonify(
                    {
                        "error": f"Unable to update message {message_id}. It either does not exist or the user does not have access to it."
                    }
                ),
                404,
            )

    except Exception as e:
        logger.exception("Exception in /history/message_feedback")
        return jsonify({"error": str(e)}), 500

@bp.before_request
async def auth_middleware():
    non_protected_routes = [
        url_for("routes.login"),
        url_for("routes.auth_callback"),
        url_for("routes.auth_check"),
        url_for("routes.auth_logout"),
        url_for("routes.get_frontend_settings"),
        url_for("routes.healthz"),
    ]

    if config.auth_enabled:
        authenticated = await check_auth()
        if not authenticated and request.path not in non_protected_routes:
            if request.path == url_for("routes.index"):
                return await login_auth(True)

            return jsonify({"error": "User is not authenticated"}), 401        

        # Continue to the next request handler if authenticated    

@bp.route("/auth/login", methods=["GET"])
async def login():
    return await login_auth(False)

# Used with vite hosted react app
@bp.route("/auth/callback-api", methods=["GET"])
async def auth_callback_api():
    return await login_callback(False)

# Used for python hosted react app
@bp.route("/auth/callback", methods=["GET"])
async def auth_callback():
    return await login_callback(True)

@bp.route("/auth/check", methods=["GET"])
async def auth_check():
    if not config.auth_enabled:
        return jsonify({"success": True}), 200

    authenticated = await check_auth()

    if not authenticated:
        return jsonify({"success": False, "error": "User is not authenticated"}), 401

    return jsonify({"success": True}), 200

@bp.route("/auth/logout", methods=["GET"])
async def auth_logout():
    return await logout_auth()

# @bp.route("/history/delete", methods=["DELETE"])
# async def delete_conversation():
#    await cosmos_db_ready.wait()
#    # get the user id from the request headers
#    authenticated_user = get_authenticated_user_details(request_headers=request.headers)
#    user_id = authenticated_user["user_principal_id"]

#    # check request for conversation_id
#    request_json = await request.get_json()
#    conversation_id = request_json.get("conversation_id", None)

#    try:
#        if not conversation_id:
#            return jsonify({"error": "conversation_id is required"}), 400

#        # make sure cosmos is configured
#        if not current_app.cosmos_conversation_client:
#            raise Exception("CosmosDB is not configured or not working")

#        # delete the conversation messages from cosmos first
#        deleted_messages = await current_app.cosmos_conversation_client.delete_messages(
#            conversation_id, user_id
#        )

#        # Now delete the conversation
#        deleted_conversation = await current_app.cosmos_conversation_client.delete_conversation(
#            user_id, conversation_id
#        )

#        return (
#            jsonify(
#                {
#                    "message": "Successfully deleted conversation and messages",
#                    "conversation_id": conversation_id,
#                }
#            ),
#            200,
#        )
#    except Exception as e:
#        logger.exception("Exception in /history/delete")
#        return jsonify({"error": str(e)}), 500


@bp.route("/history/list", methods=["GET"])
async def list_conversations():
    await cosmos_db_ready.wait()
    offset = request.args.get("offset", 0)
    puid = await get_puid()

    # make sure cosmos is configured
    if not current_app.cosmos_conversation_client:
        raise Exception("CosmosDB is not configured or not working")

    # get the conversations from cosmos
    conversations = await current_app.cosmos_conversation_client.get_conversations(
        puid, offset=offset, limit=0
    )
    if not isinstance(conversations, list):
        return jsonify({"error": f"No conversations for {puid} were found"}), 404

    # return the conversation ids
    return jsonify(conversations), 200


@bp.route("/history/read", methods=["POST"])
async def get_conversation():
    await cosmos_db_ready.wait()
    puid = await get_puid()

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    if not conversation_id:
        return jsonify({"error": "conversation_id is required"}), 400

    # make sure cosmos is configured
    if not current_app.cosmos_conversation_client:
        raise Exception("CosmosDB is not configured or not working")

    # get the conversation object and the related messages from cosmos
    conversation = await current_app.cosmos_conversation_client.get_conversation(
        puid, conversation_id
    )
    # return the conversation id and the messages in the bot frontend format
    if not conversation:
        return (
            jsonify(
                {
                    "error": f"Conversation {conversation_id} was not found. It either does not exist or the logged in user does not have access to it."
                }
            ),
            404,
        )

    # get the messages for the conversation from cosmos
    conversation_messages = await current_app.cosmos_conversation_client.get_messages(
        puid, conversation_id
    )

    # format the messages in the bot frontend format
    messages = [
        {
            "id": msg["id"],
            "role": msg["role"],
            "content": msg["content"],
            "createdAt": msg["createdAt"],
            "feedback": msg.get("feedback"),
        }
        for msg in conversation_messages
    ]

    return jsonify({"conversation_id": conversation_id, "messages": messages}), 200


@bp.route("/history/rename", methods=["POST"])
async def rename_conversation():
    await cosmos_db_ready.wait()
    puid = await get_puid()

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    if not conversation_id:
        return jsonify({"error": "conversation_id is required"}), 400

    # make sure cosmos is configured
    if not current_app.cosmos_conversation_client:
        raise Exception("CosmosDB is not configured or not working")

    # get the conversation from cosmos
    conversation = await current_app.cosmos_conversation_client.get_conversation(
        puid, conversation_id
    )
    if not conversation:
        return (
            jsonify(
                {
                    "error": f"Conversation {conversation_id} was not found. It either does not exist or the logged in user does not have access to it."
                }
            ),
            404,
        )

    # update the title
    title = request_json.get("title", None)
    if not title:
        return jsonify({"error": "title is required"}), 400
    conversation["title"] = title
    updated_conversation = (
        await current_app.cosmos_conversation_client.upsert_conversation(conversation)
    )

    return jsonify(updated_conversation), 200


# @bp.route("/history/delete_all", methods=["DELETE"])
# async def delete_all_conversations():
#    await cosmos_db_ready.wait()
#    # get the user id from the request headers
#    authenticated_user = get_authenticated_user_details(request_headers=request.headers)
#    user_id = authenticated_user["user_principal_id"]

#    # get conversations for user
#    try:
#        # make sure cosmos is configured
#        if not current_app.cosmos_conversation_client:
#            raise Exception("CosmosDB is not configured or not working")

#        conversations = await current_app.cosmos_conversation_client.get_conversations(
#            user_id, offset=0, limit=None
#        )
#        if not conversations:
#            return jsonify({"error": f"No conversations for {user_id} were found"}), 404

#        # delete each conversation
#        for conversation in conversations:
#            # delete the conversation messages from cosmos first
#            deleted_messages = await current_app.cosmos_conversation_client.delete_messages(
#                conversation["id"], user_id
#            )

#            # Now delete the conversation
#            deleted_conversation = await current_app.cosmos_conversation_client.delete_conversation(
#                user_id, conversation["id"]
#            )
#        return (
#            jsonify(
#                {
#                    "message": f"Successfully deleted conversation and messages for user {user_id}"
#                }
#            ),
#            200,
#        )

#    except Exception as e:
#        logger.exception("Exception in /history/delete_all")
#        return jsonify({"error": str(e)}), 500


@bp.route("/history/clear", methods=["POST"])
async def clear_messages():
    await cosmos_db_ready.wait()
    puid = get_puid()

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    try:
        if not conversation_id:
            return jsonify({"error": "conversation_id is required"}), 400

        # make sure cosmos is configured
        if not current_app.cosmos_conversation_client:
            raise Exception("CosmosDB is not configured or not working")

        # delete the conversation messages from cosmos
        deleted_messages = await current_app.cosmos_conversation_client.delete_messages(
            conversation_id, puid
        )

        return (
            jsonify(
                {
                    "message": "Successfully deleted messages in conversation",
                    "conversation_id": conversation_id,
                }
            ),
            200,
        )
    except Exception as e:
        logger.exception("Exception in /history/clear_messages")
        return jsonify({"error": str(e)}), 500


# Get database info from storage account
@bp.route("/database_info", methods=["GET"])
def get_database_info():
    try:
        DATABASE_INFO = list_blob_files(
            AZURE_STORAGE_ACCOUNT_NAME,
            AZURE_STORAGE_CONTAINER_NAME,
        )
        return jsonify(DATABASE_INFO), 200
    except Exception as e:
        logger.exception("Exception in /database_info")
        return jsonify({"error": str(e)}), 500


@bp.route("/history/ensure", methods=["GET"])
async def ensure_cosmos():
    await cosmos_db_ready.wait()
    if not AZURE_COSMOSDB_ACCOUNT:
        return jsonify({"error": "CosmosDB is not configured"}), 404

    try:
        success, err = await current_app.cosmos_conversation_client.ensure()
        if not current_app.cosmos_conversation_client or not success:
            if err:
                return jsonify({"error": err}), 422
            return jsonify({"error": "CosmosDB is not configured or not working"}), 500

        return jsonify({"message": "CosmosDB is configured and working"}), 200
    except Exception as e:
        logger.exception("Exception in /history/ensure")
        cosmos_exception = str(e)
        if "Invalid credentials" in cosmos_exception:
            return jsonify({"error": cosmos_exception}), 401
        elif "Invalid CosmosDB database name" in cosmos_exception:
            return (
                jsonify(
                    {
                        "error": f"{cosmos_exception} {AZURE_COSMOSDB_DATABASE} for account {AZURE_COSMOSDB_ACCOUNT}"
                    }
                ),
                422,
            )
        elif "Invalid CosmosDB container name" in cosmos_exception:
            return (
                jsonify(
                    {
                        "error": f"{cosmos_exception}: {AZURE_COSMOSDB_CONVERSATIONS_CONTAINER}"
                    }
                ),
                422,
            )
        else:
            return jsonify({"error": "CosmosDB is not working"}), 500
        
@bp.route("/generate_sas_url", methods=["POST"])
async def generate_sas_url_endpoint() -> tuple[Response, int]:
    try:
        data = await request.get_json()
        container = data.get("container")
        blob = data.get("blob")
        logger.info(f"Generating SAS URL for blob: {blob} in container: {container}")
        sas_token = generate_sas_token(blob_service_client, container, blob)
        url = f"https://{blob_service_client.account_name}.blob.core.windows.net/{container}/{blob}?{sas_token}"
        return jsonify({"sas_url": url}), 200
    except Exception as e:
        logger.exception("Exception in /generate_sas_url")
        return jsonify({"error": str(e)}), 500


async def generate_title(conversation_messages):
    await azure_openai_ready.wait()

    # make sure the messages are sorted by _ts descending
    title_prompt = """
    Summarize the conversation so far into a 4-word or less title. 
    Do not use any quotation marks or punctuation. 
    Respond with a json object in the format {{"title": string}}. 
    Do not include any other commentary or description.
    """

    messages = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in conversation_messages
    ]
    messages.append({"role": "user", "content": title_prompt})

    try:
        # make sure azure openai client is configured
        if not current_app.azure_openai_client:
            raise Exception("Azure OpenAI client is not configured or not working")
        response = await current_app.azure_openai_client.ainvoke(
            messages, model=current_app.rag_settings.azure_openai_model,
            temperature=1, max_tokens=64, stream=False
        )

        return ConversationTitle.model_validate_json(response.text).title
    except Exception as e:
        return messages[-2]["content"]
    
@bp.route("/download_file", methods=["POST"])
async def download_file_endpoint() -> Response:
    try:
        request_json = await request.get_json()
        blob = request_json.get("blob", None)
        container = request_json.get("container", None)
        file_content = download_file(container, blob)
        filename = blob.split("/")[-1] if blob else "downloaded_file"
        #return await send_file(file_content.blob, as_attachment=True, attachment_filename=filename)
        # Return file content as a list of integers (Uint8Array on frontend)
        return jsonify({
            "filecontent": list(file_content),
            "filename": filename
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


app = create_app()
