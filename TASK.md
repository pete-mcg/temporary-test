# Context

This is a RAG chatbot built using LangGraph with OpenAI models that are deployed in an Azure OpenAI resource, and uses both Azure Search Service for the knowledge base index and Azure CosmosDB for conversation history.

It is deployed as an Azure Web Application, which users presently access.

# Problem

Currently I lack the visibility to know when my chatbot is performing as it should, or (more importantly) when something is going wrong. I need better observability.

# Objective

I am aware that in Microsoft Foundry, it is possible to view conversation traces from a chatbot. There is the `langchain-azure-ai` package, which can emit OpenTelemetry traces from LangChain and LangGraph applications and sink them in Azure Application Insights, by using `AzureAIOpenTelemetryTracer`.

I am happy to redeploy an equivalent OpenAI model within Microsoft Foundry.

The existing, basic Telemetry within this application does not necessarily need to be retained. It was written a long time ago by inexperienced developers, and we are very open to removing it.

# Task

Please plan how to implement this in the **simplest** way possible. I don't want massive, over-engineered, unnecessarily large line changes.