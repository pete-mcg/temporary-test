import os
from typing import Optional
from redis.asyncio import Redis
from contextlib import asynccontextmanager
import json
import logging
import asyncio
import base64
import binascii
import time

from backend.config import Config
from backend.auth.credential_helpers import create_sync_chained_credential

config = Config()

class RedisService:
    def __init__(self):
        managed_identity_id = os.getenv("AZURE_MANAGED_IDENTITY_ID")
        self.credential = create_sync_chained_credential(managed_identity_id)
        self.redis_client: Optional[Redis] = None
        self.token = None
        self.redis_username = os.getenv("REDIS_USERNAME") or os.getenv(
            "AZURE_REDIS_USERNAME"
        )

    async def init_redis(self):
        if not self.redis_client:
            await self.refresh_redis_token()
            result = await self.redis_client.ping()
            logging.debug("Redis status: " + str(result))

    async def refresh_redis_token(self):
        if self._need_refreshing():
            logging.debug("Refreshing redis token...")
            self.token = self.credential.get_token("https://redis.azure.com/.default")
            user_name = self.resolve_redis_username(self.token.token)
            self.redis_client = Redis(
                host=config.redis_host,
                port=config.redis_port,
                ssl=True,
                username=user_name,
                password=self.token.token,
                decode_responses=True,
            )
            asyncio.get_running_loop().call_later(
                60 * 60,
                lambda: asyncio.create_task(self.refresh_redis_token()),
            )

    def _need_refreshing(self, refresh_offset=300):
        return not self.token or self.token.expires_on - time.time() < refresh_offset

    def resolve_redis_username(self, token: str) -> str:
        if self.redis_username:
            return self.redis_username

        oid = self.extract_oid_from_jwt(token)
        if oid:
            return oid

        raise RuntimeError(
            "Unable to derive Redis username from access token. Set REDIS_USERNAME or AZURE_REDIS_USERNAME to the Entra object ID used for Redis auth."
        )

    def extract_oid_from_jwt(self, token: str) -> Optional[str]:
        try:
            parts = token.split(".")
            if len(parts) < 2:
                return None

            payload = parts[1]
            padded_payload = payload + ("=" * (-len(payload) % 4))
            json_bytes = base64.urlsafe_b64decode(padded_payload.encode("ascii"))
            claims = json.loads(json_bytes.decode("utf-8"))
            return claims.get("oid")
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError, binascii.Error):
            logging.debug("Failed to decode Redis access token payload for oid")
            return None

    async def get(self, key: str) -> Optional[str]:
        async with self.get_redis() as redis:
            return await redis.get(key)

    async def list_keys(self, pattern: str) -> Optional[str]:
        async with self.get_redis() as redis:
            return await redis.keys(pattern)

    async def flush(self):
        async with self.get_redis() as redis:
            await redis.flushall()

    @asynccontextmanager
    async def get_redis(self):
        await self.init_redis()
        try:
            yield self.redis_client
        finally:
            pass

    async def close(self):
        if self.redis_client:
            await self.redis_client.close()