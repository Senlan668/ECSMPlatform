from copy import deepcopy


PROJECT_SCOPED_TOOLS = {
    "chat_completion",
    "embedding",
    "ingest_document",
    "search_knowledge",
    "save_memory",
    "recall_memory",
    "clear_memory",
}
USER_SCOPED_TOOLS = {"save_user_fact", "recall_user_facts", "delete_user_fact"}


def scoped_tool_arguments(project_id: str, tool: str, arguments: dict) -> dict:
    """Bind storage/model scopes to the authenticated project, never caller input."""
    scoped = deepcopy(arguments)
    if tool in PROJECT_SCOPED_TOOLS:
        scoped["project_id"] = project_id
    if tool in USER_SCOPED_TOOLS:
        user_id = str(scoped.get("user_id", "")).strip()
        if not user_id or len(user_id) > 256 or any(char in user_id for char in "\r\n\0"):
            raise ValueError("user_id 无效")
        scoped["user_id"] = f"{project_id}:{user_id}"
        if tool == "save_user_fact":
            scoped["source_project"] = project_id
    return scoped
