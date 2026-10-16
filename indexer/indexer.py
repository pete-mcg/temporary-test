from dotenv import load_dotenv
import os

from azure.search.documents.indexes import SearchIndexClient, SearchIndexerClient
from azure.search.documents.indexes.models import IndexingSchedule, IndexingParameters
from lib.credential_helpers import create_sync_chained_credential
from lib.common import (
    create_search_index,
    create_search_datasource,
    create_search_skillset,
    create_search_indexer,
)

# Get the directory of the current script and calculate path to .env file
script_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(script_dir, "..", ".env")
load_dotenv(dotenv_path)

# Get environment variables
search_service = os.environ.get("AZURE_SEARCH_SERVICE")
search_index = os.environ.get("AZURE_SEARCH_INDEX_CREATE")

search_endpoint = f"https://{search_service}.search.windows.net"
search_datasource = search_index + "-datasource"
search_skillset = search_index + "-skillset"
search_indexer = search_index + "-indexer"

azure_openai_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
azure_openai_embedding_deployment_id = os.environ.get("AZURE_OPENAI_EMBEDDING_NAME")
azure_openai_embedding_name = os.environ.get("AZURE_OPENAI_EMBEDDING_NAME")
azure_openai_embedding_dimensions = os.environ.get("AZURE_OPENAI_EMBEDDING_DIMENSIONS")

blob_container = os.environ.get("AZURE_STORAGE_CONTAINER_NAME")
blob_connection_string = os.environ.get("AZURE_BLOB_CONNECTION_STRING")

max_chunk_length = os.environ.get("MAX_CHUNK_LENGTH")
chunk_overlap = os.environ.get("CHUNK_OVERLAP")

auth_identity = os.environ.get("AZURE_MANAGED_IDENTITY_ID") or None
credential = create_sync_chained_credential(auth_identity)

tag_key_fields = os.environ.get("TAG_FIELDS")
if tag_key_fields is not None:
    tag_keys = [key.strip() for key in tag_key_fields.split(",")]
else:
    tag_keys = []

# Create index, indexer, datasource and skillset
search_index_client = SearchIndexClient(endpoint=search_endpoint, credential=credential)
index = create_search_index(
    search_index,
    azure_openai_endpoint,
    azure_openai_embedding_deployment_id,
    azure_openai_embedding_name,
    azure_openai_embedding_dimensions,
    auth_identity,
    tag_keys=tag_keys,
)
search_index_client.create_or_update_index(index)

search_indexer_client = SearchIndexerClient(
    endpoint=search_endpoint, credential=credential
)

data_source = create_search_datasource(
    search_datasource, blob_connection_string, blob_container
)
search_indexer_client.create_or_update_data_source_connection(data_source)

skillset = create_search_skillset(
    search_skillset,
    search_index,
    azure_openai_endpoint,
    azure_openai_embedding_deployment_id,
    azure_openai_embedding_name,
    azure_openai_embedding_dimensions,
    auth_identity=auth_identity,
    text_split_mode="pages",
    maximum_page_length=max_chunk_length,
    page_overlap_length=chunk_overlap,
    tag_keys=tag_keys,
)
search_indexer_client.create_or_update_skillset(skillset)

indexer = create_search_indexer(
    indexer_name=search_indexer,
    index_name=search_index,
    datasource_name=search_datasource,
    skillset_name=search_skillset,
)

indexer.schedule = IndexingSchedule(interval="PT2H")

indexer.parameters = IndexingParameters(
    max_failed_items=-1,  # Retry all items
    max_failed_items_per_batch=-1,  # Retry all failed items per batch
    batch_size=10,  # Batch size
)

print("Creating or updating indexer...")
search_indexer_client.create_or_update_indexer(indexer)
print("Running indexer... please check indexer status via Azure Search Service portal")
search_indexer_client.run_indexer(search_indexer)
