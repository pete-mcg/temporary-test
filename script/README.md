# Continuous Friendliness evaluation in Foundry

The standalone setup command registers Microsoft's
[prompt-based Friendliness evaluator](https://learn.microsoft.com/en-us/azure/foundry/concepts/evaluation-evaluators/custom-evaluators)
and enables a [continuous evaluation rule](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/how-to-monitor-agents-dashboard#set-up-continuous-evaluation)
for the existing external agent. Foundry evaluates individual completed turns;
the app needs no worker or scheduler. Scores range from 1 to 5, with 3 as the
passing threshold. Only Friendliness is configured.

Copy [`script/.env.sample`](.env.sample) to `script/.env` and replace the
placeholders:

```dotenv
AZURE_AI_PROJECT_ENDPOINT=https://<account-name>.services.ai.azure.com/api/projects/<project-name>
AZURE_AI_AGENT_NAME=<existing-agent-registration-name>
AZURE_AI_MODEL_DEPLOYMENT_NAME=<judge-deployment-name>
AZURE_AI_EVALUATION_MAX_HOURLY_RUNS=10
```

The command always loads `.env` beside `evaluations.py`, independently of the
working directory. Exported environment variables override this file.

Use the exact registered agent name already associated with the app's traces.
The judge must be a chat-completion deployment available to that project.
The hourly cap must be a positive integer. Its default is 10; this is a maximum,
not a guarantee of ten evaluations or uniform sampling across the hour.
Percentage sampling uses the service default. Keep the existing tracing linkage
and redaction configuration in the
[root README](../README.md#conversation-tracing-in-microsoft-foundry).

Assign these [evaluation permissions](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/evaluation-permissions)
before setup:

- Setup/review identity: **Foundry User** on the project. For viewing traces,
  also assign **Log Analytics Reader** on Application Insights and its workspace
  when queries use workspace scope.
- Project managed identity: **Foundry User** for evaluation rules, and at the
  Foundry account scope for judge inference; project-only access cannot invoke
  the model. Assign **Reader** on the connected Application Insights resource.
- For workspace-only access mode or protected tables, apply the additional
  [workspace and protected-table roles](https://learn.microsoft.com/en-us/azure/foundry/observability/how-to/evaluation-permissions#add-permissions-for-trace-based-workflows)
  to the relevant identities. These include workspace reader access and
  **Privileged Monitoring Data Reader**; DataActionsOnly mode uses
  **Log Analytics Data Reader**.
- If using your own Entra-authenticated evaluation storage, give the project
  identity **Storage Blob Data Contributor** on that storage account.

Role names may still appear as **Azure AI User** during the Foundry rename.
Allow time for role assignments to propagate.

Run the following commands from the repository root.
Install requirements in your active Python environment, install Azure CLI, and
sign in to the development tenant/subscription with the setup identity:

```sh
python -m pip install -r script/requirements.txt
az login
az account set --subscription <development-subscription-id>
python -m script.evaluations
```

[`script/requirements.txt`](requirements.txt) contains the evaluation command's
dependencies. You can install them in a separate virtual environment.

This command uses the existing synchronous credential helper with only Azure CLI
authentication enabled. It validates configuration before opening Azure clients
and prints the evaluator version, evaluation ID, then rule ID as each succeeds.
An SDK failure fails the command; earlier printed IDs identify any resources
already created. It uses the pinned `azure-ai-projects==2.4.0` preview API.

Every explicit run creates a new evaluator version and evaluation group, then
repoints the same `<agent-name>-friendliness-continuous` rule to the new group.
Earlier groups and reports remain available. Rerunning also enables the rule.

For development acceptance, run setup, then send real questions and follow-ups
through the chatbot. In Foundry, open the registered agent's **Monitor** tab and
the evaluation group matching the printed evaluation ID on the **Evaluation**
page. Allow time for ingestion and evaluation. Open a **Completed** run and its
per-item details: confirm a Friendliness (`custom_prompt`) score and explanation
for the app's final response, rather than a rewritten query or intermediate
model output. Compare with the source trace. Use synthetic PII and confirm the
evaluated response contains redaction placeholders. Generate traffic for a
different registered agent and confirm it does not appear in this group's
results. If the cap is exhausted, wait for the next hour. A created rule alone
does not establish that trace ingestion, response mapping, or scoring works.
Live acceptance remains pending while the settings contain placeholders.

To stop future evaluations while preserving reports, run this Python snippet
from the repository root in the same environment:

```python
from azure.ai.projects import AIProjectClient
from backend.auth.credential_helpers import create_sync_chained_credential
from script.evaluations import EvaluationSettings

settings = EvaluationSettings()
with (
    create_sync_chained_credential(include_environment_credential=False) as credential,
    AIProjectClient(
        endpoint=str(settings.project_endpoint), credential=credential, allow_preview=True
    ) as project,
):
    rule_id = f"{settings.agent_name}-friendliness-continuous"
    rule = project.evaluation_rules.get(id=rule_id)
    rule.enabled = False
    project.evaluation_rules.create_or_update(id=rule_id, evaluation_rule=rule)
    print(f"Disabled rule: {rule_id}")
```
