import hmac
import re
from typing import Awaitable, Callable

from fastapi.responses import JSONResponse

from app.config import get_settings
from app.models.database import reset_tenant_context, set_tenant_context


TENANT_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


class RuntimeSecurityMiddleware:
    """Restrict the migrated runtime to authenticated control-plane calls."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        if path == "/health":
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        settings = get_settings()
        expected = settings.runtime_control_token
        if not expected:
            await self._reject(scope, receive, send, 503, "Sales knowledge runtime control token is not configured")
            return
        provided = headers.get("x-runtime-token", "")
        if not hmac.compare_digest(provided, expected):
            await self._reject(scope, receive, send, 401, "Sales knowledge runtime call is unauthorized")
            return

        tenant_id = headers.get("x-tenant-id", "")
        if not TENANT_PATTERN.fullmatch(tenant_id):
            await self._reject(scope, receive, send, 400, "A valid tenant context is required")
            return

        context_token = set_tenant_context(tenant_id)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_tenant_context(context_token)

    async def _reject(self, scope, receive, send, status_code: int, detail: str):
        response = JSONResponse(status_code=status_code, content={"detail": detail})
        await response(scope, receive, send)
