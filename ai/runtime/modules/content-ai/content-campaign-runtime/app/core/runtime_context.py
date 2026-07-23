"""Trusted platform identity and tenant-local storage helpers."""
from __future__ import annotations

import hashlib
import uuid
from contextvars import ContextVar, Token
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from app.core.config import settings


@dataclass(frozen=True)
class RuntimeIdentity:
    tenant_id: str
    subject_id: str
    subject_name: str
    subject_username: str = ""


_identity: ContextVar[RuntimeIdentity | None] = ContextVar(
    "content_campaign_runtime_identity",
    default=None,
)


def set_runtime_identity(identity: RuntimeIdentity) -> Token:
    return _identity.set(identity)


def reset_runtime_identity(token: Token) -> None:
    _identity.reset(token)


def get_runtime_identity() -> RuntimeIdentity:
    identity = _identity.get()
    if identity is None:
        raise RuntimeError("trusted runtime identity is not available")
    return identity


def has_runtime_identity() -> bool:
    return _identity.get() is not None


def current_tenant_id() -> str:
    return get_runtime_identity().tenant_id


def tenant_hash(tenant_id: str | None = None) -> str:
    value = tenant_id or current_tenant_id()
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:32]


def platform_user_id(identity: RuntimeIdentity | None = None) -> uuid.UUID:
    value = identity or get_runtime_identity()
    return uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"shangmei:content-campaign:{value.tenant_id}:{value.subject_id}",
    )


def tenant_runtime_root(tenant_id: str | None = None) -> Path:
    root = Path(settings.runtime_data_dir).expanduser().resolve()
    path = root / "tenants" / tenant_hash(tenant_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def tenant_static_root(tenant_id: str | None = None) -> Path:
    path = tenant_runtime_root(tenant_id) / "static"
    path.mkdir(parents=True, exist_ok=True)
    return path


def tenant_static_path(relative_path: str | PurePosixPath) -> Path:
    relative = PurePosixPath(str(relative_path).replace("\\", "/").lstrip("/"))
    if not relative.parts or relative.is_absolute() or ".." in relative.parts:
        raise ValueError("invalid tenant static path")
    root = tenant_static_root().resolve()
    candidate = root.joinpath(*relative.parts).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError("static path escapes tenant storage")
    return candidate


def resolve_static_url(url: str) -> Path:
    normalized = url.split("?", 1)[0].split("#", 1)[0]
    prefix = "/static/"
    if not normalized.startswith(prefix):
        raise ValueError("only tenant static URLs are supported")
    return tenant_static_path(normalized[len(prefix):])
