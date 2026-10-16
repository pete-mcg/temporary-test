import os
from dotenv import load_dotenv
from azure.storage.blob import BlobServiceClient
from azure.core.exceptions import ResourceNotFoundError
from lib.credential_helpers import create_sync_chained_credential

# Get the directory of the current script and calculate path to .env file
script_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(script_dir, "..", ".env")
load_dotenv(dotenv_path)

# Get environment variables
blob_account_name = os.environ.get("AZURE_STORAGE_ACCOUNT_NAME")
user_managed_credential = os.environ.get("AZURE_MANAGED_IDENTITY_ID")
tag_key_fields = os.environ.get("TAG_FIELDS")
if tag_key_fields is not None:
    tag_keys = [key.strip() for key in tag_key_fields.split(",")]
else:
    tag_keys = []

# Initialize the connection to Azure Blob Storage
credential = create_sync_chained_credential(user_managed_credential)
blob_service_client = BlobServiceClient(
    account_url=f"https://{blob_account_name}.blob.core.windows.net",
    credential=credential,
)

# List all containers
containers = blob_service_client.list_containers()

shared_container_name = "documents"

expected_blob_names = (
    set()
)  # Track names of blobs that should exist in the shared container

for container in containers:
    container_name = container["name"]
    if container_name.startswith("documents-"):
        tags = container_name.split("-")[1:]
        container_client = blob_service_client.get_container_client(container_name)
        blobs = container_client.list_blobs()

        for blob in blobs:
            expected_blob_names.add(blob.name)  # Add blob name to the expected set
            blob_client = container_client.get_blob_client(blob)
            shared_blob_client = blob_service_client.get_blob_client(
                container=shared_container_name, blob=blob.name
            )
            try:
                shared_blob_properties = shared_blob_client.get_blob_properties()
                print(
                    f"{blob.name} already exists in {shared_container_name}. Skipping..."
                )
                continue  # Skip to the next blob if it already exists
            except ResourceNotFoundError:
                # Blob does not exist in the shared container, proceed with copying
                pass

            try:
                # Get blob properties
                blob_properties = blob_client.get_blob_properties()
                metadata = blob_properties.metadata

                # Add new tags to metadata
                for i in range(min(len(tag_keys), len(tags))):
                    key = tag_keys[i]
                    tag = tags[i]
                    metadata[key] = tag

                # Set the updated metadata on the original blob
                blob_client.set_blob_metadata(metadata)
                print(
                    f"Updated metadata for {blob.name} in {container_name} to {metadata}"
                )

                # Copy the blob to the shared container "documents"
                shared_blob_client.start_copy_from_url(blob_client.url)

                # Ensure the copy operation is complete
                copy_status = shared_blob_client.get_blob_properties().copy.status
                while copy_status == "pending":
                    copy_status = shared_blob_client.get_blob_properties().copy.status

                # Set the metadata for the copied blob in the shared container
                shared_blob_client.set_blob_metadata(metadata)
                print(
                    f"Copied {blob.name} to {shared_container_name} with metadata {metadata}"
                )

            except Exception as e:
                print(f"An error occurred: {str(e)}")

# Remove blobs from the shared container that are not present in the source containers
shared_container_client = blob_service_client.get_container_client(
    shared_container_name
)

shared_blobs = shared_container_client.list_blobs()

for shared_blob in shared_blobs:
    if shared_blob.name not in expected_blob_names:
        try:
            shared_container_client.delete_blob(shared_blob.name)
            print(
                f"Deleted {shared_blob.name} from {shared_container_name} as it's no longer needed."
            )
        except Exception as e:
            print(
                f"Failed to delete {shared_blob.name} from {shared_container_name}: {str(e)}"
            )
