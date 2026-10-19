import os
import csv
import sys
from azure.data.tables import TableServiceClient
from azure.identity import AzureCliCredential
from dotenv import load_dotenv

load_dotenv()

if len(sys.argv) < 2:
    print("Error: Missing .csv file path")
    print(
        "Example Usage: python scripts/migrations/002_add_users.py scripts/migrations/PUID_list.csv"
    )
    sys.exit(1)

AZURE_STORAGE_ACCOUNT_NAME = os.environ.get("AZURE_STORAGE_ACCOUNT_NAME")

credential = AzureCliCredential()
table_service_client = TableServiceClient(
    endpoint=f"https://{AZURE_STORAGE_ACCOUNT_NAME}.table.core.windows.net",
    credential=credential,
)
TABLE_NAME = "users"
table_client = table_service_client.get_table_client(TABLE_NAME)


def add_user_to_table(puid: str, is_admin: bool, secretariat: str):
    entity = {
        "PartitionKey": "users",
        "RowKey": puid.strip().lower(),
        "role": "ADMIN" if is_admin else "NORMAL",  # BLOCKED, NORMAL, ADMIN
        "user_id": puid.strip().lower(),
        "secretariat": secretariat.upper(),
    }

    table_client.upsert_entity(mode="replace", entity=entity)


def csv_column_to_dict_list(file_path):
    puids = []

    with open(file_path, mode="r", newline="") as file:
        csv_reader = csv.reader(file)

        next(csv_reader)  # Skip the header row i.e Secretariat, PUID, Is Super user

        for row in csv_reader:
            puids.append(
                {"secretariat": row[0], "puid": row[1], "admin": row[2] == "Yes"}
            )

    return puids


if __name__ == "__main__":
    file_path = sys.argv[1]
    puids_list = csv_column_to_dict_list(file_path)

    if len(puids_list) == 0:
        print("Error: No PUIDs found in the file")
        sys.exit(1)

    for puid in puids_list:
        if puid["puid"].strip() == "":
            print("Skipping empty PUID")
            continue  # Skip if PUID is empty

        add_user_to_table(puid["puid"], puid["admin"], puid["secretariat"])

        print(f"User {puid['puid']} added successfully.")

    print("Users added successfully.")
