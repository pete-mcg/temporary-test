"""Redact conversation spans before any telemetry exporter sees them."""

import json
import logging
import os
from functools import cache
from uuid import UUID

import spacy
from azure.monitor.opentelemetry import configure_azure_monitor
from opentelemetry.sdk.trace import Event, ReadableSpan, SpanProcessor
from opentelemetry.trace import Link, Status
from opentelemetry.util.types import Attributes, AttributeValue
from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import SpacyNlpEngine
from presidio_anonymizer import AnonymizerEngine
from pydantic import JsonValue, TypeAdapter, ValidationError

logger = logging.getLogger(__name__)
JSON_VALUE = TypeAdapter(JsonValue)


class MalformedTelemetryJson(ValueError):
    """Serialized content is incomplete or invalid and must be dropped."""


def is_uuid(value: str) -> bool:
    try:
        UUID(value)
    except ValueError:
        return False
    return True


class PiiRedactionProcessor(SpanProcessor):
    def __init__(self) -> None:
        self.analyzer: AnalyzerEngine | None = None
        self.anonymizer: AnonymizerEngine | None = None
        try:
            self.anonymizer = AnonymizerEngine()
            # Load locally: Presidio's default loader downloads missing models.
            engine = SpacyNlpEngine()
            engine.nlp = {"en": spacy.load("en_core_web_lg")}
            self.analyzer = AnalyzerEngine(nlp_engine=engine)
        except Exception:
            logger.error("Telemetry PII model unavailable; span content suppressed.")

    def redact_text(self, text: str) -> str:
        if self.analyzer is None or self.anonymizer is None:
            raise RuntimeError("Telemetry PII model unavailable")
        if not text or is_uuid(text):
            return text
        if text.lstrip().startswith(("{", "[", '"')):
            try:
                value = JSON_VALUE.validate_json(text)
            except ValidationError:
                raise MalformedTelemetryJson from None
            return json.dumps(self.redact_value(value), ensure_ascii=False)
        results = self.analyzer.analyze(text=text, language="en")
        return self.anonymizer.anonymize(text=text, analyzer_results=results).text

    def redact_value(self, value: JsonValue) -> JsonValue:
        if isinstance(value, str):
            return self.redact_text(value)
        if isinstance(value, list):
            return [self.redact_value(item) for item in value]
        if isinstance(value, dict):
            return {key: self.redact_value(item) for key, item in value.items()}
        return value

    def redact_attributes(self, attributes: Attributes) -> dict[str, AttributeValue]:
        redacted = {}
        for key, value in (attributes or {}).items():
            try:
                if isinstance(value, str):
                    value = self.redact_text(value)
                elif isinstance(value, (list, tuple)):
                    value = tuple(
                        self.redact_text(item) if isinstance(item, str) else item
                        for item in value
                    )
            except MalformedTelemetryJson:
                # Truncated or malformed serialized content cannot be analyzed safely.
                continue
            redacted[key] = value
        return redacted

    def on_end(self, span: ReadableSpan) -> None:
        scope = span.instrumentation_scope
        if scope is None or scope.name != "hr-chatbot":
            return
        try:
            name = self.redact_text(span.name)
            attributes = self.redact_attributes(span.attributes)
            events = [
                Event(
                    self.redact_text(event.name),
                    self.redact_attributes(event.attributes),
                    event.timestamp,
                )
                for event in span.events
            ]
            links = [
                Link(link.context, self.redact_attributes(link.attributes))
                for link in span.links
            ]
            description = span.status.description
            status = Status(
                span.status.status_code,
                self.redact_text(description) if description else None,
            )
        except Exception:
            # No exception details: they may contain the content we failed to redact.
            logger.warning("Telemetry PII redaction failed; span content suppressed.")
            name, attributes, events, links = "redacted", {}, [], []
            status = Status(span.status.status_code)

        # Ended SDK spans are read-only. Keep backing-field writes here; the SDK
        # is pinned and tests inspect exported spans (Azure's processor pattern).
        span._name = name
        span._attributes = attributes
        span._events = events
        span._links = links
        span._status = status


@cache
def configure_telemetry(connection_string: str) -> None:
    """Initialize once per worker, with redaction registered before exporters."""
    # Preserve the tracer's sampler default and avoid Azure dropping start attributes.
    os.environ.setdefault("OTEL_TRACES_SAMPLER", "always_on")
    configure_azure_monitor(
        connection_string=connection_string,
        span_processors=[PiiRedactionProcessor()],
        sampling_ratio=1.0,
        instrumentation_options={
            "requests": {"enabled": False},
            "urllib": {"enabled": False},
            "urllib3": {"enabled": False},
        },
    )
