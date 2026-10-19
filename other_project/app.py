import copy
import json
import os
import logging
import uuid
import secrets
import asyncio
import calendar
from dotenv import load_dotenv
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta


from quart import (
    Response,
    Blueprint,
    Quart,
    jsonify,
    make_response,
    redirect,
    request,
    session,
    send_from_directory,
    render_template,
    current_app,
    url_for,
)
from quart_cors import cors
from quart_session import Session

from openai import AsyncAzureOpenAI
from azure.storage.blob import BlobServiceClient
from azure.identity.aio import get_bearer_token_provider
from backend.azure_identity import get_azure_credential, get_sync_azure_credential
from azure.data.tables.aio import TableServiceClient

import backend.logging_config  # Logging config. Do not remove.
from backend.auth.access_utils import is_user_admin, is_user_allowed
from backend.auth.auth_utils import get_puid
from backend.config import Config
from backend.history.cosmosdbservice import CosmosConversationClient

from backend.services.redis_service import RedisService
from backend.session.session_manager import SessionManager
from backend.tables.users_repository import UsersRepository
from backend.utils import (
    blob_service_client,
    format_as_ndjson,
    format_stream_response,
    generateFilterString,
    generate_sas_token,
    parse_multi_columns,
    format_non_streaming_response,
)
from backend.auth.auth_controller import (
    login_auth,
    login_callback,
    check_auth,
    logout_auth,
)
from backend.logger import log_model_args
from backend.prompts import (
    get_system_message_from_mode,
    additional_text_related_response,
    additional_text_policy_and_guidance,
    additional_text_evaluate_draft,
    additional_text_ask_anything,
)
from backend.get_metadata import get_metadata_from_search_index
from backend.annex.graph import build_graph
from backend.annex.invoker import annex_stream, annex_non_stream
from backend.annex.config import (
    cosmos_client as annex_cosmos_client,
    config as annex_config,
)
from backend.metadata_returner import search_metadata_by_query

bp = Blueprint("routes", __name__, static_folder="static", template_folder="static")

load_dotenv()


# UI configuration
UI_TAB_TITLE = os.environ.get("UI_TAB_TITLE") or "IRiS"
UI_LOGO = os.environ.get("UI_LOGO")
UI_CHAT_TITLE = os.environ.get("UI_CHAT_TITLE") or "Start your conversation"
UI_FAVICON = os.environ.get("UI_FAVICON") or "/favicon.ico"
UI_SHOW_SHARE_BUTTON = os.environ.get("UI_SHOW_SHARE_BUTTON", "true").lower() == "true"
UI_SHOW_HISTORY = os.environ.get("UI_SHOW_HISTORY", "true").lower() == "true"
UI_SHOW_ADDITIONAL_DOCS = (
    os.environ.get("UI_SHOW_ADDITIONAL_DOCS", "false").lower() == "true"
)
UI_USER_GUIDANCE_LINK = os.environ.get("UI_USER_GUIDANCE_LINK")

APP_ENV = os.environ.get("APP_ENV")

# Initialize global variables
cosmos_db_ready = asyncio.Event()
table_storage_ready = asyncio.Event()
azure_openai_ready = asyncio.Event()
redis_ready = asyncio.Event()
table_storage_ready = asyncio.Event()

config = Config()

# Error messages
COSMOSDB_NOT_CONFIGURED_ERROR = "COSMOSDB_NOT_CONFIGURED_ERROR"


def create_app():
    app = Quart(__name__)
    app.secret_key = secrets.token_hex(16)
    app.register_blueprint(bp)
    app.config["TEMPLATES_AUTO_RELOAD"] = True

    if APP_ENV == "local":
        app = cors(
            app,
            allow_origin=["http://localhost:5173"],
            allow_credentials=True,
            allow_headers=["Content-Type", "Authorization"],
            allow_methods=["GET", "PUT", "POST", "OPTIONS", "HEAD", "PATCH"],
        )

    @app.before_serving
    async def init_services():
        try:
            app.cosmos_conversation_client = await init_cosmosdb_client()
            cosmos_db_ready.set()
        except Exception as e:
            logging.exception("Failed to initialize CosmosDB client")
            app.cosmos_conversation_client = None
            raise e

        try:
            app.table_service_client = await init_table_client()
            table_storage_ready.set()
            app.users_repo = UsersRepository(app.table_service_client)
        except Exception as e:
            logging.exception("Failed to initialize Table Service Client")
            app.table_service_client = None
            raise e

        try:
            # OpenAI Client for general tool use
            app.azure_openai_client = await init_openai_client(
                AZURE_OPENAI_MODEL, use_data=SHOULD_USE_DATA
            )
            # OpenAI Client for title generation
            app.azure_openai_client_title_generation = await init_openai_client(
                AZURE_OPENAI_MODEL, use_data=False
            )
            azure_openai_ready.set()
        except Exception as e:
            logging.exception("Failed to initialize Azure OpenAI client")
            app.azure_openai_client = None
            raise e
        app.config["SESSION_TYPE"] = "redis"

        try:
            redis_service = RedisService()
            await redis_service.init_redis()
            app.config["SESSION_REDIS"] = redis_service.redis_client
            Session(app)
            redis_ready.set()
            app.session_manager = SessionManager()
        except Exception as e:
            logging.exception("Failed to initialize Redis client")
            raise e

        try:
            app.annex_graph = build_graph()
            logging.info("Annex graph initialized.")
        except Exception as e:
            logging.exception("Failed to initialize Annex graph")
            app.annex_graph = None

    return app


@bp.route("/")
async def index():
    return await render_template("index.html", title=UI_TAB_TITLE, favicon=UI_FAVICON)


@bp.route("/admin/users")
async def index_admin():
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

# RAG Settings
DATASOURCE_TYPE = os.environ.get("DATASOURCE_TYPE", "azure_search")
SEARCH_ENABLE_IN_DOMAIN = os.environ.get("SEARCH_ENABLE_IN_DOMAIN", "true")

# Azure AI Search Settings
AZURE_SEARCH_SERVICE = os.environ.get("AZURE_SEARCH_SERVICE")
AZURE_SEARCH_INDEX_CORE = os.environ.get("AZURE_SEARCH_INDEX_CORE")
AZURE_SEARCH_SEMANTIC_CONFIG_CORE = os.environ.get(
    "AZURE_SEARCH_SEMANTIC_CONFIG_CORE", "semantic-config"
)
AZURE_SEARCH_ENABLE_IN_DOMAIN = os.environ.get(
    "AZURE_SEARCH_ENABLE_IN_DOMAIN", SEARCH_ENABLE_IN_DOMAIN
)
AZURE_SEARCH_CONTENT_COLUMNS = os.environ.get("AZURE_SEARCH_CONTENT_COLUMNS")
AZURE_SEARCH_FILENAME_COLUMN = os.environ.get("AZURE_SEARCH_FILENAME_COLUMN")
AZURE_SEARCH_TITLE_COLUMN = os.environ.get("AZURE_SEARCH_TITLE_COLUMN")
AZURE_SEARCH_URL_COLUMN = os.environ.get("AZURE_SEARCH_URL_COLUMN")
AZURE_SEARCH_VECTOR_COLUMNS = os.environ.get("AZURE_SEARCH_VECTOR_COLUMNS")
AZURE_SEARCH_QUERY_TYPE = os.environ.get("AZURE_SEARCH_QUERY_TYPE")
AZURE_SEARCH_PERMITTED_GROUPS_COLUMN = os.environ.get(
    "AZURE_SEARCH_PERMITTED_GROUPS_COLUMN"
)

# top_k and strictness for each mode.
SEARCH_CONFIG = {
    "related_responses": {"top_k": 20, "strictness": 1},
    "policy_and_guidance": {"top_k": 10, "strictness": 1},
    "evaluate_draft": {"top_k": 10, "strictness": 1},
    "ask_anything": {"top_k": 10, "strictness": 1},
}

# TEMPORARY environment variable during volatile testing period where value may change
# After stable value is agreed, move into SEARCH_CONFIG
AZURE_SEARCH_SCORE_THRESHOLD_FIND_ALL = os.environ.get(
    "AZURE_SEARCH_SCORE_THRESHOLD_FIND_ALL", "1.8"
)

# Storage Settings
AZURE_STORAGE_ACCOUNT_NAME = os.environ.get("AZURE_STORAGE_ACCOUNT_NAME")
AZURE_STORAGE_CONTAINER_NAME = os.environ.get("AZURE_STORAGE_CONTAINER_NAME")

# Azure OpenAI Settings
AZURE_OPENAI_RESOURCE = os.environ.get("AZURE_OPENAI_RESOURCE")
AZURE_OPENAI_MODEL = os.environ.get("AZURE_OPENAI_MODEL", "gpt-4")
AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT")
AZURE_OPENAI_TEMPERATURE = os.environ.get("AZURE_OPENAI_TEMPERATURE", 0.2)
AZURE_OPENAI_TOP_P = os.environ.get("AZURE_OPENAI_TOP_P", 1.0)
AZURE_OPENAI_MAX_TOKENS = os.environ.get("AZURE_OPENAI_MAX_TOKENS", 1000)
AZURE_OPENAI_STOP_SEQUENCE = os.environ.get("AZURE_OPENAI_STOP_SEQUENCE")
AZURE_OPENAI_SYSTEM_MESSAGE = os.environ.get(
    "AZURE_OPENAI_SYSTEM_MESSAGE",
    "You are an AI assistant that helps people find information.",
)
AZURE_OPENAI_PREVIEW_API_VERSION = os.environ.get(
    "AZURE_OPENAI_PREVIEW_API_VERSION", "2024-10-21"
)
AZURE_OPENAI_STREAM = os.environ.get("AZURE_OPENAI_STREAM", "true")
AZURE_OPENAI_EMBEDDING_ENDPOINT = os.environ.get("AZURE_OPENAI_EMBEDDING_ENDPOINT")
AZURE_OPENAI_EMBEDDING_NAME = os.environ.get("AZURE_OPENAI_EMBEDDING_NAME", "")
SHOULD_STREAM = True if AZURE_OPENAI_STREAM.lower() == "true" else False

# Chat History CosmosDB Settings
AZURE_COSMOSDB_CONVERSATIONS_DATABASE = os.environ.get(
    "AZURE_COSMOSDB_CONVERSATIONS_DATABASE"
)
AZURE_COSMOSDB_ACCOUNT = os.environ.get("AZURE_COSMOSDB_ACCOUNT")
AZURE_COSMOSDB_CONVERSATIONS_CONTAINER = os.environ.get(
    "AZURE_COSMOSDB_CONVERSATIONS_CONTAINER"
)
AZURE_COSMOSDB_ENABLE_FEEDBACK = (
    os.environ.get("AZURE_COSMOSDB_ENABLE_FEEDBACK", "false").lower() == "true"
)

# Frontend Settings via Environment Variables
AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "true").lower() == "true"
CHAT_HISTORY_ENABLED = (
    AZURE_COSMOSDB_ACCOUNT
    and AZURE_COSMOSDB_CONVERSATIONS_DATABASE
    and AZURE_COSMOSDB_CONVERSATIONS_CONTAINER
)
STORAGE_ACCOUNT_ENABLED = AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_CONTAINER_NAME

# Package Version and Commit Hash
VERSION = os.environ.get("UI_APP_PACKAGE_VERSION")
HASH = os.environ.get("UI_APP_COMMIT_HASH")

frontend_settings = {
    "auth_enabled": AUTH_ENABLED,
    "feedback_enabled": AZURE_COSMOSDB_ENABLE_FEEDBACK and CHAT_HISTORY_ENABLED,
    "azure_storage_container_name": AZURE_STORAGE_CONTAINER_NAME,
    "azure_search_score_threshold_find_all": AZURE_SEARCH_SCORE_THRESHOLD_FIND_ALL,
    "search_config": SEARCH_CONFIG,
    "ui": {
        "logo": UI_LOGO,
        "chat_title": UI_CHAT_TITLE,
        "show_share_button": UI_SHOW_SHARE_BUTTON,
        "show_history": UI_SHOW_HISTORY,
        "show_feedback": True,
        "show_additional_docs": UI_SHOW_ADDITIONAL_DOCS,
        "user_guidance_link": UI_USER_GUIDANCE_LINK,
        "version": VERSION,
        "hash": HASH,
    },
}


# Function to retrieve data from storage account
def list_blob_files(account_name, container_name):
    database_info = None
    if STORAGE_ACCOUNT_ENABLED:
        credential = get_sync_azure_credential()

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
        logging.debug("Storage Account not configured")

    return database_info


def should_use_data():
    global DATASOURCE_TYPE
    if AZURE_SEARCH_SERVICE and AZURE_SEARCH_INDEX_CORE:
        DATASOURCE_TYPE = "azure_search"
        logging.debug("Using Azure Cognitive Search")
        return True
    return False


SHOULD_USE_DATA = should_use_data()


# Initialize Azure OpenAI Client
async def init_openai_client(
    AZURE_OPENAI_MODEL, request=None, use_data=SHOULD_USE_DATA
):
    azure_openai_client = None
    try:
        # Endpoint
        if not AZURE_OPENAI_ENDPOINT and not AZURE_OPENAI_RESOURCE:
            raise Exception(
                "AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_RESOURCE is required"
            )

        endpoint = (
            AZURE_OPENAI_ENDPOINT
            if AZURE_OPENAI_ENDPOINT
            else f"https://{AZURE_OPENAI_RESOURCE}.openai.azure.com/"
        )

        # Authentication
        credential = get_azure_credential()
        ad_token_provider = get_bearer_token_provider(
            credential, "https://cognitiveservices.azure.com/.default"
        )

        deployment = AZURE_OPENAI_MODEL
        if not deployment:
            raise Exception("AZURE_OPENAI_MODEL is required")

        # Default Headers
        default_headers = {"x-ms-useragent": USER_AGENT}

        if use_data:
            base_url: str = (
                f"{str(endpoint).rstrip('/')}/openai/deployments/{deployment}"
            )
            azure_openai_client = AsyncAzureOpenAI(
                base_url=str(base_url),
                api_version=AZURE_OPENAI_PREVIEW_API_VERSION,
                azure_ad_token_provider=ad_token_provider,
                default_headers=default_headers,
            )
        else:
            azure_openai_client = AsyncAzureOpenAI(
                api_version=AZURE_OPENAI_PREVIEW_API_VERSION,
                azure_ad_token_provider=ad_token_provider,
                default_headers=default_headers,
                azure_endpoint=endpoint,
            )
        return azure_openai_client
    except Exception as e:
        logging.exception("Exception in Azure OpenAI initialization", e)
        azure_openai_client = None
        raise e


async def init_cosmosdb_client():
    cosmos_conversation_client = None
    if CHAT_HISTORY_ENABLED:
        try:
            cosmos_endpoint = (
                f"https://{AZURE_COSMOSDB_ACCOUNT}.documents.azure.com:443/"
            )

            credential = get_azure_credential()

            cosmos_conversation_client = CosmosConversationClient(
                cosmosdb_endpoint=cosmos_endpoint,
                credential=credential,
                database_name=AZURE_COSMOSDB_CONVERSATIONS_DATABASE,
                container_name=AZURE_COSMOSDB_CONVERSATIONS_CONTAINER,
                enable_message_feedback=AZURE_COSMOSDB_ENABLE_FEEDBACK,
            )
        except Exception as e:
            logging.exception("Exception in CosmosDB initialization", e)
            cosmos_conversation_client = None
            raise e
    else:
        logging.debug("CosmosDB not configured")

    return cosmos_conversation_client


async def init_table_client():
    credential = get_sync_azure_credential()

    table_service_client = TableServiceClient(
        f"https://{config.azure_storage_account_name}.table.core.windows.net",
        credential=credential,
    )

    return table_service_client


# EDIT - to filter by doctype
def create_filter_query(filter_data, mode):
    def get_true_keys(dictionary):
        return [key for key, value in dictionary.items() if value]

    filter_query = ""

    # Case type and date filtering is disabled for policy and guidance and evaluate draft modes
    if mode == "policy_and_guidance":
        filter_query += "(guidance eq 'true')"
    elif mode == "evaluate_draft":
        filter_query += "(case_type eq 'JSP101')"
    else:
        for filter_field in filter_data:
            if filter_field == "casetypes":
                true_keys = get_true_keys(filter_data[filter_field])

                # if all checkboxes selected OR no checkboxes selected, return no filter
                if not true_keys or len(true_keys) == len(filter_data[filter_field]):
                    continue

                filter_query += "(case_type eq null or "
                filter_query += " or ".join(
                    [f"case_type eq '{key}'" for key in true_keys]
                )
                filter_query += ")"
            elif filter_field == "monthsCutoff":
                # If monthsCutoff is None (All time), skip date filtering
                months_cutoff = filter_data[filter_field]
                if months_cutoff is None:
                    continue

                # Calculate date cutoff using same logic as metadata search
                date_cutoff = (
                    datetime.now() - relativedelta(months=months_cutoff)
                ).strftime("%Y-%m-%dT%H:%M:%SZ")

                if filter_query != "":
                    filter_query += " and "

                # Filter by date_received field (Azure Search uses plain ISO 8601)
                filter_query += f"date_received ge {date_cutoff}"

                if mode == "related_responses":
                    filter_query += " and (guidance ne 'true')"

    # Always exclude MC, MCSOS, POA, and TO
    # Including `case_type eq null` as Azure Search can cause ne comparisons against null to evaluate to null/false,
    # unintentionally filtering out documents with no case_type
    common_filter = "(case_type eq null or (case_type ne 'MC' and case_type ne 'MCSOS' and case_type ne 'POA' and case_type ne 'TO'))"
    if filter_query:
        filter_query += " and " + common_filter
    else:
        filter_query = common_filter

    return filter_query


def get_configured_data_source(request):
    data_source = {}
    query_type = "vector_semantic_hybrid"
    if DATASOURCE_TYPE == "azure_search":
        # Set query type
        if AZURE_SEARCH_QUERY_TYPE and AZURE_SEARCH_QUERY_TYPE.strip():
            query_type = AZURE_SEARCH_QUERY_TYPE

        # Set filter

        filter = create_filter_query(request.get("settings"), request.get("mode"))
        # userToken = None
        # if AZURE_SEARCH_PERMITTED_GROUPS_COLUMN:
        #    userToken = request.headers.get("X-MS-TOKEN-AAD-ACCESS-TOKEN", "")
        #    logging.debug(f"USER TOKEN is {'present' if userToken else 'not present'}")
        #    if not userToken:
        #        raise Exception(
        #            "Document-level access control is enabled, but user access token could not be fetched."
        #        )

        #    filter = generateFilterString(userToken)
        #    logging.debug(f"FILTER: {filter}")

        # Set authentication
        authentication = {"type": "system_assigned_managed_identity"}

        # Set system message based on mode selected
        mode = request.get("mode")
        settings = request.get("settings")
        system_message = get_system_message_from_mode(mode)

        logging.debug(f"Received mode: {mode}")
        logging.debug(f"Received settings: {settings}")
        logging.debug(f"System message: {system_message}")

        data_source = {
            "type": "azure_search",
            "parameters": {
                "endpoint": f"https://{AZURE_SEARCH_SERVICE}.search.windows.net",
                "authentication": authentication,
                "index_name": AZURE_SEARCH_INDEX_CORE,
                "fields_mapping": {
                    "content_fields": [
                        "case_ref",
                        "content",
                    ],  # These are the only fields from the search index passed to the LLM context window, in the specified order.
                    "title_field": None,
                    "url_field": (
                        AZURE_SEARCH_URL_COLUMN if AZURE_SEARCH_URL_COLUMN else None
                    ),
                    "filepath_field": "case_ref",
                    "vector_fields": (
                        parse_multi_columns(AZURE_SEARCH_VECTOR_COLUMNS)
                        if AZURE_SEARCH_VECTOR_COLUMNS
                        else []
                    ),
                },
                "in_scope": (
                    True if AZURE_SEARCH_ENABLE_IN_DOMAIN.lower() == "true" else False
                ),
                "top_n_documents": SEARCH_CONFIG[mode]["top_k"],
                "query_type": query_type,
                "filter": filter,
                "strictness": SEARCH_CONFIG[mode]["strictness"],
                "include_contexts": [
                    "citations",
                    "intent",
                    "all_retrieved_documents",
                ],
            },
        }
    else:
        raise Exception(
            f"DATASOURCE_TYPE is not configured or unknown: {DATASOURCE_TYPE}"
        )

    if "semantic" in query_type.lower():
        data_source["parameters"][
            "semantic_configuration"
        ] = AZURE_SEARCH_SEMANTIC_CONFIG_CORE

    if "vector" in query_type.lower() and DATASOURCE_TYPE != "azure_ml_index":
        embeddingDependency = {}
        if AZURE_OPENAI_EMBEDDING_NAME:
            embeddingDependency = {
                "type": "deployment_name",
                "deployment_name": AZURE_OPENAI_EMBEDDING_NAME,
            }
        else:
            raise Exception(
                f"Vector query type ({query_type}) is selected for data source type {DATASOURCE_TYPE} but AZURE_OPENAI_EMBEDDING_NAME is not configured"
            )
        data_source["parameters"]["embedding_dependency"] = embeddingDependency

    return data_source


def append_text_to_question(original_question, mode):
    if mode == "related_responses":
        return additional_text_related_response + " " + original_question
    elif mode == "policy_and_guidance":
        return additional_text_policy_and_guidance + " " + original_question
    elif mode == "evaluate_draft":
        return additional_text_evaluate_draft + " " + original_question
    elif mode == "ask_anything":
        return additional_text_ask_anything + " " + original_question
    else:
        return original_question


def prepare_model_args(request):
    request_messages = request.get("messages", [])
    messages = []

    # Set system message based on mode selected
    mode = request.get("mode")
    system_message = get_system_message_from_mode(mode)

    temperature = AZURE_OPENAI_TEMPERATURE
    model = AZURE_OPENAI_MODEL

    messages = [{"role": "system", "content": system_message}]

    # count how many user questions are in chat history: user_message_count=1 is the first question in the chat
    user_message_count = sum(1 for msg in request_messages if msg["role"] == "user")

    for message in request_messages:
        if message:
            if message["role"] == "user" and user_message_count == 1:
                modified_content = append_text_to_question(message["content"], mode)
                messages.append({"role": message["role"], "content": modified_content})
            else:
                messages.append(
                    {"role": message["role"], "content": message["content"]}
                )

    model_args = {
        "messages": messages,
        "temperature": float(temperature),
        "max_tokens": int(AZURE_OPENAI_MAX_TOKENS),
        "top_p": float(AZURE_OPENAI_TOP_P),
        "stop": (
            parse_multi_columns(AZURE_OPENAI_STOP_SEQUENCE)
            if AZURE_OPENAI_STOP_SEQUENCE
            else None
        ),
        "stream": SHOULD_STREAM,
        "model": model,
    }

    if SHOULD_USE_DATA:
        model_args["extra_body"] = {
            "data_sources": [get_configured_data_source(request)]
        }

    log_model_args(model_args)
    return model_args


async def send_chat_request(request, filter_query=None):
    await azure_openai_ready.wait()
    model_args = prepare_model_args(request)

    try:
        # make sure azure openai client is configured
        if not current_app.azure_openai_client:
            raise Exception("Azure OpenAI client is not configured or not working")
        response = await current_app.azure_openai_client.chat.completions.create(
            **model_args
        )

    except Exception as e:
        logging.exception("Exception in send_chat_request", e)
        raise e

    return response


async def complete_chat_request(request_body):
    response = await send_chat_request(request_body)
    history_metadata = request_body.get("history_metadata", {})

    return format_non_streaming_response(response, history_metadata)


async def stream_chat_request(request_body):
    response = await send_chat_request(request_body)
    history_metadata = request_body.get("history_metadata", {})

    async def generate():
        async for completionChunk in response:
            yield format_stream_response(completionChunk, history_metadata)

    return generate()


async def conversation_internal(request_body):
    try:
        if SHOULD_STREAM:
            result = await stream_chat_request(request_body)
            response = await make_response(format_as_ndjson(result))
            response.timeout = None
            response.mimetype = "application/json-lines"
            return response
        else:
            result = await complete_chat_request(request_body)
            return jsonify(result)

    except Exception as ex:
        logging.exception("Exception in conversation_internal:", ex)
        history_metadata = request_body.get("history_metadata", {})
        if hasattr(ex, "status_code"):
            return (
                jsonify({"error": str(ex), "history_metadata": history_metadata}),
                ex.status_code,
            )
        else:
            return (
                jsonify({"error": str(ex), "history_metadata": history_metadata}),
                500,
            )


@bp.route("/conversation", methods=["POST"])
async def conversation():
    if not request.is_json:
        return jsonify({"error": "request must be json"}), 415
    request_json = await request.get_json()

    return await conversation_internal(request_json)


@bp.route("/frontend_settings", methods=["GET"])
async def get_frontend_settings():
    await redis_ready.wait()

    try:
        hasAcceptedTerms = await app.session_manager.has_accepted_terms()
        new_frontend_settings = dict(frontend_settings)
        new_frontend_settings["hasAcceptedTerms"] = hasAcceptedTerms

        return jsonify(new_frontend_settings), 200
    except Exception as e:
        logging.exception("Exception in /frontend_settings")
        return jsonify({"error": str(e)}), 500


@bp.route("/accept_terms", methods=["POST"])
async def accept_terms():
    await redis_ready.wait()

    try:
        await app.session_manager.accept_term()
        return jsonify({"success": True}), 200
    except Exception as e:
        logging.exception("Exception in /accept_terms", e)
        return jsonify({"error": str(e)}), 500


# Get metadata from search index API
@bp.route("/get_metadata", methods=["POST"])
async def get_metadata():
    try:
        data = await request.get_json()

        # Check if 'case_ref' is in the data
        if "case_ref" not in data:
            raise KeyError("case_ref not found in the request data")

        case_ref = data["case_ref"]
        metadata = get_metadata_from_search_index(case_ref)
        return jsonify(metadata), 200
    except Exception as e:
        logging.exception("Exception in /get_metadata")
        return jsonify({"error": str(e)}), 500


# Information Annex API
@bp.route("/annex/mp_list", methods=["GET"])
async def annex_mp_list():
    try:
        database = annex_cosmos_client.get_database_client(
            annex_config.AZURE_COSMOSDB_ANNEX_DATABASE
        )
        container = database.get_container_client(
            annex_config.AZURE_COSMOSDB_ANNEX_CONTAINER
        )

        query = "SELECT c.name_list, c.member_id FROM c ORDER BY c.name_list"
        items = [item async for item in container.query_items(query=query)]

        return jsonify(items), 200
    except Exception as e:
        logging.exception("Exception in /annex/mp_list")
        return jsonify({"error": str(e)}), 500


# Generates an information annex using the annex graph, and saves to CosmosDB.
@bp.route("/annex/generate", methods=["POST"])
async def annex_generate():
    if not request.is_json:
        return jsonify({"error": "request must be JSON"}), 415

    request_json = await request.get_json()
    mp_name_list = request_json.get("mp_name_list")
    mp_question = request_json.get("mp_question")

    if not mp_name_list or not mp_question:
        return jsonify({"error": "mp_name_list and mp_question are required"}), 400

    if current_app.annex_graph is None:
        return jsonify({"error": "Information Annex is not available"}), 503

    # Prepare Cosmos DB conversation tracking
    cosmos_client = current_app.cosmos_conversation_client
    puid = await get_puid()
    conversation_id = None
    assistant_message_id = str(uuid.uuid4())

    # Create conversation and user message in Cosmos DB (if available)
    if cosmos_client:
        try:
            # Creates a Cosmos record to setup the conversation_id and title for the conversation.
            conversation = await cosmos_client.create_conversation(
                user_id=puid,
                title=f"Annex: {mp_name_list}",
                mode="information_annex",
            )
            conversation_id = conversation["id"]

            # Creates a Cosmos record to capture the user's input.
            await cosmos_client.create_message(
                uuid=str(uuid.uuid4()),
                conversation_id=conversation_id,
                user_id=puid,
                input_message={
                    "role": "user",
                    "content": {
                        "mp_name_list": mp_name_list,
                        "mp_question": mp_question,
                    },
                },
                mode="information_annex",
            )
        except Exception as e:
            logging.exception("Failed to create annex conversation in CosmosDB")
            conversation_id = None

    try:
        if SHOULD_STREAM:
            stream, result_holder = annex_stream(
                current_app.annex_graph, mp_name_list, mp_question
            )

            async def stream_and_save():
                async for chunk in stream:
                    yield chunk

                # After stream completes, save the full response to Cosmos DB
                full_text = result_holder.get("full_text", "")
                graph_state = result_holder.get("graph_state", {})
                if cosmos_client and conversation_id and full_text:
                    try:
                        # Creates a Cosmos record to capture the assistant's response and final graph state.
                        await cosmos_client.create_message(
                            uuid=assistant_message_id,
                            conversation_id=conversation_id,
                            user_id=puid,
                            input_message={
                                "role": "assistant",
                                "content": full_text,
                            },
                            mode="information_annex",
                            extra_fields={"graph_state": graph_state},
                        )
                    except Exception:
                        logging.exception(
                            "Failed to save annex assistant message to CosmosDB"
                        )

                # Yield a final metadata chunk with conversation info
                yield json.dumps(
                    {
                        "conversation_id": conversation_id,
                        "message_id": assistant_message_id,
                    }
                ) + "\n"

            response = await make_response(stream_and_save())
            response.timeout = None
            response.mimetype = "application/json-lines"
            return response

        # For non-streamed responses
        else:
            response_content, graph_state = await annex_non_stream(
                current_app.annex_graph, mp_name_list, mp_question
            )

            # Creates a Cosmos record to capture the assistant's response and final graph state.
            if cosmos_client and conversation_id:
                try:
                    await cosmos_client.create_message(
                        uuid=assistant_message_id,
                        conversation_id=conversation_id,
                        user_id=puid,
                        input_message={
                            "role": "assistant",
                            "content": response_content,
                        },
                        mode="information_annex",
                        extra_fields={"graph_state": graph_state},
                    )
                except Exception:
                    logging.exception(
                        "Failed to save annex assistant message to CosmosDB"
                    )

            return (
                jsonify(
                    {
                        "answer": response_content,
                        "conversation_id": conversation_id,
                        "message_id": assistant_message_id,
                    }
                ),
                200,
            )

    except Exception as e:
        logging.exception("Exception in /annex/generate")

        if cosmos_client and conversation_id:
            # If an error occurs, try to save an error message to Cosmos DB with the exception details.
            try:
                await cosmos_client.create_message(
                    uuid=assistant_message_id,
                    conversation_id=conversation_id,
                    user_id=puid,
                    input_message={
                        "role": "error",
                        "content": "An error occurred while generating the annex.",
                        "error_message": str(e),
                    },
                    mode="information_annex",
                )
            except Exception:
                logging.exception("Failed to save annex error message to CosmosDB")

        return jsonify({"error": str(e)}), 500


# Search metadata by query API
@bp.route("/search_metadata", methods=["POST"])
async def search_metadata_route():
    await cosmos_db_ready.wait()
    puid = await get_puid()

    try:
        data = await request.get_json()

        # Check required parameters
        if "query" not in data:
            raise KeyError("query not found in the request data")
        if "case_types" not in data:
            raise KeyError("case_types not found in the request data")

        query = data["query"]
        case_types = data["case_types"]
        months_cutoff = data.get("months_cutoff", None)  # Optional parameter
        top = data.get("top", 50)  # Default to 50 results
        conversation_id = data.get("conversation_id", None)

        # Validate case_types is a list
        if not isinstance(case_types, list):
            raise ValueError("case_types must be a list")

        # Make sure cosmos is configured
        if not current_app.cosmos_conversation_client:
            raise RuntimeError(COSMOSDB_NOT_CONFIGURED_ERROR)

        # Create or get conversation
        history_metadata = {}
        if not conversation_id:
            # Generate a simple title from the query
            title = (
                f"Metadata: {query[:50]}" if len(query) > 50 else f"Metadata: {query}"
            )
            conversation_dict = (
                await current_app.cosmos_conversation_client.create_conversation(
                    user_id=puid, title=title, mode="metadata_search"
                )
            )
            conversation_id = conversation_dict["id"]
            history_metadata["title"] = title
            history_metadata["date"] = conversation_dict["createdAt"]

        # Create user message with query and filters
        user_message_content = json.dumps(
            {
                "query": query,
                "case_types": case_types,
                "months_cutoff": months_cutoff,
                "top": top,
            }
        )

        user_message = {"role": "user", "content": user_message_content}

        # Log user message to Cosmos
        await current_app.cosmos_conversation_client.create_message(
            uuid=str(uuid.uuid4()),
            conversation_id=conversation_id,
            user_id=puid,
            input_message=user_message,
            mode="metadata_search",
        )

        # Execute the metadata search
        result = await search_metadata_by_query(
            query=query, case_types=case_types, months_cutoff=months_cutoff, top=top
        )

        # Create assistant message with results
        # Convert results to a structured format for logging
        assistant_message_content = json.dumps(
            {
                "grouped_metadata": result.get("grouped_metadata", {}),
                "total_results": sum(
                    len(cases) for cases in result.get("grouped_metadata", {}).values()
                ),
                "error_messages": result.get("public_error_messages", []),
            }
        )

        assistant_message = {"role": "assistant", "content": assistant_message_content}

        # Log assistant message to Cosmos
        await current_app.cosmos_conversation_client.create_message(
            uuid=str(uuid.uuid4()),
            conversation_id=conversation_id,
            user_id=puid,
            input_message=assistant_message,
            mode="metadata_search",
        )

        # Add history metadata to result
        history_metadata["conversation_id"] = conversation_id
        result["history_metadata"] = history_metadata

        return jsonify(result), 200
    except Exception as e:
        logging.exception("Exception in /search_metadata")
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
        # Set system message based on mode selected
        mode = request_json.get("mode")

        # make sure cosmos is configured
        if not current_app.cosmos_conversation_client:
            raise RuntimeError(COSMOSDB_NOT_CONFIGURED_ERROR)

        # check for the conversation_id, if the conversation is not set, we will create a new one
        history_metadata = {}
        if not conversation_id:
            title = await generate_title(request_json["messages"])
            conversation_dict = (
                await current_app.cosmos_conversation_client.create_conversation(
                    user_id=puid, title=title, mode=mode
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
                    mode=mode,
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
        logging.exception("Exception in /history/generate")

        # Save error message to Cosmos DB
        if current_app.cosmos_conversation_client and conversation_id:
            try:
                await current_app.cosmos_conversation_client.create_message(
                    uuid=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    user_id=puid,
                    input_message={
                        "role": "error",
                        "content": "An error occurred while generating the response.",
                        "error_message": str(e),
                    },
                    mode=mode,
                )
            except Exception:
                logging.exception("Failed to save error message to CosmosDB")

        return jsonify({"error": str(e)}), 500


@bp.route("/history/update", methods=["POST"])
async def update_conversation():
    await cosmos_db_ready.wait()
    puid = await get_puid()

    # check request for conversation_id
    request_json = await request.get_json()
    conversation_id = request_json.get("conversation_id", None)

    # Set system message based on mode selected
    mode = request_json.get("mode")

    try:
        # make sure cosmos is configured
        if not current_app.cosmos_conversation_client:
            raise RuntimeError(COSMOSDB_NOT_CONFIGURED_ERROR)

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
                    mode=mode,
                )
            # write the assistant message
            await current_app.cosmos_conversation_client.create_message(
                uuid=messages[-1]["id"],
                conversation_id=conversation_id,
                user_id=puid,
                input_message=messages[-1],
                mode=mode,
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
                        mode=mode,
                    )
                # write the assistant message
                await current_app.cosmos_conversation_client.create_message(
                    uuid=messages[-2]["id"],
                    conversation_id=conversation_id,
                    user_id=puid,
                    input_message=messages[-1],
                    mode=mode,
                )
            elif len(messages) > 1 and messages[-2].get("role", None) == "tool":
                # write the tool message first
                await current_app.cosmos_conversation_client.create_message(
                    uuid=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    user_id=puid,
                    input_message=messages[-2],
                    mode=mode,
                )
            # write the error message
            await current_app.cosmos_conversation_client.create_message(
                uuid=messages[-1]["id"],
                conversation_id=conversation_id,
                user_id=puid,
                input_message=messages[-1],
                mode=mode,
            )
        else:
            raise Exception("No bot messages found")

        # Submit request to Chat Completions for response
        response = {"success": True}
        return jsonify(response), 200

    except Exception as e:
        logging.exception("Exception in /history/update")

        # Save error message to Cosmos DB
        if current_app.cosmos_conversation_client and conversation_id:
            try:
                await current_app.cosmos_conversation_client.create_message(
                    uuid=str(uuid.uuid4()),
                    conversation_id=conversation_id,
                    user_id=puid,
                    input_message={
                        "role": "error",
                        "content": "An error occurred while updating the conversation.",
                        "error_message": str(e),
                    },
                    mode=mode,
                )
            except Exception:
                logging.exception("Failed to save error message to CosmosDB")

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
        logging.exception("Exception in /history/message_feedback")
        return jsonify({"error": str(e)}), 500


@bp.route("/history/message_copy", methods=["POST"])
async def update_message_copy():
    await cosmos_db_ready.wait()
    puid = await get_puid()

    # check request for message_id
    request_json = await request.get_json()
    message_id = request_json.get("message_id", None)
    message_copy = request_json.get("message_copy", None)
    try:
        if not message_id:
            return jsonify({"error": "message_id is required"}), 400

        if not message_copy:
            return jsonify({"error": "message_copy is required"}), 400

        # update the message in cosmos
        updated_message = (
            await current_app.cosmos_conversation_client.update_message_copy(
                puid, message_id, message_copy
            )
        )
        if updated_message:
            return (
                jsonify(
                    {
                        "message": f"Successfully updated message with copied = true {message_copy}",
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
        logging.exception("Exception in /history/message_copy")
        return jsonify({"error": str(e)}), 500


@bp.before_request
async def auth_middleware():
    non_protected_routes = [
        url_for("routes.login"),
        url_for("routes.auth_callback"),
        url_for("routes.auth_callback_api"),
        url_for("routes.auth_check"),
        url_for("routes.auth_logout"),
        url_for("routes.get_frontend_settings"),
        url_for("routes.healthz"),
    ]

    try:
        if config.auth_enabled and request.path not in non_protected_routes:
            authenticated = await check_auth()
            if not authenticated:
                if request.path == url_for("routes.index"):
                    return await login_auth(True)

                return jsonify({"error": "User is not authenticated"}), 401

            puid = await app.session_manager.get_user_puid()
            if not puid:
                # User is logging in for the first time and puid is not set - redirect to login
                return jsonify({"error": "Unauthorised"}), 401

            user_allowed = await is_user_allowed(puid, app.users_repo)
            if not user_allowed:
                return (
                    jsonify(
                        {
                            "error": "Use of this tool is restricted. To request access, please get in touch with your FOI/PQ lead."
                        }
                    ),
                    403,
                )
    except:
        return jsonify({"error": "Internal Server Error"}), 500

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

    try:
        authenticated = await check_auth()

        if not authenticated:
            return (
                jsonify({"success": False, "error": "User is not authenticated"}),
                401,
            )

        puid = await app.session_manager.get_user_puid()
        if not puid:
            return jsonify({"error": "authcheck:: User's puid not set"}), 401

        user_allowed = await is_user_allowed(puid, app.users_repo)
        if not user_allowed:
            return jsonify({"error": "AuthCheck: User is not allowed"}), 403

        return jsonify({"success": True}), 200
    except Exception:
        return jsonify({"success": False, "error": "Internal Server Error"}), 500


@bp.route("/auth/logout", methods=["GET"])
async def auth_logout():
    return await logout_auth()


@bp.route("/api/users", methods=["GET"])
async def users():
    await table_storage_ready.wait()

    puid = await app.session_manager.get_user_puid()
    if not puid:
        return jsonify({"error": "admin_users:: User's puid not set"}), 401
    is_admin = await is_user_admin(puid, app.users_repo)
    if not is_admin:
        return jsonify({"error": "admin_users:: access denied"}), 401

    users = await app.users_repo.get_users()

    return jsonify(users), 200


@bp.route("/api/user/role", methods=["POST"])
async def change_role():
    await table_storage_ready.wait()

    try:
        puid = await app.session_manager.get_user_puid()
        if not puid:
            return jsonify({"error": "admin_users:: User's puid not set"}), 401
        is_admin = await is_user_admin(puid, app.users_repo)
        if not is_admin:
            return jsonify({"error": "admin_users:: access denied"}), 401

        request_json = await request.get_json()
        user_id = request_json.get("user_id")
        role = request_json.get("role")

        if not app.users_repo.is_valid_role(role):
            return jsonify({"error": "Invalid role"}), 400

        if user_id == puid:
            return jsonify({"error": "Cannot change own role"}), 400

        logging.debug(f"Updating user {user_id} with role {role}")

        await app.users_repo.update_role(user_id, role)

        return jsonify({"user_id": user_id, "role": role}), 200

    except Exception as e:
        logging.exception("Exception in /api/user/role", e)
        return jsonify({"error", "Internal Server Error"}), 500


@bp.route("/api/user/add", methods=["POST"])
async def add_user():
    await table_storage_ready.wait()

    try:
        puid = await app.session_manager.get_user_puid()
        if not puid:
            return jsonify({"error": "admin_users:: User's puid not set"}), 401
        is_admin = await is_user_admin(puid, app.users_repo)
        if not is_admin:
            return jsonify({"error": "admin_users:: access denied"}), 401

        request_json = await request.get_json()
        user_id = request_json.get("user_id")
        secretariat = request_json.get("secretariat")
        role = request_json.get("role")

        if not app.users_repo.is_valid_role(role):
            return jsonify({"error": "Invalid role"}), 400

        user_exists = await app.users_repo.user_exists(user_id)
        if user_exists:
            return jsonify({"error": "User already exists"}), 400

        logging.debug(
            f"Add user {user_id}, secretariat {secretariat}, with role {role}"
        )

        await app.users_repo.add_user(user_id, secretariat, role)

        return (
            jsonify({"user_id": user_id, "secretariat": secretariat, "role": role}),
            200,
        )

    except Exception as e:
        logging.exception("Exception in /api/user/add", e)
        return jsonify({"error", "Internal Server Error"}), 500


@bp.route("/api/user/remove", methods=["POST"])
async def remove_user():
    await table_storage_ready.wait()

    try:
        puid = await app.session_manager.get_user_puid()
        if not puid:
            return jsonify({"error": "admin_users:: User's puid not set"}), 401
        is_admin = await is_user_admin(puid, app.users_repo)
        if not is_admin:
            return jsonify({"error": "admin_users:: access denied"}), 401

        request_json = await request.get_json()
        user_id = request_json.get("user_id")

        if user_id == puid:
            return jsonify({"error": "Cannot remove your own account"}), 400

        await app.users_repo.delete_user(user_id)

        return jsonify({"user_id": user_id}), 200

    except Exception as e:
        logging.exception("Exception in /api/user/remove", e)
        return jsonify({"error", "Internal Server Error"}), 500


@bp.route("/user", methods=["GET"])
async def user():
    await table_storage_ready.wait()

    puid = await app.session_manager.get_user_puid()
    if not puid:
        return jsonify({"error": "user:: User's puid not set"}), 401

    user = await app.users_repo.get_user(puid)

    return jsonify(user), 200


# @bp.route("/history/delete", methods=["DELETE"])
# async def delete_conversation():
# await cosmos_db_ready.wait()
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
#            raise RuntimeError(COSMOSDB_NOT_CONFIGURED_ERROR)

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
#        logging.exception("Exception in /history/delete")
#        return jsonify({"error": str(e)}), 500


@bp.route("/history/list", methods=["GET"])
async def list_conversations():
    await cosmos_db_ready.wait()
    offset = request.args.get("offset", 0)
    puid = await get_puid()

    # make sure cosmos is configured
    if not current_app.cosmos_conversation_client:
        raise RuntimeError(COSMOSDB_NOT_CONFIGURED_ERROR)

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
        raise RuntimeError(COSMOSDB_NOT_CONFIGURED_ERROR)

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
        raise RuntimeError(COSMOSDB_NOT_CONFIGURED_ERROR)

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
# await cosmos_db_ready.wait()
#    # get the user id from the request headers
#    authenticated_user = get_authenticated_user_details(request_headers=request.headers)
#    user_id = authenticated_user["user_principal_id"]

#    # get conversations for user
#    try:
#        # make sure cosmos is configured
#        if not current_app.cosmos_conversation_client:
#            raise RuntimeError(COSMOSDB_NOT_CONFIGURED_ERROR)

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
#        logging.exception("Exception in /history/delete_all")
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
            raise RuntimeError(COSMOSDB_NOT_CONFIGURED_ERROR)

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
        logging.exception("Exception in /history/clear_messages")
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
        logging.exception("Exception in /database_info")
        return jsonify({"error": str(e)}), 500


@bp.route("/history/ensure", methods=["GET"])
async def ensure_cosmos():
    await cosmos_db_ready.wait()

    try:
        success, err = await current_app.cosmos_conversation_client.ensure()
        if not current_app.cosmos_conversation_client or not success:
            if err:
                return jsonify({"error": err}), 422
            return jsonify({"error": COSMOSDB_NOT_CONFIGURED_ERROR}), 500

        return jsonify({"message": "CosmosDB is configured and working"}), 200
    except Exception as e:
        logging.exception("Exception in /history/ensure")
        cosmos_exception = str(e)
        if "Invalid credentials" in cosmos_exception:
            return jsonify({"error": cosmos_exception}), 401
        elif "Invalid CosmosDB database name" in cosmos_exception:
            return (
                jsonify(
                    {
                        "error": f"{cosmos_exception} {AZURE_COSMOSDB_CONVERSATIONS_DATABASE} for account {AZURE_COSMOSDB_ACCOUNT}"
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
        logging.info(f"Generating SAS URL for blob: {blob} in container: {container}")
        sas_token = generate_sas_token(blob_service_client, container, blob)
        url = f"https://{blob_service_client.account_name}.blob.core.windows.net/{container}/{blob}?{sas_token}"
        return jsonify({"sas_url": url}), 200
    except Exception as e:
        logging.exception("Exception in /generate_sas_url")
        return jsonify({"error": str(e)}), 500


async def generate_title(conversation_messages):
    await azure_openai_ready.wait()

    # make sure the messages are sorted by _ts descending
    title_prompt = """
    Summarize the conversation so far into a 4-word or less title. 
    Do not use any quotation marks or punctuation. 
    Respond with a json object in the format {"title": string}. 
    Do not include any other commentary or description.
    """

    messages = [
        {"role": msg["role"], "content": msg["content"]}
        for msg in conversation_messages
    ]
    messages.append({"role": "user", "content": title_prompt})

    try:
        # make sure azure openai client is configured
        if not current_app.azure_openai_client_title_generation:
            raise Exception(
                "Azure OpenAI client is not configured or not working for title generation"
            )
        response = await current_app.azure_openai_client_title_generation.chat.completions.create(
            model=AZURE_OPENAI_MODEL, messages=messages, temperature=1, max_tokens=64
        )
        title = json.loads(response.choices[0].message.content)["title"]
        return title
    except Exception as e:
        logging.exception("Exception in generate_title")
        return messages[-2]["content"]


app = create_app()
