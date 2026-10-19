# User Task

This RAG chatbot uses Azure OpenAI On Your Data. Instead, I would like to replace it with a simple LangGraph implementation.

Conditions:
- It will use a separate Open AI and Search Client.
- Everything else must stay the same, e.g. the shape of the data stored in CosmosDB, the citations, etc.
- Some funky parameters such as Search Strictness, where we will not know how Microsoft do it, do not need to be preserved.
- Your scope is limited to this task. You are not doing other fixes.

Within `other_project/` is the codebase for another project, that has a very similar architecture to this one, and uses Azure OpenAI On Your Data, but also has an additional feature which was created using LangGraph. You can find this in:

other_project/backend/graph/nodes/[name].py
other_project/backend/graph/prompts/[name].md
other_project/backend/graph/graph.py
other_project/backend/graph/config.py
other_project/backend/graph/invoker.py
other_project/backend/graph/state.py

I like this file structure, and I would like to mirror something similar. You should get inspiration from this during planning. A change from that project and this one, however, is that Azure OpenAI On Your Data will no longer be used *at all*, and completley replaced with LangGraph -- not just used for an added feature

# Plan

## Summary

Replace retrieval and answer generation completely with three-node LangGraph. Keep Azure hosting, frontend behavior, CosmosDB documents, citations, and existing endpoints.

Confirmed choices: `AzureChatOpenAI`, separate async `SearchClient`, existing index vectorizer.

## Implementation

- Mirror reference’s actual `other_project/backend/annex/` layout under `backend/graph/`: `config.py`, `state.py`, `graph.py`, `invoker.py`, `nodes/`, `prompts/`.
- `config.py` owns typed RAG settings and Markdown prompt loading. `state.py` defines Pydantic request, citation, and graph models. Preserve existing extra message fields at request boundary.
- Build graph once during app startup; inject clients explicitly. Keep per-request settings and state separate. Close new clients and credentials during shutdown.
- Reuse wrapper for existing title generation, preserving prompt and fallback. Preserve API-key and chained-identity authentication.

Three sequential nodes:

1. **`rewrite_query`**: create standalone search query from user/assistant history. Exclude stored citation `tool` messages. Use latest user question if rewrite returns empty or encounters expected model/API failure.
2. **`retrieve_documents`**: query Azure Search directly. Preserve configured query modes, semantic configuration, top-K, column mappings, and document permission filters. Default fields match existing index: `content`, `title`, `filepath`, `url`, `vector`. Use `VectorizableTextQuery`; embeddings remain within Search. Use at least 50 vector candidates, returning configured top-K. [Azure query API](https://learn.microsoft.com/en-us/python/api/azure-search-documents/azure.search.documents.models.vectorizabletextquery?view=azure-python-preview)
3. **`generate_response`**: combine existing system instruction, conversation, and numbered retrieved sources. Prompt requires `[docN]` citations referring to current sources and treats document text as evidence, never instructions.

## Compatibility

- `invoker.py` translates graph output into existing response envelope: `id`, `model`, `created`, `object`, `choices[].messages`, `history_metadata`.
- Preserve citation `tool` message before assistant answer. Its JSON content retains `citations` and string `intent`; use rewritten query for `intent`. Keep citation fields and ordered `[docN]` lookup; `chunk_id` remains zero-based string.
- Streaming uses `astream(stream_mode=["messages", "updates"])`. Emit citation metadata after retrieval; stream tokens only from `generate_response`. Handle deterministic fallback through node updates without duplicating answer. Preserve one response ID and history metadata throughout. [LangGraph streaming](https://docs.langchain.com/oss/python/langgraph/streaming)
- Prime first public event before returning streaming response. Preserve existing HTTP errors before streaming, NDJSON errors afterward, and cancellation propagation. Non-streaming uses `ainvoke` with same public message order.
- Preserve temperature, system instruction, effective model selection, generation limits, stop sequences, NAD interception, title generation, and history/feedback behavior.
- Keep in-domain setting through grounding instructions. With in-domain enabled and no results, return fixed insufficient-information answer with empty citations. Without Search configured, retain plain chat through graph.
- Resolve permission filters while request context exists; pass filter into graph. Missing access token must never trigger unfiltered retrieval.
- Keep CosmosDB persistence and frontend code unchanged. No graph checkpoints or graph-state storage.

## Dependencies and Cleanup

- Add `langgraph==1.0.8`, `langchain-openai==1.1.14`; update `openai` to `2.26.0`. Retain other compatible existing pins. Wrapper requires updated SDK. [Package requirements](https://pypi.org/pypi/langchain-openai/1.1.14/json)
- Remove obsolete On Your Data request construction, response formatters, `data_sources`, datasource selector, and strictness settings. Keep embedding configuration used by indexer.
- Update sample/deployment settings and relevant documentation. Document app identity’s direct `Search Index Data Reader` requirement when no Search key is supplied. [Azure permissions](https://learn.microsoft.com/en-us/azure/search/search-security-rbac)

## Validation and Assumptions

- Add focused tests using real compiled graph with mocked model/Search calls: initial question, conversational rewrite, rewrite fallback, query modes, field mappings, permission filters, and empty results.
- Verify streaming/non-streaming envelopes, citation order and indexing, hidden rewrite output, fallback delivery, error handling, and request isolation.
- Verify history saves/reloads existing tool-plus-assistant format without schema changes. Run existing backend tests and frontend build; check NAD and title behavior.
- Deployment assumes existing index matches checked-in schema and has working vectorizer. Smoke-check HR question, follow-up, citation source link, and history reload against configured Azure environment.
- Compatibility covers contracts and behavior; generated wording and retrieval ranking may differ. No unrelated fixes.
