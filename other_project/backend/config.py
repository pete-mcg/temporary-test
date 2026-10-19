from dotenv import load_dotenv
from pydantic import Field
from typing import Optional

from pydantic_settings import BaseSettings

load_dotenv()


class Config(BaseSettings):
    auth_enabled: bool = Field(..., env="AUTH_ENABLED")
    auth_host: str = Field(..., env="AUTH_HOST")
    auth_client_id: str = Field(..., env="AUTH_CLIENT_ID")
    auth_client_secret: str = Field(..., env="AUTH_CLIENT_SECRET")
    auth_scope: str = Field(..., env="AUTH_SCOPE")
    auth_redirect_uri: str = Field(..., env="AUTH_REDIRECT_URI")
    auth_verify_ssl: bool = Field(..., env="AUTH_VERIFY_SSL")

    azure_managed_identity_id: Optional[str] = Field(
        None, env="AZURE_MANAGED_IDENTITY_ID"
    )
    azure_storage_account_name: str = Field(None, env="AZURE_STORAGE_ACCOUNT_NAME")

    redis_host: str = Field(..., env="REDIS_HOST")
    redis_port: int = Field(..., env="REDIS_PORT")

    class Config:
        extra = "allow"
        env_file = ".env"
