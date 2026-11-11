# Task

This RAG chatbot emits conversation traces to Application Insights. I have set up/linked an external agent in Microsoft Foundry too, linked to Application Insights.

I would like you write the code for configuring recurring evaluations: specifically continuous evaluation samples live traffic as it occurs. This will use a custom prompt-based evaluator, rather than a first-party evaluator. Use the Friendliness example given in the Microsoft Documentation.

Use the documentation below, and any documentation that it points to.

https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/how-to-monitor-agents-dashboard

# Plan

## Summary

Add a standalone Python command that registers Microsoft’s Friendliness evaluator and enables continuous evaluation for the existing external agent.

Use the agreed defaults: 10 evaluations per hour, passing score 3/5, and the existing working trace linkage.

## Implementation

- Add backend/evaluations.py, runnable with python -m backend.evaluations. Keep evaluator registration, evaluation creation, and rule configuration in small, straightforward functions.
- Reuse the existing synchronous Azure credential helper. Construct AIProjectClient with allow_preview=True and use its OpenAI client. Explicitly pin the already-installed azure-ai-projects==2.4.0 dependency; the installed openai==2.26.0 supports the required calls.
- Register friendliness_evaluator through project.beta.evaluators.create_version. Use Microsoft’s documented prompt, required string response input, ordinal 1–5 metric, and JSON result/reason output. Supply the judge deployment and threshold 3 as initialization parameters. Custom evaluator documentation
- Create an evaluation with azure_ai_source, scenario responses, and only the custom evaluator. Reference the returned evaluator version explicitly and map response to {{item.response}}.
- Create or update one deterministic rule, <agent-name>-friendliness-continuous, using RESPONSE_COMPLETED, the existing registered agent name, enabled=True, and max_hourly_runs=10. Leave percentage sampling at the service default. Continuous evaluation setup
- Print the evaluator version, evaluation ID, and rule ID as they are created. Let SDK failures produce a failed command; do not report success after partial failure.

## Configuration and operation

- Add these settings to the environment sample and validate them before Azure calls:
  - AZURE_AI_PROJECT_ENDPOINT
  - AZURE_AI_AGENT_NAME — the existing Foundry registration name.
  - AZURE_AI_MODEL_DEPLOYMENT_NAME — a judge deployment available to the Foundry project.
  - AZURE_AI_EVALUATION_MAX_HOURLY_RUNS=10 — positive integer.
- Document setup, invocation, result inspection, and disabling the rule in README.md.
- Document the setup identity’s Foundry permissions, the project managed identity’s evaluation/model permissions, and its Reader access to connected Application Insights. Link conditional workspace/protected-table requirements. Evaluation permissions
- Each explicit setup run creates a new evaluator version and evaluation group, then repoints the same rule. Preserve earlier reports; document this simple rerun behavior.

## Validation

- Add one small mocked test module covering the evaluator payload, response mapping, pinned version, agent filter, hourly cap, missing configuration, and SDK failure propagation.
- Verify rerunning targets the same rule ID.
- Run the backend tests.
- In development, run setup and generate actual chatbot traffic. Confirm a Completed evaluation contains a Friendliness score and explanation for the app’s final response. Check that it evaluates redacted content and excludes unrelated agents. Rule creation alone does not satisfy acceptance.

## Assumptions and limits

- Preserve the tracing implementation because conversations already appear under the external agent.
- Evaluate individual turns using Microsoft’s documented continuous-rule approach.
- Foundry performs ongoing evaluation after setup. Add no application worker, scheduler, frontend controls, or first-party evaluators.
- The hourly setting is a cap, not a guarantee of ten evaluations or uniform sampling across the hour