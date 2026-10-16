from typing import Optional

from azure.identity import (
    AzureCliCredential,
    ChainedTokenCredential,
    EnvironmentCredential,
    ManagedIdentityCredential,
)
from azure.identity.aio import (
    AzureCliCredential as AsyncAzureCliCredential,
    ChainedTokenCredential as AsyncChainedTokenCredential,
    EnvironmentCredential as AsyncEnvironmentCredential,
    ManagedIdentityCredential as AsyncManagedIdentityCredential,
)


def create_sync_chained_credential(
    managed_identity_client_id: Optional[str] = None,
    include_environment_credential: bool = True,
) -> ChainedTokenCredential:
    credentials = []
    if managed_identity_client_id:
        credentials.append(
            ManagedIdentityCredential(client_id=managed_identity_client_id)
        )

    if include_environment_credential:
        credentials.append(EnvironmentCredential())

    credentials.append(AzureCliCredential())
    return ChainedTokenCredential(*credentials)


def create_async_chained_credential(
    managed_identity_client_id: Optional[str] = None,
    include_environment_credential: bool = True,
) -> AsyncChainedTokenCredential:
    credentials = []
    if managed_identity_client_id:
        credentials.append(
            AsyncManagedIdentityCredential(client_id=managed_identity_client_id)
        )

    if include_environment_credential:
        credentials.append(AsyncEnvironmentCredential())

    credentials.append(AsyncAzureCliCredential())
    return AsyncChainedTokenCredential(*credentials)