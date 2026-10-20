from enum import StrEnum
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class SearchQueryType(StrEnum):
    SIMPLE = "simple"
    SEMANTIC = "semantic"
    VECTOR = "vector"
    VECTOR_SIMPLE_HYBRID = "vector_simple_hybrid"
    VECTOR_SEMANTIC_HYBRID = "vector_semantic_hybrid"


class RagSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        env_ignore_empty=True,
        frozen=True,
        populate_by_name=True,
    )

    applicationinsights_connection_string: str | None = None
    azure_managed_identity_id: str | None = None
    azure_openai_endpoint: str | None = None
    azure_openai_resource: str | None = None
    azure_openai_key: str | None = None
    azure_openai_model: str = "gpt-35-turbo-16k"
    azure_openai_preview_api_version: str = "2024-10-21"
    azure_openai_temperature: float = Field(default=0, ge=0, le=2)
    azure_openai_top_p: float = Field(default=1, ge=0, le=1)
    azure_openai_max_tokens: int = Field(default=1000, gt=0)
    azure_openai_stop_sequence: str | None = None
    azure_openai_system_message: str = (
        "You are an AI assistant that helps people find information."
    )
    azure_openai_stream: bool = True

    azure_search_service: str | None = None
    azure_search_index: str | None = None
    azure_search_key: str | None = None
    azure_search_query_type: SearchQueryType | None = None
    azure_search_use_semantic_search: bool = False
    azure_search_semantic_search_config: str = "default"
    azure_search_top_k: int = Field(
        default=5,
        gt=0,
        validation_alias=AliasChoices("AZURE_SEARCH_TOP_K", "SEARCH_TOP_K"),
    )
    azure_search_enable_in_domain: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "AZURE_SEARCH_ENABLE_IN_DOMAIN", "SEARCH_ENABLE_IN_DOMAIN"
        ),
    )
    azure_search_content_columns: str = "content"
    azure_search_title_column: str = "title"
    azure_search_filename_column: str = "filepath"
    azure_search_url_column: str = "url"
    azure_search_vector_columns: str = "vector"
    azure_search_permitted_groups_column: str | None = None

    @property
    def search_enabled(self) -> bool:
        return bool(self.azure_search_service and self.azure_search_index)

    @property
    def query_type(self) -> SearchQueryType:
        if self.azure_search_query_type:
            return self.azure_search_query_type
        if self.azure_search_use_semantic_search:
            return SearchQueryType.SEMANTIC
        return SearchQueryType.SIMPLE


def load_prompt(name: str) -> str:
    return (
        (Path(__file__).parent / "prompts" / f"{name}.md")
        .read_text(encoding="utf-8")
        .strip()
    )
