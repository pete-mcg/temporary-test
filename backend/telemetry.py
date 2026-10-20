from microsoft.opentelemetry import use_microsoft_opentelemetry


def configure_telemetry(connection_string: str | None) -> None:
    if not connection_string:
        return

    use_microsoft_opentelemetry(
        enable_azure_monitor=True,
        azure_monitor_connection_string=connection_string,
        enable_sensitive_data=True,
        instrumentation_options={
            "langchain": {
                "enabled": True,
                "agent_id": "hr-chatbot",
                "agent_name": "HR chatbot",
            },
            "openai": {"enabled": False},
        },
    )
