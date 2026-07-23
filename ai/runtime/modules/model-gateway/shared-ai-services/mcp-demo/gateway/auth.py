"""
项目级 API Key 认证中间件。

从请求头 X-API-Key 读取密钥，匹配 config.yaml 中的 projects 配置。
认证成功后将 project_id 写入 request.state.project_id 供下游使用。
"""

import hmac
import logging
import re

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("gateway.auth")

SKIP_PATHS = {"/api/health", "/docs", "/openapi.json", "/redoc"}
IDENTITY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")


class AuthMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, projects: dict, control_token: str = ""):
        super().__init__(app)
        self._control_token = control_token
        self._key_to_project = {
            cfg["api_key"]: project_id
            for project_id, cfg in projects.items()
            if cfg.get("api_key")
        }

    async def dispatch(self, request: Request, call_next):
        if request.url.path in SKIP_PATHS:
            request.state.project_id = "__anonymous__"
            request.state.subject_id = "__anonymous__"
            request.state.trusted_runtime = False
            return await call_next(request)

        runtime_token = request.headers.get("X-Runtime-Token", "")
        if self._control_token and hmac.compare_digest(runtime_token, self._control_token):
            project_id = request.headers.get("X-Tenant-Id", "").strip()
            subject_id = request.headers.get("X-Subject-Id", "").strip()
            if not IDENTITY_PATTERN.fullmatch(project_id) or not IDENTITY_PATTERN.fullmatch(subject_id):
                return JSONResponse(
                    status_code=400,
                    content={"error": "可信运行时身份头无效"},
                )
            request.state.project_id = project_id
            request.state.subject_id = subject_id
            request.state.trusted_runtime = True
            logger.info(
                "[%s] 控制面认证通过: tenant=%s subject=%s",
                getattr(request.state, "trace_id", "?"),
                project_id,
                subject_id,
            )
            return await call_next(request)

        api_key = request.headers.get("X-API-Key", "")
        project_id = self._key_to_project.get(api_key)

        if not project_id:
            trace_id = getattr(request.state, "trace_id", "?")
            logger.warning("[%s] 认证失败: 无效的 API Key", trace_id)
            return JSONResponse(
                status_code=401,
                content={"error": "无效的 API Key", "hint": "请在请求头中设置 X-API-Key"},
            )

        request.state.project_id = project_id
        request.state.subject_id = project_id
        request.state.trusted_runtime = False
        logger.info(
            "[%s] 认证通过: project=%s",
            getattr(request.state, "trace_id", "?"),
            project_id,
        )
        return await call_next(request)
