# Custom Indexer

This code sets up and runs a custom Azure Cognitive Search indexer. It includes creating the search index, data source, skillset, and indexer, using environment variables for configuration.

## Setup

Install the necessary packages: 
```sh
- pip install azure-core==1.29.7
- pip install azure-search-documents==11.4.0b11
```

## Configure

Congfigure the below varables in the .env file - you will need to include: 

- AZURE_SEARCH_INDEX_CREATE: The name of the search index you will create.
- AZURE_BLOB_CONNECTION_STRING: Connection string in the format:
    "ResourceId=/subscriptions/Subscription ID/resourceGroups/Resource Group Name/providers/Microsoft.Storage/storageAccounts/Storage Account Name;"
- AZURE_BLOB_ACCOUNT_URL: Blob storage account URL in the format:
    https://Storage Account Name.blob.core.windows.net
- MAX_CHUNK_LENGTH: Chunk size in characters, typically 5000.
- CHUNK_OVERLAP: Chunk overlap in characters, typically 500.

Existing environmental variables used: 

- AZURE_MANAGED_IDENTITY_ID
- AZURE_SEARCH_SERVICE
- AZURE_OPENAI_ENDPOINT
- AZURE_OPENAI_EMBEDDING_NAME
- AZURE_BLOB_CONTAINER_NAME

## Customise with metdata tags (OPTIONAL)

Run the metadata_adder.py file to add custom metadata tags to documents which can be used for document filtering.

The script connects to Azure Blob Storage and moves documents from folders named "documents-TAGNAME" to a shared container named "documents", updating metadata with tags "TAGNAME" derived from the container. The code looks at all containers in the account and processes those which begin with "documents-". 

The resulting index will have a field "KEYNAME" with the value "TAGNAME". 

### Configure for metadata tagging 

Congfigure the below varables in the .env file - you will need to include: 

- TAG_FIELDS: Add metadata tag key field/s - these should correspond to the tags which are taken from the blob storage container name. The keyname should be the category, for example, "doctype" or "location". 

For multiple metadata tags, use the following structure:
- The blob storage container will be named as follows: documents-TAGNAME1-TAGNAME2-TAGNAME3
- The environment variable wil be as follows: TAG_FIELDS = KEYNAME1, KEYNAME2, KEYNAME3 

