import os
from azure.data.tables import TableServiceClient
from azure.identity import AzureCliCredential
from dotenv import load_dotenv

load_dotenv()

AZURE_STORAGE_ACCOUNT_NAME = os.environ.get("AZURE_STORAGE_ACCOUNT_NAME")

credential = AzureCliCredential()
table_service_client = TableServiceClient(
    endpoint=f"https://{AZURE_STORAGE_ACCOUNT_NAME}.table.core.windows.net",
    credential=credential,
)

TABLE_NAME = "users"


table_client = table_service_client.get_table_client(TABLE_NAME)
entities = table_client.query_entities("PartitionKey eq 'users'")
for entity in entities:
    print(entity)

print(f"Users retrieved.")
