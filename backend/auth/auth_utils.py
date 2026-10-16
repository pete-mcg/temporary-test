import base64
import secrets
import hashlib

from backend.config import Config
from backend.session.session_manager import SessionManager

config = Config()
session_manager = SessionManager()
DEFAULT_USER_ID = -1

async def get_puid():
    if not config.auth_enabled:
        return  DEFAULT_USER_ID

    puid = await session_manager.get_user_puid()

    return puid

def generate_code_verifier():
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode("utf-8")

def generate_code_challenge(verifier):
    challenge = hashlib.sha256(verifier.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(challenge).rstrip(b"=").decode("utf-8")