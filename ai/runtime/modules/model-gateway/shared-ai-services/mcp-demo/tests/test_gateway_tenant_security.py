from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from gateway.auth import AuthMiddleware
from gateway.scope import scoped_tool_arguments


def build_client() -> TestClient:
    app = FastAPI()

    @app.get("/secured")
    async def secured(request: Request) -> dict:
        return {
            "project_id": request.state.project_id,
            "subject_id": request.state.subject_id,
            "trusted_runtime": request.state.trusted_runtime,
        }

    app.add_middleware(
        AuthMiddleware,
        projects={"legacy-project": {"api_key": "legacy-key"}},
        control_token="runtime-control-token",
    )
    return TestClient(app)


def test_control_plane_identity_is_accepted() -> None:
    response = build_client().get(
        "/secured",
        headers={
            "X-Runtime-Token": "runtime-control-token",
            "X-Tenant-Id": "tenant-a",
            "X-Subject-Id": "user-1",
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "project_id": "tenant-a",
        "subject_id": "user-1",
        "trusted_runtime": True,
    }


def test_control_plane_identity_rejects_unsafe_headers() -> None:
    response = build_client().get(
        "/secured",
        headers={
            "X-Runtime-Token": "runtime-control-token",
            "X-Tenant-Id": "tenant-a\nforged",
            "X-Subject-Id": "user-1",
        },
    )

    assert response.status_code == 400


def test_legacy_api_key_remains_supported() -> None:
    response = build_client().get("/secured", headers={"X-API-Key": "legacy-key"})

    assert response.status_code == 200
    assert response.json()["project_id"] == "legacy-project"
    assert response.json()["trusted_runtime"] is False


def test_project_scope_overrides_browser_arguments() -> None:
    scoped = scoped_tool_arguments(
        "tenant-a",
        "search_knowledge",
        {"project_id": "tenant-b", "query": "退款规则"},
    )

    assert scoped == {"project_id": "tenant-a", "query": "退款规则"}


def test_user_fact_scope_is_tenant_namespaced() -> None:
    scoped = scoped_tool_arguments(
        "tenant-a",
        "save_user_fact",
        {"user_id": "customer-9", "fact_key": "budget", "fact_value": "500"},
    )

    assert scoped["user_id"] == "tenant-a:customer-9"
    assert scoped["source_project"] == "tenant-a"


def test_user_fact_requires_a_valid_user_id() -> None:
    try:
        scoped_tool_arguments("tenant-a", "recall_user_facts", {"user_id": ""})
    except ValueError as error:
        assert str(error) == "user_id 无效"
    else:
        raise AssertionError("empty user_id should be rejected")
