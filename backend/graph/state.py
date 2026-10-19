from enum import StrEnum

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from pydantic import BaseModel, ConfigDict, Field, model_validator


class MessageRole(StrEnum):
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"
    ERROR = "error"


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="allow")

    role: MessageRole
    content: str


class ModelSelection(BaseModel):
    GPT35TURBO: bool = False
    GPT4: bool = False


class ChatSettings(BaseModel):
    models: ModelSelection = Field(default_factory=ModelSelection)
    temperature: float | None = Field(default=None, ge=0, le=2)
    systemMessage: str | None = None


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    messages: list[ChatMessage] = Field(min_length=1)
    settings: ChatSettings | None = None
    history_metadata: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def require_question(self) -> "ChatRequest":
        if not any(
            message.role == MessageRole.USER and message.content.strip()
            for message in self.messages
        ):
            raise ValueError("No user message found")
        return self


class Citation(BaseModel):
    content: str
    title: str | None = None
    filepath: str | None = None
    url: str | None = None
    chunk_id: str


class ConversationTitle(BaseModel):
    title: str


class GenerationSettings(BaseModel):
    model: str
    temperature: float
    system_message: str
    max_tokens: int
    top_p: float
    stop: list[str] | None = None

    def model_arguments(self) -> dict[str, object]:
        return {
            "model": self.model,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "top_p": self.top_p,
            "stop": self.stop,
        }


class GraphState(BaseModel):
    messages: list[ChatMessage]
    generation: GenerationSettings
    search_filter: str | None = None
    query: str = ""
    citations: list[Citation] = Field(default_factory=list)
    answer: str = ""

    @property
    def question(self) -> str:
        for message in reversed(self.messages):
            if message.role == MessageRole.USER:
                return message.content
        raise ValueError("No user message found")

    def conversation(self) -> list[BaseMessage]:
        messages = []
        for message in self.messages:
            if message.role == MessageRole.USER:
                messages.append(HumanMessage(content=message.content))
            elif message.role == MessageRole.ASSISTANT:
                messages.append(AIMessage(content=message.content))
        return messages
