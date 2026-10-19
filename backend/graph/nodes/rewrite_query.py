import logging

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from openai import OpenAIError

from backend.graph.state import GraphState


async def rewrite_query(
    state: GraphState,
    config: RunnableConfig,
    *,
    model: BaseChatModel,
    prompt: str,
    use_search: bool,
) -> dict[str, str]:
    if not use_search:
        return {"query": state.question}

    messages = [SystemMessage(content=prompt), *state.conversation()]
    try:
        response = await model.ainvoke(
            messages,
            config=config,
            model=state.generation.model,
            temperature=0,
            max_tokens=state.generation.max_tokens,
            stream=False,
        )
    except (OpenAIError, ValueError):
        logging.warning(
            "Query rewrite failed; using the latest user question.", exc_info=True
        )
        return {"query": state.question}

    return {"query": response.text.strip() or state.question}
