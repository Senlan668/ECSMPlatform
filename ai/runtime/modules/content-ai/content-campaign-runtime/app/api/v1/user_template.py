"""
用户模板中心 API 路由
提供模板的列表、创建、更新、删除、Fork 和发布功能
"""
from __future__ import annotations

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.admin_service import admin_service
from app.services.template_service import template_service

router = APIRouter(prefix="/templates", tags=["Templates"])


# ========== 请求/响应模型 ==========

class CreateTemplateRequest(BaseModel):
    """创建模板请求"""
    name: str = Field(..., max_length=100)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=50)
    style_tag: Optional[str] = Field(default=None, max_length=50)
    config: dict[str, Any] = Field(default_factory=dict)
    thumbnail_url: Optional[str] = None
    source_generation_id: Optional[UUID] = None


class UpdateTemplateRequest(BaseModel):
    """更新模板请求"""
    name: Optional[str] = Field(default=None, max_length=100)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=50)
    style_tag: Optional[str] = Field(default=None, max_length=50)
    config: Optional[dict[str, Any]] = None
    thumbnail_url: Optional[str] = None


# ========== 路由 ==========

@router.get("/list", summary="获取模板列表（系统 + 个人）")
async def list_templates(
    scope: str = Query(default="all", regex="^(all|system|mine)$"),
    category: Optional[str] = Query(default=None),
    include_inactive: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    can_include_inactive = False
    if include_inactive:
        can_include_inactive = await admin_service.is_admin(db, current_user)
        if not can_include_inactive:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="仅管理员可查看已下架模板",
            )

    templates = await template_service.list_templates(
        db,
        user_id=current_user.id,
        scope=scope,
        category=category,
        include_inactive=can_include_inactive,
    )
    return templates


@router.post("/create", summary="新建个人模板")
async def create_template(
    request: CreateTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    data = request.model_dump(exclude_unset=True)
    tpl = await template_service.create_template(
        db,
        user_id=current_user.id,
        data=data,
    )
    return template_service.serialize(tpl)


@router.put("/{template_id}", summary="编辑个人模板")
async def update_template(
    template_id: UUID,
    request: UpdateTemplateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    data = request.model_dump(exclude_unset=True)
    tpl = await template_service.update_template(
        db,
        user_id=current_user.id,
        template_id=template_id,
        data=data,
    )
    if tpl is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模板不存在或无权编辑",
        )
    return template_service.serialize(tpl)


@router.delete("/{template_id}", summary="删除个人模板")
async def delete_template(
    template_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    deleted = await template_service.delete_template(
        db,
        user_id=current_user.id,
        template_id=template_id,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模板不存在或无权删除",
        )
    return {"success": True}


@router.post("/{template_id}/duplicate", summary="Fork 公共模板为个人模板")
async def duplicate_template(
    template_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    forked = await template_service.duplicate_template(
        db,
        user_id=current_user.id,
        template_id=template_id,
    )
    if forked is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="源模板不存在",
        )
    return template_service.serialize(forked)


@router.post("/{template_id}/publish", summary="发布个人模板为公共模板")
async def publish_template(
    template_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    published = await template_service.publish_template(
        db,
        user_id=current_user.id,
        template_id=template_id,
    )
    if published is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="模板不存在或无权发布",
        )
    return template_service.serialize(published)


async def _ensure_admin(db: AsyncSession, current_user: User) -> None:
    if not await admin_service.is_admin(db, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="仅管理员可执行该操作",
        )


@router.post("/{template_id}/deactivate", summary="管理员下架公共模板")
async def deactivate_public_template(
    template_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    await _ensure_admin(db, current_user)
    tpl = await template_service.deactivate_public_template(db, template_id=template_id)
    if tpl is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="公共模板不存在",
        )
    return template_service.serialize(tpl)


@router.post("/{template_id}/restore", summary="管理员恢复公共模板")
async def restore_public_template(
    template_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    await _ensure_admin(db, current_user)
    tpl = await template_service.restore_public_template(db, template_id=template_id)
    if tpl is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="公共模板不存在",
        )
    return template_service.serialize(tpl)
