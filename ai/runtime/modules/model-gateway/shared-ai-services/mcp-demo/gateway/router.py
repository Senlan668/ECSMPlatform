"""
HTTP 路由 — 将 REST 请求转发到 MCP 共享服务。

端点：
  POST /api/tool/call     — 调用 MCP Tool
  POST /api/prompt/get    — 获取渲染后的 MCP Prompt
  GET  /api/prompt/list   — 列出可用 Prompt
  GET  /api/tool/list     — 列出可用 Tool
  GET  /api/health        — 健康检查（无需认证）
  GET  /api/quota/usage   — 查看当前项目的配额使用情况
"""

import logging
import re
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .mcp_client_manager import MCPCallError
from .scope import scoped_tool_arguments

logger = logging.getLogger("gateway.router")

router = APIRouter(prefix="/api")


# ── 请求体模型 ──────────────────────────────────────────


NAME_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$")
class ToolCallRequest(BaseModel):
    service: str = Field(min_length=1, max_length=100, pattern=NAME_PATTERN.pattern)
    tool: str = Field(min_length=1, max_length=100, pattern=NAME_PATTERN.pattern)
    arguments: dict = Field(default_factory=dict)


class PromptGetRequest(BaseModel):
    service: str = Field(min_length=1, max_length=100, pattern=NAME_PATTERN.pattern)
    prompt: str = Field(min_length=1, max_length=100, pattern=NAME_PATTERN.pattern)
    arguments: dict = Field(default_factory=dict)


class AgentChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20_000)
    session_id: str | None = Field(default=None, max_length=128)
    style: Literal["正式", "轻松", "学术", "幽默"] = "正式"


class AgentSessionRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)


# ── Tool 端点 ───────────────────────────────────────────


@router.post("/tool/call")
async def call_tool(request: Request, body: ToolCallRequest):
    """调用指定 MCP 服务的 Tool。"""
    trace_id = getattr(request.state, "trace_id", "?")
    project_id = getattr(request.state, "project_id", "?")
    mcp = request.app.state.mcp

    logger.info(
        "[%s] tool/call | project=%s service=%s tool=%s",
        trace_id, project_id, body.service, body.tool,
    )

    try:
        arguments = scoped_tool_arguments(project_id, body.tool, body.arguments)
        result = await mcp.call_tool(body.service, body.tool, arguments)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e), "trace_id": trace_id})
    except MCPCallError as e:
        return JSONResponse(status_code=502, content={"error": str(e), "trace_id": trace_id})
    except BaseException as e:
        real = e.exceptions[0] if hasattr(e, "exceptions") else e
        logger.error("[%s] MCP 调用异常: %s", trace_id, real)
        return JSONResponse(status_code=502, content={
            "error": f"MCP 服务调用失败: {real}",
            "hint": f"请确认 {body.service} 服务已启动",
            "trace_id": trace_id,
        })

    if body.tool == "chat_completion" and isinstance(result, dict) and "usage" in result:
        total_tokens = result["usage"].get("total_tokens", 0)
        if total_tokens > 0:
            request.app.state.quota.add(project_id, total_tokens)

    return result


@router.post("/tool/list")
async def list_tools_for_service(request: Request, body: dict):
    """列出指定 MCP 服务的所有 Tool。"""
    service = str(body.get("service", ""))
    if not NAME_PATTERN.fullmatch(service):
        return JSONResponse(status_code=400, content={"error": "service 无效"})
    mcp = request.app.state.mcp
    trace_id = getattr(request.state, "trace_id", "?")

    try:
        return await mcp.list_tools(service)
    except MCPCallError as e:
        return JSONResponse(status_code=502, content={"error": str(e), "trace_id": trace_id})
    except Exception as e:
        return JSONResponse(status_code=502, content={
            "error": f"MCP 服务调用失败: {e}",
            "hint": f"请确认 {service} 服务已启动",
            "trace_id": trace_id,
        })


# ── Prompt 端点 ─────────────────────────────────────────


@router.post("/prompt/get")
async def get_prompt(request: Request, body: PromptGetRequest):
    """获取渲染后的 MCP Prompt（填入参数后的完整提示词）。"""
    trace_id = getattr(request.state, "trace_id", "?")
    mcp = request.app.state.mcp

    logger.info(
        "[%s] prompt/get | service=%s prompt=%s",
        trace_id, body.service, body.prompt,
    )

    try:
        return await mcp.get_prompt(body.service, body.prompt, body.arguments)
    except MCPCallError as e:
        return JSONResponse(status_code=502, content={"error": str(e), "trace_id": trace_id})
    except Exception as e:
        logger.exception("[%s] MCP 调用异常", trace_id)
        return JSONResponse(status_code=502, content={
            "error": f"MCP 服务调用失败: {e}",
            "hint": f"请确认 {body.service} 服务已启动",
            "trace_id": trace_id,
        })


@router.get("/prompt/list")
async def list_prompts(request: Request, service: str = "prompt-hub"):
    """列出指定服务的所有可用 Prompt。"""
    if not NAME_PATTERN.fullmatch(service):
        return JSONResponse(status_code=400, content={"error": "service 无效"})
    mcp = request.app.state.mcp
    trace_id = getattr(request.state, "trace_id", "?")

    try:
        return await mcp.list_prompts(service)
    except MCPCallError as e:
        return JSONResponse(status_code=502, content={"error": str(e), "trace_id": trace_id})
    except Exception as e:
        return JSONResponse(status_code=502, content={
            "error": f"MCP 服务调用失败: {e}",
            "hint": f"请确认 {service} 服务已启动",
            "trace_id": trace_id,
        })


# ── 治理端点 ────────────────────────────────────────────


@router.get("/health")
async def health(request: Request):
    """健康检查 + 各服务连通性检测。"""
    mcp = request.app.state.mcp
    services = {}
    for name in mcp.service_names:
        services[name] = await mcp.check_health(name)
    all_ok = all(s["status"] == "ok" for s in services.values())
    return {"status": "ok" if all_ok else "degraded", "services": services}


@router.get("/quota/usage")
async def quota_usage(request: Request):
    """查看当前项目的 Token 配额使用情况。"""
    project_id = getattr(request.state, "project_id", None)
    if not project_id or project_id == "__anonymous__":
        return JSONResponse(status_code=401, content={"error": "需要认证"})
    return request.app.state.quota.get_usage(project_id)


# ── 原项目 Agent 端到端编排 ───────────────────────────


@router.post("/agents/{agent}/chat")
async def agent_chat(agent: str, request: Request, body: AgentChatRequest):
    try:
        return await request.app.state.agents.chat(
            tenant_id=request.state.project_id,
            subject_id=request.state.subject_id,
            agent=agent,
            message=body.message,
            session_id=body.session_id,
            style=body.style,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except BaseException as error:
        real = error.exceptions[0] if hasattr(error, "exceptions") else error
        logger.error("Agent 工作流调用失败: %s", real)
        raise HTTPException(status_code=502, detail=f"Agent 工作流调用失败: {str(real)[:300]}") from real


@router.post("/agents/{agent}/clear")
async def clear_agent_session(agent: str, request: Request, body: AgentSessionRequest):
    try:
        return await request.app.state.agents.clear(
            tenant_id=request.state.project_id,
            subject_id=request.state.subject_id,
            agent=agent,
            session_id=body.session_id,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except BaseException as error:
        real = error.exceptions[0] if hasattr(error, "exceptions") else error
        raise HTTPException(status_code=502, detail=f"Agent 会话清理失败: {str(real)[:300]}") from real


@router.post("/agents/{agent}/profile")
async def get_agent_profile(agent: str, request: Request):
    try:
        return await request.app.state.agents.profile(
            tenant_id=request.state.project_id,
            subject_id=request.state.subject_id,
            agent=agent,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except BaseException as error:
        real = error.exceptions[0] if hasattr(error, "exceptions") else error
        raise HTTPException(status_code=502, detail=f"用户画像读取失败: {str(real)[:300]}") from real
