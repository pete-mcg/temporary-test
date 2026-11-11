from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from azure.core.exceptions import HttpResponseError
from pydantic import ValidationError

from script import evaluations


def test_script_env_file(tmp_path, monkeypatch):
    settings_class = evaluations.EvaluationSettings
    assert settings_class.model_config["env_file"] == Path(
        evaluations.__file__
    ).with_name(".env")
    script_dir = tmp_path / "script"
    script_dir.mkdir()
    script_env = script_dir / ".env"
    script_env.write_text(
        "AZURE_AI_PROJECT_ENDPOINT=https://foundry.example/api/projects/hr\n"
        "AZURE_AI_AGENT_NAME=script-agent\n"
        "AZURE_AI_MODEL_DEPLOYMENT_NAME=script-judge\n"
        "AZURE_AI_EVALUATION_MAX_HOURLY_RUNS=6\n",
        encoding="utf-8",
    )
    (tmp_path / ".env").write_text("AZURE_AI_AGENT_NAME=root-agent\n", encoding="utf-8")
    for name in (
        "AZURE_AI_PROJECT_ENDPOINT",
        "AZURE_AI_AGENT_NAME",
        "AZURE_AI_MODEL_DEPLOYMENT_NAME",
        "AZURE_AI_EVALUATION_MAX_HOURLY_RUNS",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setitem(settings_class.model_config, "env_file", script_env)
    monkeypatch.chdir(tmp_path)

    settings = settings_class()

    assert str(settings.project_endpoint) == "https://foundry.example/api/projects/hr"
    assert settings.agent_name == "script-agent"
    assert settings.judge_deployment == "script-judge"
    assert settings.evaluation_max_hourly_runs == 6
    monkeypatch.setenv("AZURE_AI_AGENT_NAME", "environment-agent")
    assert settings_class().agent_name == "environment-agent"


@pytest.fixture
def setup_clients(monkeypatch):
    # Keep the tests independent of local dotenv files and Azure credentials.
    monkeypatch.setitem(evaluations.EvaluationSettings.model_config, "env_file", None)
    monkeypatch.setenv(
        "AZURE_AI_PROJECT_ENDPOINT", "https://foundry.example/api/projects/hr"
    )
    monkeypatch.setenv("AZURE_AI_AGENT_NAME", "registered-hr-agent")
    monkeypatch.setenv("AZURE_AI_MODEL_DEPLOYMENT_NAME", "judge")
    monkeypatch.delenv("AZURE_AI_EVALUATION_MAX_HOURLY_RUNS", raising=False)
    credential_factory = MagicMock()
    project_factory = MagicMock()
    project = project_factory.return_value.__enter__.return_value
    client = project.get_openai_client.return_value.__enter__.return_value
    project.evaluation_rules.create_or_update.return_value.id = (
        "registered-hr-agent-friendliness-continuous"
    )
    monkeypatch.setattr(
        evaluations, "create_sync_chained_credential", credential_factory
    )
    monkeypatch.setattr(evaluations, "AIProjectClient", project_factory)
    return credential_factory, project_factory, project, client


@pytest.mark.parametrize("hourly_cap", [10, 4])
def test_setup_payloads_and_rerun(setup_clients, monkeypatch, capsys, hourly_cap):
    credential_factory, project_factory, project, client = setup_clients
    if hourly_cap != 10:
        monkeypatch.setenv("AZURE_AI_EVALUATION_MAX_HOURLY_RUNS", str(hourly_cap))
    project.beta.evaluators.create_version.side_effect = [
        SimpleNamespace(version="7"),
        SimpleNamespace(version="8"),
    ]
    client.evals.create.side_effect = [
        SimpleNamespace(id="eval-first"),
        SimpleNamespace(id="eval-second"),
    ]

    evaluations.main()
    evaluations.main()

    credential_factory.assert_called_with(include_environment_credential=False)
    project_factory.assert_called_with(
        endpoint="https://foundry.example/api/projects/hr",
        credential=credential_factory.return_value.__enter__.return_value,
        allow_preview=True,
    )
    registration = project.beta.evaluators.create_version.call_args.kwargs
    assert registration["name"] == "friendliness_evaluator"
    assert registration["evaluator_version"]["evaluator_type"] == "custom"
    definition = registration["evaluator_version"]["definition"]
    assert definition["type"] == "prompt"
    assert definition["prompt_text"] == evaluations.FRIENDLINESS_PROMPT
    assert "1 - Unfriendly or hostile" in definition["prompt_text"]
    assert "5 - Very friendly" in definition["prompt_text"]
    assert "{{response}}" in definition["prompt_text"]
    assert '"result": <integer from 1 to 5>' in definition["prompt_text"]
    assert '"reason": "<brief explanation for the score>"' in definition["prompt_text"]
    assert definition["data_schema"] == {
        "type": "object",
        "properties": {"response": {"type": "string"}},
        "required": ["response"],
    }
    assert definition["init_parameters"] == {
        "type": "object",
        "properties": {
            "deployment_name": {"type": "string"},
            "threshold": {"type": "number"},
        },
        "required": ["deployment_name", "threshold"],
    }
    assert definition["metrics"] == {
        "custom_prompt": {
            "type": "ordinal",
            "desirable_direction": "increase",
            "min_value": 1,
            "max_value": 5,
        }
    }
    for call, version in zip(client.evals.create.call_args_list, ["7", "8"]):
        assert call.kwargs["data_source_config"] == {
            "type": "azure_ai_source",
            "scenario": "responses",
        }
        assert call.kwargs["testing_criteria"] == [
            {
                "type": "azure_ai_evaluator",
                "name": "friendliness_evaluator",
                "evaluator_name": "friendliness_evaluator",
                "evaluator_version": version,
                "data_mapping": {"response": "{{item.response}}"},
                "initialization_parameters": {
                    "deployment_name": "judge",
                    "threshold": 3,
                },
            }
        ]
    for call, evaluation_id in zip(
        project.evaluation_rules.create_or_update.call_args_list,
        ["eval-first", "eval-second"],
    ):
        assert call.kwargs["id"] == "registered-hr-agent-friendliness-continuous"
        rule = call.kwargs["evaluation_rule"].as_dict()
        assert rule["filter"] == {"agentName": "registered-hr-agent"}
        assert rule["eventType"] == "responseCompleted"
        assert rule["enabled"] is True
        assert rule["action"] == {
            "type": "continuousEvaluation",
            "evalId": evaluation_id,
            "maxHourlyRuns": hourly_cap,
        }
    output = capsys.readouterr().out
    assert "Evaluator version: friendliness_evaluator:8" in output
    assert "Evaluation ID: eval-second" in output
    assert output.count("Rule ID: registered-hr-agent-friendliness-continuous") == 2


@pytest.mark.parametrize(
    "name",
    [
        "AZURE_AI_PROJECT_ENDPOINT",
        "AZURE_AI_AGENT_NAME",
        "AZURE_AI_MODEL_DEPLOYMENT_NAME",
    ],
)
@pytest.mark.parametrize("value", [None, "", "   "])
def test_required_configuration_before_azure(setup_clients, monkeypatch, name, value):
    credential_factory, project_factory, _, _ = setup_clients
    if value is None:
        monkeypatch.delenv(name)
    else:
        monkeypatch.setenv(name, value)
    with pytest.raises(ValidationError):
        evaluations.main()
    credential_factory.assert_not_called()
    project_factory.assert_not_called()


@pytest.mark.parametrize("value", ["0", "-1", "1.5", "ten", ""])
def test_invalid_hourly_cap(setup_clients, monkeypatch, value):
    credential_factory, project_factory, _, _ = setup_clients
    monkeypatch.setenv("AZURE_AI_EVALUATION_MAX_HOURLY_RUNS", value)
    with pytest.raises(ValidationError):
        evaluations.main()
    credential_factory.assert_not_called()
    project_factory.assert_not_called()


@pytest.mark.parametrize("stage", ["registration", "evaluation", "rule"])
def test_sdk_failure_propagates(setup_clients, capsys, stage):
    _, _, project, client = setup_clients
    operations = [
        project.beta.evaluators.create_version,
        client.evals.create,
        project.evaluation_rules.create_or_update,
    ]
    failed_index = ["registration", "evaluation", "rule"].index(stage)
    failure = HttpResponseError("SDK failed")
    operations[failed_index].side_effect = failure
    with pytest.raises(HttpResponseError) as caught:
        evaluations.main()
    assert caught.value is failure
    for operation in operations[failed_index + 1 :]:
        operation.assert_not_called()
    assert "Rule ID:" not in capsys.readouterr().out
