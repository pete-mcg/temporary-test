import os
import logging
from langchain_openai import AzureChatOpenAI
from azure.search.documents.aio import SearchClient
from azure.identity.aio import get_bearer_token_provider
from backend.azure_identity import get_azure_credential
from azure.cosmos.aio import CosmosClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


class AppConfig:
    def __init__(self):

        # Azure OpenAI
        self.AZURE_OPENAI_PREVIEW_API_VERSION = os.getenv(
            "AZURE_OPENAI_PREVIEW_API_VERSION", "2024-10-21"
        )
        self.AZURE_OPENAI_RESOURCE = os.getenv("AZURE_OPENAI_RESOURCE")
        self.AZURE_OPENAI_MODEL = os.getenv("AZURE_OPENAI_MODEL")
        self.AZURE_OPENAI_TEMPERATURE = float(
            os.getenv("AZURE_OPENAI_TEMPERATURE", "0.2")
        )

        # Azure Search
        self.AZURE_SEARCH_SERVICE = os.getenv("AZURE_SEARCH_SERVICE")
        self.AZURE_SEARCH_INDEX_HANSARD = os.getenv("AZURE_SEARCH_INDEX_HANSARD")
        self.AZURE_SEARCH_INDEX_CORE = os.getenv("AZURE_SEARCH_INDEX_CORE")
        self.AZURE_SEARCH_SEMANTIC_CONFIG_HANSARD = os.getenv(
            "AZURE_SEARCH_SEMANTIC_CONFIG_HANSARD"
        )
        self.AZURE_SEARCH_SEMANTIC_CONFIG_CORE = os.getenv(
            "AZURE_SEARCH_SEMANTIC_CONFIG_CORE"
        )

        # Azure Cosmos DB
        self.AZURE_COSMOSDB_ACCOUNT = os.getenv("AZURE_COSMOSDB_ACCOUNT")
        self.AZURE_COSMOSDB_ANNEX_DATABASE = os.getenv("AZURE_COSMOSDB_ANNEX_DATABASE")
        self.AZURE_COSMOSDB_ANNEX_CONTAINER = os.getenv(
            "AZURE_COSMOSDB_ANNEX_CONTAINER"
        )

        # Application Settings
        self.ANNEX_MONTHS_CUTOFF = int(os.getenv("ANNEX_MONTHS_CUTOFF", "6"))

        # TEMPORARY environment variable during volatile testing period where value may change
        # After stable value is agreed, move into SEARCH_CONFIG
        self.AZURE_SEARCH_SCORE_THRESHOLD_ANNEX = float(
            os.environ.get("AZURE_SEARCH_SCORE_THRESHOLD_ANNEX", 2.0)
        )

        # Load Prompts
        base_prompt_path = os.path.join(os.path.dirname(__file__), "prompts")
        prompts = {
            "hansard_retrieval_prompt": "hansard_retrieval.md",
            "system_prompt": "system.md",
            "fallback_response": "fallback_response.md",
            "defence_cases_retrieval_prompt": "defence_cases_retrieval.md",
            "query_rewrite": "query_rewrite.md",
            "footnote": "footnote.md",
        }
        for attr_name, filename in prompts.items():
            with open(
                os.path.join(base_prompt_path, filename), "r", encoding="utf-8"
            ) as f:
                setattr(self, attr_name, f.read())


config = AppConfig()
logging.info("Annex's configuration loaded successfully.")

# Azure Credentials Setup
credential = get_azure_credential()
ad_token_provider = get_bearer_token_provider(
    credential, "https://cognitiveservices.azure.com/.default"
)

# Client Setups
llm_client = AzureChatOpenAI(
    api_version=config.AZURE_OPENAI_PREVIEW_API_VERSION,
    azure_endpoint=f"https://{config.AZURE_OPENAI_RESOURCE}.openai.azure.com/",
    deployment_name=config.AZURE_OPENAI_MODEL,
    temperature=config.AZURE_OPENAI_TEMPERATURE,
    azure_ad_token_provider=ad_token_provider,
)

logging.info("Annex's LLM Client configured with Azure OpenAI.")

hansard_retriever_client = SearchClient(
    endpoint=f"https://{config.AZURE_SEARCH_SERVICE}.search.windows.net/",
    index_name=config.AZURE_SEARCH_INDEX_HANSARD,
    credential=credential,
)

logging.info("Annex's Hansard Contributions Search Client configured.")

previous_cases_retriever_client = SearchClient(
    endpoint=f"https://{config.AZURE_SEARCH_SERVICE}.search.windows.net/",
    index_name=config.AZURE_SEARCH_INDEX_CORE,
    credential=credential,
)

logging.info("Annex's Previous Cases Search Client configured.")

cosmos_client = CosmosClient(
    url=f"https://{config.AZURE_COSMOSDB_ACCOUNT}.documents.azure.com:443/",
    credential=credential,
)

logging.info("Annex's Cosmos DB Client configured.")
