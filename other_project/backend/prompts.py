import os
import logging
from enum import Enum


def load_prompt_from_file(filename):
    """Load system message prompt from markdown file."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(script_dir, "prompts", filename)

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        logging.error(f"Error reading prompt file {filename}: {e}")
        return None


# Load system messages from markdown files
prompt_related_response = load_prompt_from_file("system_message_response.md")
prompt_policy_and_guidance = load_prompt_from_file("system_message_policy.md")
prompt_evaluate_draft = load_prompt_from_file("system_message_draft.md")
prompt_ask_anything = load_prompt_from_file("system_message_anything.md")

# Load additional text for each mode
additional_text_related_response = load_prompt_from_file("additional_text_response.md")
additional_text_policy_and_guidance = ""  # Blank, can be filled in later if needed
additional_text_evaluate_draft = load_prompt_from_file("additional_text_draft.md")
additional_text_ask_anything = ""  # Blank, can be filled in later if needed


class Mode(Enum):
    RELATED_RESPONSES = "related_responses"
    POLICY_AND_GUIDANCE = "policy_and_guidance"
    EVALUATE_DRAFT = "evaluate_draft"
    ASK_ANYTHING = "ask_anything"
    METADATA_SEARCH = "metadata_search"


prompt_map = {
    Mode.RELATED_RESPONSES: prompt_related_response,
    Mode.POLICY_AND_GUIDANCE: prompt_policy_and_guidance,
    Mode.EVALUATE_DRAFT: prompt_evaluate_draft,
    Mode.ASK_ANYTHING: prompt_ask_anything,
    Mode.METADATA_SEARCH: None,  # This mode uses the search_metadata endpoint, not conversation API
}


def get_system_message_from_mode(mode):
    try:
        mapped_prompt = prompt_map[Mode(mode)]

        if mapped_prompt:
            return mapped_prompt

    except KeyError:
        logging.error(f"Invalid mode: {mode}")
        return "Invalid mode"
