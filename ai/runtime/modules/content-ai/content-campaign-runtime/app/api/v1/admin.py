"""后台人员管理 API。"""
from __future__ import annotations

from datetime import datetime
from math import ceil
from typing import Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.admin_service import admin_service
from app.services.user_admin_service import (
    LastActiveAdminError,
    UsernameExistsError,
    user_admin_service,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


class AdminUserResponse(BaseModel):
    id: str
    username: str
    nickname: Optional[str] = None
    is_admin: bool
    is_active: bool
    created_at: Optional[datetime] = None


class AdminUserPageResponse(BaseModel):
    items: list[AdminUserResponse]
    page: int
    page_size: int
    total: int
    total_pages: int


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    is_admin: bool = False

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("用户名长度必须为 3 至 50 个字符")
        return value


class SetUserAdminRequest(BaseModel):
    is_admin: bool


class SetUserStatusRequest(BaseModel):
    is_active: bool


class ResetUserPasswordRequest(BaseModel):
    password: str = Field(..., min_length=6, max_length=100)


async def _ensure_admin(db: AsyncSession, current_user: User) -> None:
    if not await admin_service.is_admin(db, current_user):
        raise HTTPException(status_code=403, detail="仅管理员可访问人员管理")


def _serialize_user(user: User) -> AdminUserResponse:
    return AdminUserResponse(
        id=str(user.id),
        username=user.username,
        nickname=getattr(user, "nickname", None),
        is_admin=bool(getattr(user, "is_admin", False)),
        is_active=bool(getattr(user, "is_active", True)),
        created_at=user.created_at,
    )


def _raise_not_found() -> None:
    raise HTTPException(status_code=404, detail="用户不存在")


def _raise_last_admin() -> None:
    raise HTTPException(status_code=409, detail="必须至少保留一名可用管理员")


@router.get("/users", response_model=AdminUserPageResponse)
async def list_users(
    keyword: str = "",
    role: Literal["all", "admin", "user"] = "all",
    user_status: Literal["all", "active", "inactive"] = Query("all", alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> AdminUserPageResponse:
    await _ensure_admin(db, current_user)
    if page_size not in {20, 50, 100}:
        raise HTTPException(status_code=422, detail="page_size 仅支持 20、50 或 100")
    result = await user_admin_service.list_users(
        db, keyword=keyword, role=role, status=user_status, page=page, page_size=page_size,
    )
    return AdminUserPageResponse(
        items=[_serialize_user(user) for user in result.items],
        page=page,
        page_size=page_size,
        total=result.total,
        total_pages=ceil(result.total / page_size) if result.total else 0,
    )


@router.post("/users", response_model=AdminUserResponse, status_code=201)
async def create_user(
    request: CreateUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> AdminUserResponse:
    await _ensure_admin(db, current_user)
    try:
        user = await user_admin_service.create_user(
            db, request.username, request.password, request.is_admin,
        )
    except UsernameExistsError:
        raise HTTPException(status_code=409, detail="用户名已存在")
    return _serialize_user(user)


@router.put("/users/{user_id}/admin", response_model=AdminUserResponse)
async def set_user_admin(
    user_id: UUID,
    request: SetUserAdminRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> AdminUserResponse:
    await _ensure_admin(db, current_user)
    if current_user.id == user_id and not request.is_admin:
        raise HTTPException(status_code=400, detail="不能取消自己的管理员权限")
    try:
        user = await user_admin_service.set_user_admin(db, user_id, request.is_admin)
    except LastActiveAdminError:
        _raise_last_admin()
    if user is None:
        _raise_not_found()
    return _serialize_user(user)


@router.put("/users/{user_id}/status", response_model=AdminUserResponse)
async def set_user_status(
    user_id: UUID,
    request: SetUserStatusRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> AdminUserResponse:
    await _ensure_admin(db, current_user)
    if current_user.id == user_id and not request.is_active:
        raise HTTPException(status_code=400, detail="不能停用自己的账号")
    try:
        user = await user_admin_service.set_user_status(db, user_id, request.is_active)
    except LastActiveAdminError:
        _raise_last_admin()
    if user is None:
        _raise_not_found()
    return _serialize_user(user)


@router.put("/users/{user_id}/password", status_code=204, response_class=Response)
async def reset_user_password(
    user_id: UUID,
    request: ResetUserPasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> None:
    await _ensure_admin(db, current_user)
    if not await user_admin_service.reset_password(db, user_id, request.password):
        _raise_not_found()
    return None
