from typing import Optional
from azure.data.tables.aio import TableClient, TableServiceClient


class UsersRepository:
    table_client: TableClient

    def __init__(self, table_service_client: TableServiceClient):
        self.table_service_client = table_service_client
        self.table_client = self.table_service_client.get_table_client("users")

    async def get_users(self) -> dict:
        users = []

        async for entity in self.table_client.query_entities("PartitionKey eq 'users'"):
            users.append(entity)

        return users

    async def get_user(self, user_id: str) -> Optional[dict]:
        try:
            entity = await self.table_client.get_entity(
                "users", user_id.strip().lower()
            )
            return entity
        except Exception:
            return None

    async def update_role(self, user_id: str, role: str) -> None:
        entity = await self.table_client.get_entity("users", user_id.strip().lower())
        entity["role"] = role
        await self.table_client.update_entity(entity)

    async def user_exists(self, user_id: str) -> bool:
        try:
            await self.table_client.get_entity("users", user_id.strip().lower())
            return True
        except Exception:
            return False

    async def delete_user(self, user_id: str) -> None:
        await self.table_client.delete_entity("users", user_id.strip().lower())

    async def add_user(self, user_id: str, secretariat: str, role: str) -> None:
        entity = {
            "PartitionKey": "users",
            "RowKey": user_id.strip().lower(),
            "user_id": user_id.strip().lower(),
            "secretariat": secretariat.upper(),
            "role": role.strip().upper(),
        }
        await self.table_client.upsert_entity(entity=entity)

    def is_valid_role(self, role: str) -> bool:
        return role.strip().upper() in ["ADMIN", "NORMAL", "BLOCKED"]
