from quart import jsonify, redirect, request, url_for
import logging
from aioauth_client import OAuth2Client
from backend.auth.auth_utils import (
    generate_code_verifier,
    generate_code_challenge
)
from backend.config import Config
from backend.session.session_manager import SessionManager
import httpx

config = Config()
session_manager = SessionManager()

code_verifier = generate_code_verifier()

async def login_auth(shouldRedirect: bool):
    logging.debug("Login request received")
    await session_manager.set_code_verifier(code_verifier)

    code_challenge = generate_code_challenge(code_verifier)
    if not code_challenge:
        logging.error("Login - Failed to generate code challenge")
        return

    logging.debug(f"Login - Using code verifier: {code_verifier}")

    authorization_url = oauth_client.get_authorize_url(code_challenge=code_challenge, code_challenge_method="S256")
    logging.debug(f"Login - Received Authorization URL: {authorization_url}")

    if not authorization_url:
        logging.error("Login - Failed to get auth URL from identity server")
        return jsonify({"success": False, "error": "Failed to get auth URL from identity server"}), 500

    if shouldRedirect:
        return redirect(authorization_url)

    return jsonify({"success": True, "url": authorization_url}), 200

async def login_callback(shouldRedirect: bool):
    logging.debug(f"Login callback request received")

    if oauth_client is None:
        logging.error("OAuth client not initialized")
        return jsonify({"success": False, "error": "OAuth client not initialized"}), 500

    code = request.args.get("code")
    code_verifier = await session_manager.get_code_verifier()

    token_url = oauth_client.access_token_url
    logging.debug(f"Callback - Token URL: {token_url}")
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": code_verifier,
        "redirect_uri": config.auth_redirect_uri,
        "client_id": config.auth_client_id,
        "client_secret": config.auth_client_secret,
        "scope": config.auth_scope,
    }

    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    logging.debug(f"callback - calling token url with code verifier: {code_verifier}")
    try:
        httpx_client = httpx.AsyncClient(
            verify=(False if not config.auth_verify_ssl else config.auth_verify_ssl)
        )
        response = await httpx_client.post(token_url, data=data, headers=headers)
        response.raise_for_status()

        # Response is a dict { "access_token": "token", "id_token": "idtoken", "token_type": "bearer", "expires_in": 3600, "scope": "openid profile dx4dllm_api" }
        token = response.json() 

        if "access_token" not in token:
            logging.error("Callback - Access token not found in response")
            return jsonify({"success": False, "error": "Access token not found in response"}), 500

        await session_manager.set_access_token(token["access_token"])

        # Response is a dict { "sub": "uuid", "email": "email", "name": "name", "fullDisplayName": "full name" }
        # name is the puid, sub is user id
        user_info_response = await httpx_client.get(
            f"{config.auth_host}/connect/userinfo",
            headers={"Authorization": f"Bearer {token['access_token']}"},
        )
        logging.debug(user_info_response)
        user_info_response.raise_for_status()
        logging.debug("Callback - Received userinfo: %s", user_info_response.json())
        await session_manager.set_user_info(user_info_response.json())

        await httpx_client.aclose()

        if shouldRedirect:
            return redirect(url_for("routes.index"))

        return jsonify({"success": True}), 200
    except Exception as e:
        logging.exception(f"Exception in /auth/callback: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

async def logout_auth():
    logging.debug(f"Logout request received")
    await session_manager.set_access_token(None)
    await session_manager.set_user_info(None)

    return jsonify({"success": True}), 200

async def check_auth():
    logging.debug(f"Check auth request received")

    access_token = await session_manager.get_access_token()
    if not access_token:
        logging.debug("Checking auth - Access token not found")
        return False

    try:
        httpx_client = httpx.AsyncClient(
            verify=(False if not config.auth_verify_ssl else config.auth_verify_ssl)
        )
        introspect_response = await httpx_client.post(
            f"{config.auth_host}/connect/introspect",
            data={
                "token": access_token,
                "client_id": config.auth_client_id,
                "client_secret": config.auth_client_secret,
            },
        )
        introspect_response.raise_for_status()

        # Response is a dict { "active": true, "name": "puidhere", "fullDisplayName": "User name", "email": "test@mod.gov.uk", "scope": "...", "client_id": "...", "sub": "uuid", "exp": 1617024000, "iat": 1617020400, "iss": "https://identityserver", "jti": "uuid" }
        introspect_data = introspect_response.json()
        logging.debug("Checking auth -  response: %s", introspect_data)

        if not introspect_data.get("active"):
            logging.debug("Checking auth - Unauthenticated token")
            return False

    except Exception as e:
        logging.exception(f"Exception while checking auth: {e}")
        return False
    finally:
        await httpx_client.aclose()

    return True

oauth_client = OAuth2Client(
    authorize_url=f"{config.auth_host}/connect/authorize",
    client_id=config.auth_client_id,
    client_secret=config.auth_client_secret,
    access_token_url=f"{config.auth_host}/connect/token",
    redirect_uri=config.auth_redirect_uri,
    scope=config.auth_scope,
)