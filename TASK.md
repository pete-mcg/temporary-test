# Context

This is a RAG chatbot built using LangGraph with OpenAI models that are deployed in an Azure OpenAI resource, and uses both Azure Search Service for the knowledge base index and Azure CosmosDB for conversation history.

It is deployed as an Azure Web Application, which users presently access.

# Problem

Currently I lack the visibility to know when my chatbot is performing as it should, or (more importantly) when something is going wrong. I need better observability.

# Objective

I am aware that in Microsoft Foundry Countr Pane, it is possible to view conversation traces from a chatbot. I would like to use the `microsoft-opentelemetry` package.

I am happy to redeploy an equivalent OpenAI model within Microsoft Foundry, if needed.

The existing, basic Telemetry within this application does not necessarily need to be retained. It was written a long time ago by inexperienced developers, and I am very open to removing it if it is going to result in conflicts.

# Task

Please plan how to implement this in the **simplest** way possible. I don't want massive, over-engineered, unnecessarily large line changes.