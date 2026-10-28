import json
from unittest.mock import Mock
from uuid import uuid4

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import Link, SpanContext, Status, StatusCode

from backend import telemetry

PII = (
    "John Smith",
    "john.smith@example.com",
    "212-555-5555",
    "4111 1111 1111 1111",
    "GB82 WEST 1234 5698 7654 32",
    "219-09-9999",
    "9434765919",
)
TEXT = (
    f"My name is {PII[0]}, email {PII[1]}, phone {PII[2]}, credit card {PII[3]}, "
    f"IBAN {PII[4]}, US SSN {PII[5]}, UK NHS number {PII[6]}."
)


def export_span(processor, attributes, scope="hr-chatbot"):
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(processor)
    provider.add_span_processor(SimpleSpanProcessor(exporter))
    context = SpanContext(trace_id=1, span_id=2, is_remote=True)
    with provider.get_tracer(scope).start_as_current_span(
        PII[1], attributes=attributes, links=[Link(context, {"content": TEXT})]
    ) as span:
        span.add_event(PII[1], {"content": TEXT})
        span.record_exception(ValueError(TEXT))
        span.set_status(Status(StatusCode.ERROR, TEXT))
    provider.shutdown()
    return exporter.get_finished_spans()[0]


def test_exported_content_and_json(pii_processor):
    conversation_id = str(uuid4())
    state = {
        "message": TEXT,
        "nested": [json.dumps({"email": PII[1]}), 10, False, None],
        "id": conversation_id,
    }
    attributes = {
        "gen_ai.agent.state": json.dumps(state),
        "escaped": '{"email": "john\\u002esmith@example.com"}',
        "truncated": '{"message": "' + PII[1],
        "invalid": "[invalid JSON " + PII[1],
        "strings": [PII[1], PII[2]],
        "gen_ai.conversation.id": conversation_id,
        "gen_ai.usage.input_tokens": 10,
        "duration": 1.5,
    }
    span = export_span(pii_processor, attributes)
    exported = span.to_json()
    for value in PII:
        assert value not in exported
    assert "<PERSON>" in exported and "<EMAIL_ADDRESS>" in exported
    assert "<PHONE_NUMBER>" in exported and "<CREDIT_CARD>" in exported
    assert "<IBAN_CODE>" in exported and "<US_SSN>" in exported
    assert "<UK_NHS>" in exported
    result = json.loads(span.attributes["gen_ai.agent.state"])
    assert result["nested"][1:] == [10, False, None]
    assert json.loads(result["nested"][0]) == {"email": "<EMAIL_ADDRESS>"}
    assert result["id"] == conversation_id
    assert span.attributes["gen_ai.conversation.id"] == conversation_id
    assert span.attributes["gen_ai.usage.input_tokens"] == 10
    assert span.attributes["duration"] == 1.5
    assert "truncated" not in span.attributes and "invalid" not in span.attributes
    assert json.loads(span.attributes["escaped"])["email"] == "<EMAIL_ADDRESS>"
    assert attributes["gen_ai.agent.state"] == json.dumps(state)
    assert span.status.status_code is StatusCode.ERROR
    assert span.context.trace_id and span.context.span_id
    assert span.end_time >= span.start_time
    assert span.links[0].context.trace_id == 1


def test_non_uuid_conversation_id_is_redacted(pii_processor):
    span = export_span(pii_processor, {"gen_ai.conversation.id": PII[1]})
    assert span.attributes["gen_ai.conversation.id"] == "<EMAIL_ADDRESS>"


@pytest.mark.parametrize("failure", ["model", "analyzer", "anonymizer"])
def test_failures_suppress_content(pii_processor, monkeypatch, caplog, failure):
    if failure == "model":
        loader = Mock(side_effect=OSError(TEXT))
        monkeypatch.setattr(telemetry.spacy, "load", loader)
        downloader = Mock(side_effect=AssertionError("No runtime downloads"))
        monkeypatch.setattr(telemetry.spacy.cli, "download", downloader)
        processor = telemetry.PiiRedactionProcessor()
        loader.assert_called_once_with("en_core_web_lg")
        downloader.assert_not_called()
    else:
        processor = pii_processor
        engine = processor.analyzer if failure == "analyzer" else processor.anonymizer
        method = "analyze" if failure == "analyzer" else "anonymize"
        monkeypatch.setattr(engine, method, Mock(side_effect=RuntimeError(TEXT)))
    span = export_span(processor, {"content": TEXT})
    assert span.name == "redacted"
    assert not span.attributes and not span.events and not span.links
    assert span.status.description is None
    assert span.status.status_code is StatusCode.ERROR
    assert span.context.trace_id and span.context.span_id
    assert span.end_time >= span.start_time
    assert "span content suppressed" in caplog.text
    for value in PII:
        assert value not in span.to_json() and value not in caplog.text


def test_non_conversation_spans_unchanged(pii_processor):
    span = export_span(pii_processor, {"content": TEXT}, scope="other-library")
    assert span.attributes["content"] == TEXT


def test_initializer_once_and_disabled(app_module, settings, monkeypatch):
    monkeypatch.delenv("OTEL_TRACES_SAMPLER", raising=False)
    monitor = Mock()
    processor = Mock()
    monkeypatch.setattr(telemetry, "configure_azure_monitor", monitor)
    monkeypatch.setattr(telemetry, "PiiRedactionProcessor", processor)
    telemetry.configure_telemetry.cache_clear()
    try:
        graph = Mock()
        for connection_string in (None, "", "   "):
            disabled = settings.model_copy(
                update={"applicationinsights_connection_string": connection_string}
            )
            assert app_module.configure_graph_tracing(graph, disabled) is graph
        processor.assert_not_called()
        monitor.assert_not_called()
        telemetry.configure_telemetry("test-connection-string")
        telemetry.configure_telemetry("test-connection-string")
        processor.assert_called_once_with()
        monitor.assert_called_once_with(
            connection_string="test-connection-string",
            span_processors=[processor.return_value],
            sampling_ratio=1.0,
            instrumentation_options={
                "requests": {"enabled": False},
                "urllib": {"enabled": False},
                "urllib3": {"enabled": False},
            },
        )
        assert telemetry.os.environ["OTEL_TRACES_SAMPLER"] == "always_on"
    finally:
        telemetry.configure_telemetry.cache_clear()
