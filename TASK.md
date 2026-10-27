# User Task

## Context

This RAG chatbot uses LangGraph and stores conversation telemetry in Application Insights / Microsoft Foundry. Please explore the most simple way to implement PII redaction on telemetry data. We should use a reliable third-party package, rather than re-inventing the wheel

## Task

Implement this in the **simplest** way possible. I don't want massive, over-engineered, unnecessarily large line changes.

# Plan

## Summary

Use Presidio Analyzer + Anonymizer, loaded locally once per worker. Replace detected PII with placeholders such as <PERSON> and <EMAIL_ADDRESS> before telemetry export. Presidio supplies detection and replacement; application adds small telemetry adapter. Presidio overview

Agreed scope: broad English PII, standard en_core_web_lg model, conversation traces only. Redaction failures suppress affected span’s content while chat continues.

## Implementation

- Add one backend/telemetry.py module containing typed redaction helpers and one OpenTelemetry SpanProcessor.
- In existing configure_graph_tracing, explicitly initialize Azure Monitor with redaction processor registered before exporters. Set tracer’s auto_configure_azure_monitor=False; keep one initializer per worker. Azure supports ordered custom processors. Azure configuration
- Retain content recording and graph state tracing. Sanitize span text attributes, exception events, and status descriptions. This covers prompts, answers, rewritten queries, retrieved content, and graph state.
- Decode serialized JSON, redact string values recursively, then serialize again. Drop malformed or truncated JSON fields. Preserve numbers, structural keys, timings, token counts, and generated trace/span/conversation IDs. Preserve conversation-ID attributes unchanged only when valid UUIDs; process other values normally.
- Use built-in English recognizers and default thresholds. No custom regex, pseudonym mappings, cloud service, or configuration framework.
- Ended Python spans are read-only through public APIs. Isolate replacement of SDK backing fields inside processor, following Azure’s documented processor pattern; pin SDK and test exported results. Azure processor example
- If model initialization or redaction fails, remove affected span’s attributes, events, links, and status description; use fixed span name. Retain trace context, timestamps, and status code. Emit static diagnostic without original content or exception text.
- Chat inputs, model calls, responses, and CosmosDB history retain original content. No public API or schema changes.

## Dependencies and deployment

- Pin presidio-analyzer==2.2.366, presidio-anonymizer==2.2.366, spacy==3.8.18, and opentelemetry-sdk==1.45.1.
- Upgrade Pydantic from 2.11.10 to 2.12.5, required by selected Presidio release.
- Install pinned en_core_web_lg==3.8.0 during image build. No runtime model downloads; skip model initialization when tracing disabled.
- Dependency dry run resolves for existing Python 3.11/Alpine target. Full container build remains required. Document model memory cost per Gunicorn worker.

## Validation and limits

- Extend existing in-memory exporter tests with synthetic names, emails, phones, financial identifiers, and supported national IDs.
- Exercise streaming, non-streaming, follow-ups, retrieval, and controlled failures. Assert original PII absent from exported attributes, events, and status descriptions; chat behavior unchanged.
- Test escaped/nested JSON, truncated state, missing model, redaction failure, correlation IDs, and initialization once per worker.
- Run backend suite and container build. Verify synthetic examples in development Foundry traces before production rollout; measure latency and worker memory.
- Application logs, existing stored telemetry, and CosmosDB data remain outside scope. Automated detection can miss PII; validate representative HR examples before rollout. Detection limits