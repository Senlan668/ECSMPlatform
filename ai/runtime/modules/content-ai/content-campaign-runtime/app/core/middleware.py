"""
FastAPI 中间件模块
提供请求日志记录、request_id 注入等功能
"""
import time
import uuid
import json
import secrets
import base64
import binascii
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.core.logger import (
    app_logger,
    set_request_id,
    clear_request_id,
    get_request_id,
)
from app.core.config import settings
from app.core.limits import MAX_REQUEST_BODY_BYTES
from app.core.runtime_context import (
    RuntimeIdentity,
    reset_runtime_identity,
    set_runtime_identity,
)


class RuntimeSecurityMiddleware:
    """Accept requests only from the authenticated Java control plane."""

    PUBLIC_PATHS = {"/health"}

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("path") in self.PUBLIC_PATHS:
            await self.app(scope, receive, send)
            return

        headers = {
            key.decode("latin-1").lower(): value.decode("latin-1")
            for key, value in scope.get("headers", [])
        }
        if not settings.runtime_control_token:
            await self._send_error(send, 503, "RUNTIME_NOT_CONFIGURED", "运行时控制令牌未配置")
            return

        supplied_token = headers.get("x-runtime-token", "")
        if not secrets.compare_digest(supplied_token, settings.runtime_control_token):
            await self._send_error(send, 401, "RUNTIME_AUTHENTICATION_REQUIRED", "运行时认证失败")
            return

        content_length = headers.get("content-length")
        if content_length:
            try:
                if int(content_length) < 0:
                    raise ValueError
                if int(content_length) > MAX_REQUEST_BODY_BYTES:
                    await self._send_error(send, 413, "REQUEST_TOO_LARGE", "请求体超过 32 MB 限制")
                    return
            except ValueError:
                await self._send_error(send, 400, "INVALID_CONTENT_LENGTH", "Content-Length 无效")
                return

        tenant_id = self._trusted_header(headers, "x-tenant-id", 128)
        subject_id = self._trusted_header(headers, "x-subject-id", 256)
        subject_username = self._trusted_header(headers, "x-subject-username", 128)
        subject_name = self._trusted_header(headers, "x-subject-name", 512)
        if subject_name is not None and headers.get("x-subject-name-encoding") == "base64url":
            try:
                padding = "=" * (-len(subject_name) % 4)
                subject_name = base64.urlsafe_b64decode(subject_name + padding).decode("utf-8").strip()
            except (ValueError, UnicodeDecodeError, binascii.Error):
                subject_name = None
            if not subject_name or len(subject_name) > 256:
                subject_name = None
        if tenant_id is None or subject_id is None or subject_username is None or subject_name is None:
            await self._send_error(send, 400, "INVALID_RUNTIME_CONTEXT", "租户或用户上下文无效")
            return

        buffered_messages = await self._buffer_request(receive)
        if buffered_messages is None:
            await self._send_error(send, 413, "REQUEST_TOO_LARGE", "请求体超过 32 MB 限制")
            return
        message_index = 0

        async def replay_receive():
            nonlocal message_index
            if message_index < len(buffered_messages):
                message = buffered_messages[message_index]
                message_index += 1
                return message
            return {"type": "http.disconnect"}

        identity_token = set_runtime_identity(RuntimeIdentity(
            tenant_id=tenant_id,
            subject_id=subject_id,
            subject_name=subject_name,
            subject_username=subject_username,
        ))
        try:
            from app.core.db import ensure_tenant_database

            await ensure_tenant_database()
            await self.app(scope, replay_receive, send)
        finally:
            reset_runtime_identity(identity_token)

    def _trusted_header(self, headers: dict[str, str], name: str, max_length: int) -> str | None:
        value = headers.get(name, "").strip()
        if not value or len(value) > max_length:
            return None
        if any(ord(character) < 32 or ord(character) == 127 for character in value):
            return None
        return value

    async def _buffer_request(self, receive) -> list[dict] | None:
        messages = []
        body_bytes = 0
        while True:
            message = await receive()
            messages.append(message)
            if message.get("type") != "http.request":
                break
            body_bytes += len(message.get("body", b""))
            if body_bytes > MAX_REQUEST_BODY_BYTES:
                return None
            if not message.get("more_body", False):
                break
        return messages

    async def _send_error(self, send, status_code: int, code: str, detail: str) -> None:
        body = json.dumps({"code": code, "detail": detail}, ensure_ascii=False).encode("utf-8")
        await send({
            "type": "http.response.start",
            "status": status_code,
            "headers": [
                (b"content-type", b"application/json; charset=utf-8"),
                (b"content-length", str(len(body)).encode("ascii")),
            ],
        })
        await send({"type": "http.response.body", "body": body})


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    请求日志中间件
    
    功能：
    1. 为每个请求生成唯一的 request_id
    2. 记录请求开始和结束
    3. 计算请求耗时
    4. 记录异常
    """
    
    # 不记录日志的路径（健康检查等）
    SKIP_PATHS = {"/health", "/", "/docs", "/openapi.json", "/redoc", "/favicon.ico"}
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 跳过不需要记录的路径
        if request.url.path in self.SKIP_PATHS:
            return await call_next(request)
        
        # 生成 request_id（优先使用请求头中的，便于链路追踪）
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])
        set_request_id(request_id)
        
        # 获取客户端 IP
        client_ip = self._get_client_ip(request)
        
        # 记录请求开始
        start_time = time.perf_counter()
        app_logger.request_started(
            method=request.method,
            path=request.url.path,
            client_ip=client_ip,
            query_params=str(request.query_params) if request.query_params else None,
        )
        
        # 处理请求
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            
            # 添加 request_id 到响应头（便于客户端追踪）
            response.headers["X-Request-ID"] = request_id
            
            return response
            
        except Exception as e:
            # 记录异常
            app_logger.request_error(
                method=request.method,
                path=request.url.path,
                error=str(e),
                status_code=500,
            )
            raise
            
        finally:
            # 计算耗时并记录请求完成
            duration_ms = (time.perf_counter() - start_time) * 1000
            app_logger.request_finished(
                method=request.method,
                path=request.url.path,
                status_code=status_code,
                duration_ms=duration_ms,
            )
            # 清除 request_id
            clear_request_id()
    
    def _get_client_ip(self, request: Request) -> str:
        """获取客户端真实 IP"""
        # 优先从代理头获取
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # 直接连接的客户端
        if request.client:
            return request.client.host
        
        return "unknown"


class LangSmithTracingMiddleware(BaseHTTPMiddleware):
    """
    LangSmith 链路追踪中间件
    
    将 request_id 传递给 LangSmith，实现日志与 LLM 追踪的关联
    
    使用方式：在 LLM 调用时，可以通过 langsmith.traceable 装饰器的 
    metadata 参数传递 request_id
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 将 request_id 存储到 request.state，供后续使用
        request.state.request_id = get_request_id()
        
        # 可以在这里设置 LangSmith 的 run 名称或 metadata
        # 通过环境变量或 contextvars 传递给 LangChain
        
        response = await call_next(request)
        return response
