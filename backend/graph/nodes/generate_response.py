import json

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from backend.graph.config import RagSettings
from backend.graph.state import GraphState

INSUFFICIENT_INFORMATION = (
    "I don't have enough information in the available documents "
    "to answer that question."
)


def answer_messages(
    state: GraphState, settings: RagSettings, prompt: str
) -> list[BaseMessage]:
    messages: list[BaseMessage] = [
        SystemMessage(content=state.generation.system_message)
    ]
    if settings.search_enabled:
        scope = (
            "You may also use general knowledge "
            "when the sources do not cover the question."
        )
        if settings.azure_search_enable_in_domain:
            scope = (
                "Answer only from the current sources. "
                "If they do not contain the answer, "
                f"say: {INSUFFICIENT_INFORMATION}"
            )
        messages.append(SystemMessage(content=f"{prompt}\n\n{scope}"))
    messages.extend(state.conversation())
    if settings.search_enabled:
        sources = [
            {"source": f"[doc{index}]", **citation.model_dump()}
            for index, citation in enumerate(state.citations, start=1)
        ]
        messages.append(
            HumanMessage(
                content=(
                    "Answer the latest user question using the following "
                    "current sources (JSON).\n"
                    + json.dumps(sources, ensure_ascii=False)
                )
            )
        )
    return messages


def answer_update(state: GraphState, answer: str) -> dict[str, object]:
    messages = [message.model_dump() for message in state.messages]
    messages.append({"role": "assistant", "content": answer})
    return {"answer": answer, "messages": messages}


async def generate_response(
    state: GraphState,
    config: RunnableConfig,
    *,
    model: BaseChatModel,
    prompt: str,
    settings: RagSettings,
) -> dict[str, object]:
    if (
        settings.search_enabled
        and settings.azure_search_enable_in_domain
        and not state.citations
    ):
        return answer_update(state, INSUFFICIENT_INFORMATION)

    response = await model.ainvoke(
        answer_messages(state, settings, prompt),
        config=config,
        **state.generation.model_arguments(),
    )
    return answer_update(state, response.text)
