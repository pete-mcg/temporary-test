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

## Tracing in Microsoft Foundry

Set `APPLICATIONINSIGHTS_CONNECTION_STRING` to the Application Insights resource
for the environment. `AZURE_APPLICATION_INSIGHTS_CONNECTION_STRING` remains a
fallback for existing deployments. Without either connection string, application
telemetry is disabled. Restart workers after changing telemetry settings.

Use these settings in `.env` or App Service configuration:

```dotenv
OTEL_SERVICE_NAME=hr-chatbot
AZURE_EXPERIMENTAL_ENABLE_GENAI_TRACING=true
OTEL_TRACES_SAMPLER=microsoft.fixed_percentage
OTEL_TRACES_SAMPLER_ARG=1.0
```

When configured, `microsoft-opentelemetry` exports HTTP, graph, step, and model
spans plus application logs. Full prompts, answers, and retrieved document text
are captured. Existing saved conversation IDs correlate turns; stateless requests
have separate traces without a persistent conversation ID. Sampling is 100% with
the settings above.

Keep the existing Azure OpenAI deployment and Web App hosting. Connect the
Foundry project to the same Application Insights resource, then select
**Build > Agents > New agent > Link external agent**. Enter OpenTelemetry ID
`hr-chatbot` and display name `HR chatbot`. This external-agent view is preview;
it needs no AI Gateway or additional runtime SDK. See Microsoft's
[tracing guide](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/trace-agent-framework)
and [external-agent registration guide](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/register-external-agent).

Before rollout, remove `ApplicationInsightsAgent_EXTENSION_VERSION` from the
deployed App Service and all deployment slots to prevent duplicate instrumentation.
The deployment templates omit it, but applying settings might not delete existing
values. Keep the standard connection string; remove the redundant legacy setting
after migration. Deploy development first, ask an HR question and follow-up, and
check **Agents > HR chatbot > Traces** after 2–5 minutes. Confirm the three graph
steps, model input/output, citations, errors, and shared conversation ID before
promoting through the existing environments. Unset both connection-string settings
and restart to disable application telemetry.

## Validation

Upgrade pip first; older resolvers can reject the telemetry dependency set.
Install the requirements and run:

```sh
python -m pip install --upgrade pip
python -m pip install -r requirements.txt pytest pytest-asyncio
python -m pytest tests
npm --prefix frontend run build
```

Backend tests use the compiled graph with mocked model and Search calls, plus
in-memory telemetry export. Before deployment, smoke-test against the configured
Azure environment: ask an HR question, ask a follow-up, open its citation source,
and reload the saved history.
