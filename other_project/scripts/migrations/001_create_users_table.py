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

## Create table
TABLE_NAME = "users"
table_client = table_service_client.create_table_if_not_exists(TABLE_NAME)

print(f"Table '{TABLE_NAME}' created or already exists.")
