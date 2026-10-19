import os

from azure.identity import AzureCliCredential as SyncAzureCliCredential
from azure.identity import ManagedIdentityCredential as SyncManagedIdentityCredential
from azure.identity.aio import AzureCliCredential as AsyncAzureCliCredential
from azure.identity.aio import (
    ManagedIdentityCredential as AsyncManagedIdentityCredential,
)


def get_azure_credential():
    """Return an async Azure credential based on APP_ENV."""
    if os.environ.get("APP_ENV") == "local":
        return AsyncAzureCliCredential()
    return AsyncManagedIdentityCredential(
        client_id=os.environ.get("AZURE_MANAGED_IDENTITY_ID")
    )


def get_sync_azure_credential():
    """Return a sync Azure credential based on APP_ENV."""
    if os.environ.get("APP_ENV") == "local":
        return SyncAzureCliCredential()
    return SyncManagedIdentityCredential(
        client_id=os.environ.get("AZURE_MANAGED_IDENTITY_ID")
    )
