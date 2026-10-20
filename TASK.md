# User Task

## Context

This is a RAG chatbot built using LangGraph with OpenAI models that are deployed in an Azure OpenAI resource, and uses both Azure Search Service for the knowledge base index and Azure CosmosDB for conversation history.

It is deployed as an Azure Web Application, which users presently access.

## Problem

Currently I lack the visibility to know when my chatbot is performing as it should, or (more importantly) when something is going wrong. I need better observability.

## Objective

I am aware that in Microsoft Foundry, it is possible to view conversation traces from a chatbot. There is the `langchain-azure-ai` package, which can emit OpenTelemetry traces from LangChain and LangGraph applications and sink them in Azure Application Insights, by using `AzureAIOpenTelemetryTracer`.

I am happy to redeploy an equivalent OpenAI model within Microsoft Foundry.

The existing, basic Telemetry within this application does not necessarily need to be retained. It was written a long time ago by inexperienced developers, and we are very open to removing it.

## Task

Implement this in the **simplest** way possible. I don't want massive, over-engineered, unnecessarily large line changes.

# Plan

## Summary

Attach one `AzureAIOpenTelemetryTracer` to existing graph. Send traces to Application Insights linked to Foundry project; inspect them in Foundry’s project tracing view.

Confirmed: enable conversation content recording. Keep existing Azure OpenAI deployment; tracer supports it. [Tracer implementation](https://github.com/langchain-ai/langchain-azure/blob/main/libs/azure-ai/langchain_azure_ai/callbacks/tracers/inference_tracing.py)

## Implementation

- **Dependencies:** add `langchain-azure-ai[opentelemetry]==1.2.11`; update LangGraph to `1.1.1` and aiohttp to `3.14.0`. Remove old direct telemetry pins and incompatible `pydantic_core` pin; pinned Pydantic selects matching core. Keep remaining direct pins. Dependency resolution checked for Python 3.11/Alpine.
- **Configuration:** add optional `applicationinsights_connection_string` to existing `RagSettings`, reading `APPLICATIONINSIGHTS_CONNECTION_STRING`. Pass value explicitly to tracer. Blank value disables tracing.
- **Startup:** add one small, typed setup helper in `app.py`. Run once per worker during existing graph startup. Create tracer with `enable_content_recording=True`, `trace_all_langgraph_nodes=True`, and `trace_state=True`; attach through graph’s `with_config(callbacks=[tracer])`. Let tracer configure Azure Monitor. [Tracing guidance](https://learn.microsoft.com/en-us/azure/foundry/how-to/develop/langchain-traces)
- **Coverage:** existing nodes supply rewrite, retrieval, and generation spans; model callbacks supply prompts, answers, and failures. State recording captures custom `query`, `citations`, and `answer` fields, including deterministic fallback answers. Keep direct Search client.
- **Correlation:** in `backend/graph/invoker.py`, pass existing non-empty string `history_metadata.conversation_id` as per-call `metadata.thread_id` for both `ainvoke` and `astream`. Omit when unavailable. Keep request metadata off shared tracer.
- **Streaming:** set `stream_usage=True` on model so completed streams provide token counts. Existing text filtering should ignore usage-only chunks; verify this. Interrupted streams can lack final usage. [Streaming usage](https://reference.langchain.com/python/langchain-openai/chat_models/base/BaseChatOpenAI/stream_usage)
- **Cleanup:** remove old `configure_azure_monitor`, `RequestsInstrumentor`, and ASGI middleware setup. Remove obsolete connection-string setting from deployment templates. Disable App Service automatic instrumentation during rollout to avoid competing telemetry initialization. [Azure guidance](https://learn.microsoft.com/en-us/troubleshoot/azure/azure-monitor/app-insights/telemetry/troubleshoot-app-service-issues)

## Foundry setup and rollout

- Connect existing Application Insights resource to Foundry project; configure app with that resource’s connection string. Use stable service and agent name `hr-chatbot`.
- Document setup, environment variables, content recording, and trace-view navigation in existing README/sample settings.
- Deploy first to development. Verify traces inside Foundry before production rollout. Project tracing satisfies agreed viewer requirement. [Foundry setup](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/trace-agent-setup)

## Validation

- Extend existing pytest checks using real tracer with in-memory span exporter; avoid Azure calls.
- Cover streaming and non-streaming: graph/node/model spans, recorded content, token usage, conversation correlation, and unchanged response/citation contracts.
- Cover missing configuration, rewrite fallback, Search/model failures, cancellation, and concurrent conversations. Verify callback attaches once during startup.
- Run backend tests, build existing Docker image, and run `pip check` inside image.
- Cloud acceptance: initial question and follow-up appear in Foundry with shared conversation ID; inspect prompts, retrieved content, answers, durations, and a controlled development failure.

## Defaults and boundaries

Full content recording enabled as requested, subject to telemetry size limits. Preserve frontend, CosmosDB schema, model authentication, and chat behavior. Use SDK batching and shutdown behavior. Custom dashboards, alerts, quality evaluations, gateway registration, and model migration remain outside this change.
