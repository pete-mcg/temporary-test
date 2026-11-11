"""Enable Foundry's continuous Friendliness evaluation for an existing agent."""

from pathlib import Path

from azure.ai.projects import AIProjectClient
from azure.ai.projects.models import (
    ContinuousEvaluationRuleAction,
    EvaluationRule,
    EvaluationRuleEventType,
    EvaluationRuleFilter,
)
from openai import OpenAI
from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict

from backend.auth.credential_helpers import create_sync_chained_credential


class EvaluationSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).with_name(".env"),
        env_prefix="AZURE_AI_",
        extra="ignore",
        str_strip_whitespace=True,
    )

    project_endpoint: HttpUrl
    agent_name: str = Field(min_length=1)
    judge_deployment: str = Field(
        min_length=1, validation_alias="AZURE_AI_MODEL_DEPLOYMENT_NAME"
    )
    evaluation_max_hourly_runs: int = Field(default=10, gt=0)


# Microsoft's Friendliness example:
# https://learn.microsoft.com/azure/foundry/concepts/evaluation-evaluators/custom-evaluators
FRIENDLINESS_PROMPT = """Friendliness assesses the warmth and approachability of the response.
Rate the friendliness of the response between one and five using the following scale:

1 - Unfriendly or hostile
2 - Mostly unfriendly
3 - Neutral
4 - Mostly friendly
5 - Very friendly

Assign a rating based on the tone and demeanor of the response.

Response:
{{response}}

Output Format (JSON):
{
  "result": <integer from 1 to 5>,
  "reason": "<brief explanation for the score>"
}
"""


def register_evaluator(project: AIProjectClient) -> str:
    evaluator = project.beta.evaluators.create_version(
        name="friendliness_evaluator",
        evaluator_version={
            "name": "friendliness_evaluator",
            "evaluator_type": "custom",
            "categories": ["quality"],
            "display_name": "Friendliness Evaluator",
            "description": "Evaluates the warmth and approachability of a response",
            "definition": {
                "type": "prompt",
                "prompt_text": FRIENDLINESS_PROMPT,
                "init_parameters": {
                    "type": "object",
                    "properties": {
                        "deployment_name": {"type": "string"},
                        "threshold": {"type": "number"},
                    },
                    "required": ["deployment_name", "threshold"],
                },
                "data_schema": {
                    "type": "object",
                    "properties": {"response": {"type": "string"}},
                    "required": ["response"],
                },
                "metrics": {
                    "custom_prompt": {
                        "type": "ordinal",
                        "desirable_direction": "increase",
                        "min_value": 1,
                        "max_value": 5,
                    }
                },
            },
        },
    )
    return evaluator.version


def create_evaluation(
    client: OpenAI, evaluator_version: str, model_deployment_name: str
) -> str:
    # The OpenAI SDK sends these Foundry extensions but doesn't type them.
    evaluation = client.evals.create(
        name="Friendliness continuous evaluation",
        data_source_config={"type": "azure_ai_source", "scenario": "responses"},  # type: ignore[arg-type]
        testing_criteria=[  # type: ignore[arg-type]
            {
                "type": "azure_ai_evaluator",
                "name": "friendliness_evaluator",
                "evaluator_name": "friendliness_evaluator",
                "evaluator_version": evaluator_version,
                "data_mapping": {"response": "{{item.response}}"},
                "initialization_parameters": {
                    "deployment_name": model_deployment_name,
                    "threshold": 3,
                },
            }
        ],
    )
    return evaluation.id


def configure_rule(
    project: AIProjectClient, agent_name: str, evaluation_id: str, max_hourly_runs: int
) -> str:
    rule = project.evaluation_rules.create_or_update(
        id=f"{agent_name}-friendliness-continuous",
        evaluation_rule=EvaluationRule(
            display_name=f"{agent_name} Friendliness continuous evaluation",
            action=ContinuousEvaluationRuleAction(
                eval_id=evaluation_id, max_hourly_runs=max_hourly_runs
            ),
            event_type=EvaluationRuleEventType.RESPONSE_COMPLETED,
            filter=EvaluationRuleFilter(agent_name=agent_name),
            enabled=True,
        ),
    )
    return rule.id


def main() -> None:
    settings = EvaluationSettings()
    with (
        create_sync_chained_credential(
            include_environment_credential=False
        ) as credential,
        AIProjectClient(
            endpoint=str(settings.project_endpoint),
            credential=credential,
            allow_preview=True,
        ) as project,
        project.get_openai_client() as client,
    ):
        version = register_evaluator(project)
        print(f"Evaluator version: friendliness_evaluator:{version}")
        evaluation_id = create_evaluation(client, version, settings.judge_deployment)
        print(f"Evaluation ID: {evaluation_id}")
        rule_id = configure_rule(
            project,
            settings.agent_name,
            evaluation_id,
            settings.evaluation_max_hourly_runs,
        )
        print(f"Rule ID: {rule_id}")


if __name__ == "__main__":
    main()
