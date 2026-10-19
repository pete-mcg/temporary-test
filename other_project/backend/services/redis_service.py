from typing import Optional
from backend.azure_identity import get_sync_azure_credential
from redis.asyncio import Redis
from contextlib import asynccontextmanager
import json
import logging
import asyncio
import base64
import time

from backend.config import Config

config = Config()


class RedisService:
    def __init__(self):
        self.credential = get_sync_azure_credential()
        self.redis_client: Optional[Redis] = None
        self.token = None

    async def init_redis(self):
        if not self.redis_client:
            await self.refresh_redis_token()
            result = await self.redis_client.ping()
            logging.debug("Redis status: " + str(result))

    async def refresh_redis_token(self):
        if self._need_refreshing():
            logging.debug("Refreshing redis token...")
            self.token = self.credential.get_token("https://redis.azure.com/.default")
            user_name = self.extract_username_from_token(self.token.token)
            self.redis_client = Redis(
                host=config.redis_host,
                port=config.redis_port,
                ssl=True,
                username=user_name,
                password=self.token.token,
                decode_responses=True,
            )
            asyncio.get_event_loop().call_later(
                60 * 60, asyncio.create_task, await self.refresh_redis_token()
            )

    def _need_refreshing(self, refresh_offset=300):
        return not self.token or self.token.expires_on - time.time() < refresh_offset

    def extract_username_from_token(self, token):
        parts = token.split(".")
        base64_str = parts[1]

        if len(base64_str) % 4 == 2:
            base64_str += "=="
        elif len(base64_str) % 4 == 3:
            base64_str += "="

        json_bytes = base64.b64decode(base64_str)
        json_str = json_bytes.decode("utf-8")
        jwt = json.loads(json_str)

        return jwt["oid"]

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
