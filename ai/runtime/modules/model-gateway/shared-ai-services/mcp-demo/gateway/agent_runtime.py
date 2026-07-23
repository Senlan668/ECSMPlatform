from __future__ import annotations

import hashlib
import re
import uuid
from typing import Any

from projects.customer_service.agent import CustomerServiceAgent
from projects.writing_assistant.agent import WritingAssistantAgent

from .scope import scoped_tool_arguments


SESSION_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
AGENTS = {"customer-service", "writing-assistant"}
WRITING_STYLES = {"正式", "轻松", "学术", "幽默"}


class DirectGatewayClient:
    """Expose the original Agent gateway contract without an HTTP loopback."""

    def __init__(self, mcp, quota, tenant_id: str, workflow: str):
        tenant_hash = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()[:24]
        self._scope_id = f"tenant-{tenant_hash}-{workflow}"
        self._tenant_id = tenant_id
        self._mcp = mcp
        self._quota = quota

    async def call_tool(self, service: str, tool: str, arguments: dict | None = None) -> Any:
        scoped = scoped_tool_arguments(self._scope_id, tool, arguments or {})
        result = await self._mcp.call_tool(service, tool, scoped)
        if tool == "chat_completion" and isinstance(result, dict):
            tokens = int(result.get("usage", {}).get("total_tokens", 0) or 0)
            self._quota.add(self._tenant_id, tokens)
        return result

    async def get_prompt(self, service: str, prompt: str, arguments: dict | None = None) -> dict:
        return await self._mcp.get_prompt(service, prompt, arguments or {})


class AgentRuntime:
    def __init__(self, mcp, quota):
        self._mcp = mcp
        self._quota = quota

    async def chat(
        self,
        *,
        tenant_id: str,
        subject_id: str,
        agent: str,
        message: str,
        session_id: str | None,
        style: str = "正式",
    ) -> dict:
        self._require_agent(agent)
        public_session = self._session_id(session_id)
        internal_session = self._internal_session(subject_id, public_session)
        gateway = DirectGatewayClient(self._mcp, self._quota, tenant_id, agent)

        if agent == "customer-service":
            workflow = CustomerServiceAgent(gateway, user_id=subject_id, session_id=internal_session)
        else:
            if style not in WRITING_STYLES:
                raise ValueError("不支持的写作文风")
            workflow = WritingAssistantAgent(
                gateway,
                user_id=subject_id,
                session_id=internal_session,
                style=style,
            )
        reply = await workflow.handle_message(message.strip())
        return {"reply": reply, "session_id": public_session, "agent": agent, "style": style}

    async def clear(
        self,
        *,
        tenant_id: str,
        subject_id: str,
        agent: str,
        session_id: str,
    ) -> dict:
        self._require_agent(agent)
        public_session = self._session_id(session_id, create=False)
        gateway = DirectGatewayClient(self._mcp, self._quota, tenant_id, agent)
        result = await gateway.call_tool("memory-service", "clear_memory", {
            "session_id": self._internal_session(subject_id, public_session),
        })
        return {"ok": True, "session_id": public_session, "result": result}

    async def profile(self, *, tenant_id: str, subject_id: str, agent: str) -> dict:
        self._require_agent(agent)
        gateway = DirectGatewayClient(self._mcp, self._quota, tenant_id, agent)
        result = await gateway.call_tool("memory-service", "recall_user_facts", {"user_id": subject_id})
        return {"agent": agent, "facts": result.get("facts", []) if isinstance(result, dict) else []}

    def _require_agent(self, agent: str) -> None:
        if agent not in AGENTS:
            raise ValueError("Agent 工作流不存在")

    def _session_id(self, session_id: str | None, *, create: bool = True) -> str:
        value = (session_id or "").strip()
        if not value and create:
            return f"session-{uuid.uuid4().hex[:12]}"
        if not SESSION_PATTERN.fullmatch(value):
            raise ValueError("会话标识无效")
        return value

    def _internal_session(self, subject_id: str, session_id: str) -> str:
        subject_hash = hashlib.sha256(subject_id.encode("utf-8")).hexdigest()[:20]
        return f"subject-{subject_hash}:{session_id}"
