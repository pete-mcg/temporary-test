from unittest.mock import Mock

import pytest

from backend import azure_identity


def test_get_azure_credential_uses_cli_credential_locally(monkeypatch):
    credential = object()
    credential_mock = Mock(return_value=credential)

    monkeypatch.setattr(azure_identity, "AsyncAzureCliCredential", credential_mock)
    monkeypatch.setenv("APP_ENV", "local")

    result = azure_identity.get_azure_credential()

    assert result is credential
    credential_mock.assert_called_once_with()


@pytest.mark.parametrize("app_env", ["production", None])
def test_get_azure_credential_uses_managed_identity_non_locally(monkeypatch, app_env):
    credential = object()
    credential_mock = Mock(return_value=credential)

    monkeypatch.setenv("AZURE_MANAGED_IDENTITY_ID", "managed-identity-id")
    monkeypatch.setattr(
        azure_identity, "AsyncManagedIdentityCredential", credential_mock
    )
    if app_env is None:
        monkeypatch.delenv("APP_ENV", raising=False)
    else:
        monkeypatch.setenv("APP_ENV", app_env)

    result = azure_identity.get_azure_credential()

    assert result is credential
    credential_mock.assert_called_once_with(client_id="managed-identity-id")


def test_get_sync_azure_credential_uses_cli_credential_locally(monkeypatch):
    credential = object()
    credential_mock = Mock(return_value=credential)

    monkeypatch.setattr(azure_identity, "SyncAzureCliCredential", credential_mock)
    monkeypatch.setenv("APP_ENV", "local")

    result = azure_identity.get_sync_azure_credential()

    assert result is credential
    credential_mock.assert_called_once_with()


@pytest.mark.parametrize("app_env", ["production", None])
def test_get_sync_azure_credential_uses_managed_identity_non_locally(
    monkeypatch, app_env
):
    credential = object()
    credential_mock = Mock(return_value=credential)

    monkeypatch.setenv("AZURE_MANAGED_IDENTITY_ID", "managed-identity-id")
    monkeypatch.setattr(
        azure_identity, "SyncManagedIdentityCredential", credential_mock
    )
    if app_env is None:
        monkeypatch.delenv("APP_ENV", raising=False)
    else:
        monkeypatch.setenv("APP_ENV", app_env)

    result = azure_identity.get_sync_azure_credential()

    assert result is credential
    credential_mock.assert_called_once_with(client_id="managed-identity-id")
