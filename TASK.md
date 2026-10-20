# Task

## Context

This is a RAG chatbot built using LangGraph with OpenAI models that are deployed in an Azure OpenAI resource, and uses both Azure Search Service for the knowledge base index and Azure CosmosDB for conversation history.

It is deployed as an Azure Web Application, which users presently access.

## Problem

Currently I lack the visibility to know when my chatbot is performing as it should, or (more importantly) when something is going wrong. I need better observability.

## Objective

I am aware that in Microsoft Foundry Countr Pane, it is possible to view conversation traces from a chatbot. I would like to use the `microsoft-opentelemetry` package.

I am happy to redeploy an equivalent OpenAI model within Microsoft Foundry, if needed.

The existing, basic Telemetry within this application does not necessarily need to be retained. It was written a long time ago by inexperienced developers, and I am very open to removing it if it is going to result in conflicts.

Implement this in the **simplest** way possible. I don't want massive, over-engineered, unnecessarily large line changes.

# Plan

## Summary

Use `microsoft-opentelemetry` to send chatbot traces to Application Insights, then link app as external agent in Foundry. Keep current Azure OpenAI deployment and Web App hosting; Microsoft documents this setup with `AzureChatOpenAI`. [Tracing guide](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/trace-agent-framework)

Capture full prompts, answers and retrieved text, as selected.

## Implementation

- **Dependencies:** replace old Azure Monitor distro and Requests instrumentation pins with `microsoft-opentelemetry==1.4.0`. Update ASGI instrumentation to `0.66b0`. Remove conflicting `pydantic_core` pin; let existing Pydantic select compatible version. Proposed dependencies already resolve successfully for Python 3.11.
- **Startup:** replace existing telemetry block in `app.py` with one small initializer, called once per worker before clients and graph are created. Use existing Pydantic settings for optional `APPLICATIONINSIGHTS_CONNECTION_STRING`, accepting legacy `AZURE_APPLICATION_INSIGHTS_CONNECTION_STRING` as fallback. Missing connection string disables initialization.
- **SDK configuration:** enable Azure Monitor, LangChain instrumentation and `enable_sensitive_data=True`. Set fixed agent ID `hr-chatbot`, display name `HR chatbot`. Disable separate OpenAI instrumentation to avoid duplicate model spans. Keep existing logging through SDK’s logging pipeline. [Microsoft SDK](https://github.com/microsoft/opentelemetry-distro-python)
- **HTTP tracing:** retain ASGI middleware, installing once during app creation when telemetry is enabled. Remove manual `RequestsInstrumentor()` call; distro handles outgoing requests.
- **Graph tracing:** add `metadata={"otel_trace": True}` to three node registrations. Pass existing string `conversation_id` through invocation metadata in both `complete_graph` and `stream_graph`; omit when unavailable.
- **Accurate answers:** include final assistant message in terminal node’s returned `messages`, alongside existing `answer`. Small shared helper handles model answers and insufficient-information replies. SDK then reports actual final reply. Preserve response envelopes, citations and history behavior.
- **Settings/docs:** document `OTEL_SERVICE_NAME=hr-chatbot`, `AZURE_EXPERIMENTAL_ENABLE_GENAI_TRACING=true`, and 100% sampling through `OTEL_TRACES_SAMPLER=microsoft.fixed_percentage` plus `OTEL_TRACES_SAMPLER_ARG=1.0`. Update environment sample and deployment settings.

## Azure setup and rollout

- Connect Foundry project to Application Insights resource already used by each environment.
- In Foundry, select **Build → Agents → New agent → Link external agent**. Use OpenTelemetry ID `hr-chatbot`. This registration preserves current request URLs and needs no AI Gateway or new runtime SDK. External-agent view is preview. [Registration guide](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/register-external-agent)
- Remove App Service auto-instrumentation setting from deployment templates and deployed slots; retain connection string. Remove redundant legacy connection-string setting after migration.
- Deploy development first, verify traces, then promote through existing environments. Disabling connection-string settings disables application telemetry after restart.

## Tests and acceptance

Add one focused telemetry test module using existing mocked graph fixtures and in-memory span export. Isolate SDK initialization because providers are process-global.

Verify:

- Missing configuration produces no telemetry initialization; repeated app creation adds no duplicate setup.
- Streaming and non-streaming requests produce graph, three step and model spans with captured content.
- Saved conversation IDs correlate turns; concurrent requests retain separate traces.
- Empty retrieval records actual insufficient-information reply.
- Rewrite fallback, Search/model failures and errors after streaming starts remain visible.
- Existing backend tests pass; existing Docker image builds.

Synthetic SDK probes already passed streaming, non-streaming, empty retrieval, correct final replies and distinct request traces. No repository files changed.

## Defaults

Full content capture enabled wherever telemetry is configured. Stateless requests receive separate traces without inventing persistent conversation IDs. Initial scope covers traces, timings and errors; evaluations, alerts and custom dashboards remain outside this change.