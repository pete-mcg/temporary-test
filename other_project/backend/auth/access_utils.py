import logging
from backend.tables.users_repository import UsersRepository


async def is_user_allowed(puid: str, users_repo: UsersRepository) -> bool:
    user = await users_repo.get_user(puid)

    if user is None:
        logging.warning(f"PUID {puid} not found in users list")
        return False

    if user["role"] == "BLOCKED":
        logging.warning(f"PUID {puid} is Blocked")
        return False

    return True


async def is_user_admin(puid: str, users_repo: UsersRepository) -> bool:
    user = await users_repo.get_user(puid)

    return user is not None and user["role"] == "ADMIN"
