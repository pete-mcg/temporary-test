from quart import session

class SessionManager:
    async def accept_term(self):
        session['accepted_terms'] = True

    async def has_accepted_terms(self) -> bool:
        return session.get('accepted_terms', False)

    async def set_code_verifier(self, code_verifier: str):
        session['code_verifier'] = code_verifier

    async def get_code_verifier(self) -> str:
        return session.get('code_verifier', None)

    async def set_access_token(self, access_token: str):
        session['access_token'] = access_token

    async def get_access_token(self) -> str:
        return session.get('access_token', None)

    async def set_user_info(self, user_info: dict):
        session['user_info'] = user_info

    async def get_user_info(self) -> dict:
        return session.get('user_info', None)

    async def get_user_puid(self) -> str:
        user_info = await self.get_user_info()
        return user_info.get('name', None) if user_info else None