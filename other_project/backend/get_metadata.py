import requests
from backend.azure_identity import get_sync_azure_credential
import json
import os
from dotenv import load_dotenv
import logging

# Get the directory of the current script and calculate path to .env file
script_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(script_dir, "..", ".env")
load_dotenv(dotenv_path)

# Get necessary environment variables
AZURE_SEARCH_INDEX_CORE = os.environ.get("AZURE_SEARCH_INDEX_CORE")
AZURE_SEARCH_SERVICE = os.environ.get("AZURE_SEARCH_SERVICE")


def get_metadata_from_search_index(case_ref):
    if not AZURE_SEARCH_INDEX_CORE or not AZURE_SEARCH_SERVICE:
        logging.error("One or more Azure Search environment variables are missing")
        return None

    # Where case_ref is not correct, return None. For example, no metadata available for guidance documents as no case_ref on search index
    if "/" not in case_ref:
        logging.error("Invalid case_ref format - metadata not available.")
        return None

    # Construct the search request URL
    url = f"https://{AZURE_SEARCH_SERVICE}.search.windows.net/indexes/{AZURE_SEARCH_INDEX_CORE}/docs/search?api-version=2021-04-30-Preview"

    credential = get_sync_azure_credential()
    token = credential.get_token("https://search.azure.com/.default").token

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
    }

    # Construct the filter query - note that single quotes are used to escape the case_ref value
    filter = f"case_ref eq '{case_ref}'"

    # Create the request body
    body = {
        "select": "latest_drafter, case_ref, date_received, reporting_team, member_of_parliament, internal_review",
        "count": True,
        "filter": filter,
    }

    try:
        response = requests.post(url, headers=headers, data=json.dumps(body))
        response.raise_for_status()  # Raise an HTTPError for bad responses (4xx and 5xx)
    except requests.exceptions.RequestException as e:
        logging.error(f"An error occurred retrieving metadata from search index: {e}")
        return {"error": str(e)}

    try:
        metadata_dict = response.json().get("value", [None])[0]
    except json.JSONDecodeError as e:
        logging.error(f"Error decoding JSON response: {e}")
        return {"error": "Error decoding JSON response"}

    # Format date_received to DD-MM-YYYY (originally in ISO format within blob)
    if metadata_dict and metadata_dict.get("date_received"):
        try:
            date_str = metadata_dict["date_received"].split("T")[0]
            year, month, day = date_str.split("-")
            metadata_dict["date_received"] = f"{day}-{month}-{year}"
        except Exception as e:
            logging.warning(f"Could not format date_received: {e}")

    return metadata_dict
