from datetime import datetime
from dateutil.relativedelta import relativedelta
from backend.annex.config import cosmos_client, config
from backend.annex.state import AnnexState
import logging


async def get_cosmos_data(state: AnnexState) -> dict:
    """
    Retrieve Cosmos DB data for the given MP.

    Args:
        state (AnnexState): The current state of the workflow, containing the MP name.

    Returns:
        dict: A dictionary containing the retrieved Cosmos DB data, mp_id, and mp_name_display, to be stored in the state for downstream nodes.
    """

    try:
        # Connect to Cosmos DB container.
        database = cosmos_client.get_database_client(
            config.AZURE_COSMOSDB_ANNEX_DATABASE
        )
        container = database.get_container_client(config.AZURE_COSMOSDB_ANNEX_CONTAINER)

        query = "SELECT * FROM c WHERE c.name_list = @name_list"
        parameters = [{"name": "@name_list", "value": state.mp_name_list}]

        items = [
            item
            async for item in container.query_items(query=query, parameters=parameters)
        ]

        # Grab all data, excluding Cosmos DB metadata fields from the payload
        exclude_keys = {"id", "_rid", "_self", "_etag", "_attachments", "_ts"}
        payload = {k: v for k, v in items[0].items() if k not in exclude_keys}
        logging.info("Cosmos record found for the MP.")

        # Filter visits to only include those from the last ANNEX_MONTHS_CUTOFF months
        if payload["visits"]:
            date_cutoff = datetime.now() - relativedelta(
                months=config.ANNEX_MONTHS_CUTOFF
            )
            filtered_visits = []

            for visit in payload["visits"]:
                try:
                    # Parse the end_date (or start_date as fallback)
                    date_str = visit.get("end_date") or visit.get("start_date")
                    if date_str:
                        visit_date = datetime.strptime(date_str, "%Y-%m-%d")
                        if visit_date >= date_cutoff:
                            filtered_visits.append(visit)
                except (ValueError, TypeError):
                    # Skip visits with invalid dates
                    continue

            payload["visits"] = filtered_visits
            logging.info(
                f"Filtered visits to {len(filtered_visits)} from last {config.ANNEX_MONTHS_CUTOFF} months"
            )

        mp_id = int(payload.get("member_id", 0))
        mp_name_display = payload.get("name_display", "")
        raw_error_messages = []
        public_error_messages = []
    except Exception as error:
        logging.error(f"No Cosmos record found for the MP: {error}")
        payload = {}
        mp_id = 0
        mp_name_display = ""
        raw_error_messages = [str(error)]
        public_error_messages = ["Error retrieving a record for the MP."]

    return {
        "cosmos_data": payload,
        "mp_id": mp_id,
        "mp_name_display": mp_name_display,
        "raw_error_messages": raw_error_messages,
        "public_error_messages": public_error_messages,
    }
