import asyncio

from gateway.agent_runtime import AgentRuntime


class FakeQuota:
    def __init__(self):
        self.usage = {}

    def add(self, tenant_id: str, tokens: int):
        self.usage[tenant_id] = self.usage.get(tenant_id, 0) + tokens


class FakeMcp:
    def __init__(self):
        self.calls = []

    async def call_tool(self, service: str, tool: str, arguments: dict):
        self.calls.append((service, tool, arguments))
        if tool == "recall_memory":
            return {"messages": []}
        if tool == "recall_user_facts":
            return {"facts": [{"key": "industry", "value": "电商"}]}
        if tool == "search_knowledge":
            return {"results": []}
        if tool == "chat_completion":
            if arguments.get("max_tokens") == 200:
                return {"content": "[]", "usage": {"total_tokens": 3}}
            return {"content": "workflow reply", "usage": {"total_tokens": 17}}
        return {"ok": True}

    async def get_prompt(self, service: str, prompt: str, arguments: dict):
        self.calls.append((service, prompt, arguments))
        return {"messages": [{"role": "user", "content": "rendered"}]}


def test_customer_agent_reuses_full_original_workflow_with_tenant_scope():
    mcp = FakeMcp()
    quota = FakeQuota()
    runtime = AgentRuntime(mcp, quota)

    result = asyncio.run(runtime.chat(
        tenant_id="tenant-a",
        subject_id="operator-1",
        agent="customer-service",
        message="我的预算是 500 元",
        session_id="session-1",
    ))

    assert result["reply"] == "workflow reply"
    assert result["session_id"] == "session-1"
    project_scopes = {
        arguments["project_id"]
        for _, tool, arguments in mcp.calls
        if tool in {"recall_memory", "search_knowledge", "chat_completion", "save_memory"}
    }
    assert len(project_scopes) == 1
    assert next(iter(project_scopes)).endswith("-customer-service")
    assert quota.usage == {"tenant-a": 20}


def test_writing_agent_session_is_namespaced_by_subject():
    mcp = FakeMcp()
    runtime = AgentRuntime(mcp, FakeQuota())

    asyncio.run(runtime.chat(
        tenant_id="tenant-a",
        subject_id="writer-7",
        agent="writing-assistant",
        message="写一篇商品介绍",
        session_id="same-public-session",
        style="轻松",
    ))

    memory_calls = [arguments for _, tool, arguments in mcp.calls if tool == "save_memory"]
    assert memory_calls
    assert all(item["session_id"].endswith(":same-public-session") for item in memory_calls)
    assert all("writer-7" not in item["session_id"] for item in memory_calls)
