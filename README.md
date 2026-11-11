# Baseline Chat App with Azure OpenAI

This is a simple RAG chat webapp hosted on Azure. A three-node LangGraph rewrites
the question, retrieves documents with a separate async Azure AI Search client,
and generates an answer with `AzureChatOpenAI`. Search runs vector queries through
the existing index vectorizer; the app does not generate embeddings.

## Prerequisites
- An existing Azure OpenAI resource and model deployment of a chat model (e.g. `gpt-35-turbo-16k`, `gpt-4`)
- For document answers: an Azure AI Search index matching `indexer/lib/common.py`,
  with a working vectorizer for vector query modes.

## RAG configuration

Copy `.env.sample` to `.env` and fill in the existing application, authentication,
Redis, and Azure settings. `AZURE_OPENAI_MODEL` is the chat deployment name.
`AZURE_OPENAI_ENDPOINT` or `AZURE_OPENAI_RESOURCE` identifies the OpenAI service.
Set `AZURE_SEARCH_SERVICE` and `AZURE_SEARCH_INDEX` to enable document retrieval.
Without both Search settings, the graph provides plain chat.

`AZURE_SEARCH_QUERY_TYPE` accepts `simple`, `semantic`, `vector`,
`vector_simple_hybrid`, or `vector_semantic_hybrid`. If omitted,
`AZURE_SEARCH_USE_SEMANTIC_SEARCH` selects semantic or simple search. Semantic
modes require an existing semantic configuration named by
`AZURE_SEARCH_SEMANTIC_SEARCH_CONFIG`; the checked-in indexer does not create one.
Vector modes retrieve at least 50 candidates and return `AZURE_SEARCH_TOP_K`
documents. Field mappings default to `content`, `title`, `filepath`, `url`, and
`vector`. Content and vector column settings accept comma- or pipe-separated lists.

With `AZURE_SEARCH_ENABLE_IN_DOMAIN=True`, answers must be grounded in retrieved
sources. No results returns a fixed insufficient-information answer and empty
citations. Disabling this setting permits general knowledge as well.
`SEARCH_TOP_K` and `SEARCH_ENABLE_IN_DOMAIN` remain supported as fallback settings.
Remove `DATASOURCE_TYPE`, `SEARCH_STRICTNESS`, and `AZURE_SEARCH_STRICTNESS` from
existing deployments; they are no longer used. Keep embedding settings for the indexer.

Use `AZURE_OPENAI_KEY` and `AZURE_SEARCH_KEY` for key authentication, or leave them
unset to use chained identity authentication: configured managed identity,
environment credentials, then Azure CLI. The **application identity** now needs
`Search Index Data Reader` on the Search service when no Search key is supplied.
An OpenAI resource identity's Search access does not grant access to the app.
The app also needs its existing Azure OpenAI access. See
[Azure Search roles](https://learn.microsoft.com/en-us/azure/search/search-security-rbac).
The Search vectorizer retains its separate access to the embedding deployment.

If `AZURE_SEARCH_PERMITTED_GROUPS_COLUMN` is set, requests must include
`X-MS-TOKEN-AAD-ACCESS-TOKEN`. The app resolves group membership before starting
the graph and applies the permission filter to Search. Missing tokens never
allow unfiltered retrieval.

The existing response envelope, numbered `[docN]` citations, citation tool message,
CosmosDB history documents, feedback, and frontend are unchanged. Streaming sends
citations first and only streams answer tokens; rewritten queries are not shown.
The citation tool message's `intent` contains the rewritten query. There are no
graph checkpoints or persisted graph states. Retrieval ranking and answer wording
can differ from the previous service.

## Conversation tracing in Microsoft Foundry

The existing Azure OpenAI deployment works with tracing; no model migration is
needed. In your Foundry project, open **Agents > Traces > Connect** and connect
the existing Application Insights resource. If Connect is unavailable, use
**Manage > Project details > Connected resources > Add connection**. See
[Foundry tracing setup](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/trace-agent-setup).

Set `APPLICATIONINSIGHTS_CONNECTION_STRING` on the app to that resource's
connection string and set `OTEL_SERVICE_NAME=hr-chatbot`. An unset, empty, or
whitespace-only connection string disables graph tracing. The app passes the
connection string explicitly to Azure Monitor; it does not use
the tracer's differently named environment variable. Remove the old
`AZURE_APPLICATION_INSIGHTS_CONNECTION_STRING` setting from deployed apps.

Disable App Service automatic instrumentation before restarting the app:
set `ApplicationInsightsAgent_EXTENSION_VERSION=disabled`. The deployment
templates include this setting. `backend/telemetry.py` initializes Azure Monitor
once per worker with the PII processor before exporters; the tracer's automatic
initialization is disabled. Do not add a second telemetry initializer. See
[LangChain tracing guidance](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/langchain-traces).

Content recording is enabled. Before export, Presidio's built-in English
recognizers and `en_core_web_lg` replace detected PII in conversation spans
with placeholders such as `<PERSON>` and `<EMAIL_ADDRESS>`. This covers messages,
model prompts and answers, rewritten queries, retrieved content, graph state,
exception events, links, span names, and error descriptions. Serialized JSON is
decoded and its string values redacted; malformed or truncated JSON attributes
are dropped. Keys, numbers, token counts, timestamps, and UUIDs are preserved.
If model loading or redaction fails, the affected span retains only a fixed name,
trace context, timing, and status code. Chat continues with its original content.
Application logs, CosmosDB history, other libraries' spans, and previously stored
telemetry are outside this redaction scope.

Automated detection can miss PII. Validate representative HR examples and retain
appropriate Application Insights access and retention settings. See
[Presidio's limitations](https://microsoft.github.io/presidio/).
The SDK limits recorded
state size to 32,768 characters by default, and Azure telemetry limits also
apply. Completed model streams include token usage; interrupted streams may
not receive final usage. The SDK handles batching and process shutdown.

Each turn has its own trace. A non-empty string
`history_metadata.conversation_id` becomes `gen_ai.conversation.id` on its spans,
so existing CosmosDB conversation IDs correlate turns. Valid UUIDs are preserved;
other ID values undergo normal PII detection. Requests without that
ID are still traced. Agent and service names use `hr-chatbot`; nodes retain
their rewrite, retrieval, and generation labels. Requests handled before the
graph (such as the NAD intercept or input validation) are outside graph tracing.

Deploy to development first. Ask an initial HR question and a follow-up in the
same saved conversation. In the project's **Agents > Traces** view, allow a
few minutes for ingestion, then inspect both traces and their shared conversation
ID. Use synthetic names, emails, phone numbers, bank details, and supported
national IDs; confirm that only placeholders appear in prompts, retrieved
content, answers, and state, while durations and token usage remain intact. Trigger
a controlled Search/model failure in development and confirm the failing span
has error status before rolling out to production. Viewing traces requires
access to the connected Application Insights/Log Analytics resource.

The image installs the pinned `en_core_web_lg==3.8.0` model during build; no runtime
model downloads occur. Local tracing and tests need the same model:

```sh
python -m pip install https://github.com/explosion/spacy-models/releases/download/en_core_web_lg-3.8.0/en_core_web_lg-3.8.0-py3-none-any.whl
```

The model wheel is about 382 MiB and each Gunicorn worker loads its own model
when tracing is enabled. A local Python 3.11/Windows check added about 616 MiB RSS
for the model and took about 564 ms per span to redact an 846-byte synthetic state
(10 spans). These are development measurements, not production sizing figures.
Measure worker memory and turn latency in development before sizing production.
The current CPU-based Gunicorn worker count can multiply this cost. With tracing
disabled, the model is not loaded.

## Continuous Friendliness evaluation in Foundry

See [evaluation setup and operation](script/README.md) for configuration,
permissions, validation, and disabling the continuous rule.

## Validation

Install `requirements.txt`, `pytest`, and `pytest-asyncio`. For the evaluation
tests, also install `script/requirements.txt`, then run:

```sh
python -m pytest tests
npm --prefix frontend run build
```

Backend tests use the compiled graph with mocked model and Search calls. Before
deployment, smoke-test against the configured Azure environment: ask an HR
question, ask a follow-up, open its citation source, and reload the saved history.
