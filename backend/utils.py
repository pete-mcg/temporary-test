import os
import json
import logging
import requests
import dataclasses
from contextlib import aclosing
from datetime import datetime, timedelta, timezone

import dotenv
from azure.storage.blob import BlobSasPermissions, BlobServiceClient, generate_blob_sas
from backend.auth.credential_helpers import create_sync_chained_credential

dotenv.load_dotenv()

AZURE_STORAGE_ACCOUNT_NAME = os.environ.get("AZURE_STORAGE_ACCOUNT_NAME")
AZURE_MANAGED_IDENTITY_ID = os.environ.get("AZURE_MANAGED_IDENTITY_ID")
AZURE_STORAGE_ACCOUNT_KEY = os.environ.get("AZURE_STORAGE_ACCOUNT_KEY")

credential = create_sync_chained_credential(AZURE_MANAGED_IDENTITY_ID)

blob_service_client = BlobServiceClient(
    account_url=f"https://{AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net",
    credential=credential,
)


def generate_sas_token(
    blob_service_client: BlobServiceClient,
    container_name: str,
    blob_name: str,
    *,
    permissions: str = "r",
    expiry_minutes: int = 120,
) -> str:
    """
    Return only the SAS token (not the full URL)
    Uses a user delegation key in prod (managed Identity / AAD).
    Falls back to the storage account key if one is present
    read_only: bool = True,
    set 'read_only' to False to allow write access
    """
    now = datetime.now(timezone.utc)

    perms = BlobSasPermissions.from_string(permissions)

    account_key = AZURE_STORAGE_ACCOUNT_KEY

    # if you have an account key
    if account_key:
        # use the account key to generate the SAS token
        return generate_blob_sas(
            account_name=blob_service_client.account_name,
            container_name=container_name,
            blob_name=blob_name,
            account_key=account_key,
            permission=perms,
            start=now - timedelta(minutes=1),
            expiry=now + timedelta(minutes=expiry_minutes),
        )

    # otherwise assume MSI / AAD user delegation key
    udk = blob_service_client.get_user_delegation_key(
        key_start_time=now - timedelta(minutes=1), key_expiry_time=now + timedelta(minutes=expiry_minutes)
    )

    return generate_blob_sas(
        account_name=blob_service_client.account_name,
        container_name=container_name,
        blob_name=blob_name,
        user_delegation_key=udk,
        permission=perms,
        start=now - timedelta(minutes=1),
        expiry=now + timedelta(minutes=expiry_minutes),
    )

DEBUG = os.environ.get("DEBUG", "false")
if DEBUG.lower() == "true":
    logging.basicConfig(level=logging.DEBUG)

class JSONEncoder(json.JSONEncoder):
    def default(self, o):
        if dataclasses.is_dataclass(o):
            return dataclasses.asdict(o)
        return super().default(o)

async def format_as_ndjson(r):
    try:
        async with aclosing(r):
            async for event in r:
                yield json.dumps(event, cls=JSONEncoder) + "\n"
    except Exception as error:
        logging.exception("Exception while generating response stream: %s", error)
        yield json.dumps({"error": str(error)})

def parse_multi_columns(columns: str) -> list:
    if "|" in columns:
        return columns.split("|")
    else:
        return columns.split(",")


def fetchUserGroups(userToken, nextLink=None):
    # Recursively fetch group membership
    if nextLink:
        endpoint = nextLink
    else:
        endpoint = "https://graph.microsoft.com/v1.0/me/transitiveMemberOf?$select=id"
    
    headers = {
        'Authorization': "bearer " + userToken
    }
    try :
        r = requests.get(endpoint, headers=headers)
        if r.status_code != 200:
            logging.error(f"Error fetching user groups: {r.status_code} {r.text}")
            return []
        
        r = r.json()
        if "@odata.nextLink" in r:
            nextLinkData = fetchUserGroups(userToken, r["@odata.nextLink"])
            r['value'].extend(nextLinkData)
        
        return r['value']
    except Exception as e:
        logging.error(f"Exception in fetchUserGroups: {e}")
        return []


def generateFilterString(userToken: str, permitted_groups_column: str) -> str:
    # Get list of groups user is a member of
    userGroups = fetchUserGroups(userToken)

    # Construct filter string
    if not userGroups:
        logging.debug("No user groups found")

    group_ids = ", ".join([obj['id'] for obj in userGroups])
    return f"{permitted_groups_column}/any(g:search.in(g, '{group_ids}'))"

def download_file(container: str, blob: str) -> bytes:
    """
    Download a blob from Azure Blob Storage using Managed Identity (ClientID).
    Returns the file content as bytes.
    """
    blob_client = blob_service_client.get_blob_client(container=container, blob=blob)
    downloader = blob_client.download_blob()
    return downloader.readall()
