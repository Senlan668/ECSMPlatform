"""
平台适配 API 路由

提供多平台内容改写的 REST API 接口。
"""
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.data.platform_rules import get_all_rules_summary, ALL_PLATFORM_IDS
from app.dependencies.auth import get_current_user
from app.core.errors import CapabilityUnavailableError
from app.models.user import User
from app.services.platform_adapter_service import platform_adapter_service

router = APIRouter(prefix="/platform", tags=["Platform Adapter"])


# ==================== 请求/响应模型 ====================

class AdaptSingleRequest(BaseModel):
    """单平台改写请求"""
    platform_id: str = Field(
        ...,
        description="目标平台标识 (xiaohongshu/douyin/wechat/bilibili/weibo)",
    )
    source_article: str = Field(
        ...,
        description="原始文章内容",
        min_length=10,
        max_length=10000,
    )
    source_title: Optional[str] = Field(
        default=None,
        description="原文标题（可选）",
        max_length=200,
    )
    source_thread_id: Optional[str] = Field(
        default=None,
        description="关联的工作流 thread_id（可选）",
    )
    include_tags: bool = Field(
        default=True,
        description="是否同时推荐标签",
    )


class AdaptAllRequest(BaseModel):
    """全平台改写请求"""
    source_article: str = Field(
        ...,
        description="原始文章内容",
        min_length=10,
        max_length=10000,
    )
    source_title: Optional[str] = Field(
        default=None,
        description="原文标题（可选）",
        max_length=200,
    )
    source_thread_id: Optional[str] = Field(
        default=None,
        description="关联的工作流 thread_id（可选）",
    )
    platform_ids: Optional[List[str]] = Field(
        default=None,
        description="指定改写的平台列表（NULL 则改写全部平台）",
    )


class UpdateVariantRequest(BaseModel):
    """编辑改写版本请求"""
    adapted_content: Optional[str] = Field(
        default=None,
        description="编辑后的文案内容",
    )
    suggested_title: Optional[str] = Field(
        default=None,
        description="编辑后的标题",
    )
    suggested_tags: Optional[List[str]] = Field(
        default=None,
        description="编辑后的标签列表",
    )


# ==================== API 接口 ====================

@router.get("/rules")
async def get_platform_rules() -> Dict[str, Any]:
    """
    获取所有平台规则

    返回各平台的字数限制、推荐比例、语调风格等信息，
    供前端展示平台选择器和规则提示。
    """
    return {
        "platforms": get_all_rules_summary(),
        "total": len(ALL_PLATFORM_IDS),
    }


@router.post("/adapt")
async def adapt_single_platform(
    request: AdaptSingleRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    单平台改写

    将原始文章改写为指定平台的风格版本。
    改写结果会自动保存到数据库供后续查看和编辑。
    """
    # 校验平台 ID
    if request.platform_id not in ALL_PLATFORM_IDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的平台: {request.platform_id}，"
                   f"支持的平台: {', '.join(ALL_PLATFORM_IDS)}",
        )

    try:
        result = await platform_adapter_service.adapt_single(
            db,
            user_id=current_user.id,
            platform_id=request.platform_id,
            source_article=request.source_article,
            source_title=request.source_title,
            source_thread_id=request.source_thread_id,
            include_tags=request.include_tags,
        )
        return result
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"平台改写失败: {str(e)}",
        )


@router.post("/adapt-all")
async def adapt_all_platforms(
    request: AdaptAllRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    一键全平台改写

    并发生成所有平台（或指定平台）的改写版本。
    改写结果会自动保存到数据库供后续查看和编辑。
    """
    # 校验指定的平台 ID
    if request.platform_ids:
        invalid = [p for p in request.platform_ids if p not in ALL_PLATFORM_IDS]
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持的平台: {', '.join(invalid)}",
            )

    try:
        result = await platform_adapter_service.adapt_all(
            db,
            user_id=current_user.id,
            source_article=request.source_article,
            source_title=request.source_title,
            source_thread_id=request.source_thread_id,
            platform_ids=request.platform_ids,
        )
        return result
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"全平台改写失败: {str(e)}",
        )


@router.get("/variants/{thread_id}")
async def get_variants_by_thread(
    thread_id: str,
    platform: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    获取某篇文章的所有平台改写版本

    通过工作流 thread_id 查询关联的所有改写版本。
    可通过 platform 参数筛选特定平台。
    """
    # 验证 thread_id 属于当前用户
    if not thread_id.startswith(str(current_user.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权访问此工作流的改写版本",
        )

    result = await platform_adapter_service.list_variants(
        db,
        user_id=current_user.id,
        source_thread_id=thread_id,
        platform=platform,
    )
    return result


@router.get("/variants")
async def list_all_variants(
    platform: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    获取当前用户的所有平台改写版本列表

    支持按平台筛选和分页。
    """
    result = await platform_adapter_service.list_variants(
        db,
        user_id=current_user.id,
        platform=platform,
        page=page,
        page_size=page_size,
    )
    return result


@router.get("/variant/{variant_id}")
async def get_variant_detail(
    variant_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """获取单个改写版本详情"""
    result = await platform_adapter_service.get_variant(
        db,
        user_id=current_user.id,
        variant_id=variant_id,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到该改写版本",
        )
    return result


@router.put("/variant/{variant_id}")
async def update_variant(
    variant_id: UUID,
    request: UpdateVariantRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """
    编辑改写版本

    用户可手动编辑改写后的文案、标题和标签。
    编辑后 is_edited 标记为 true。
    """
    result = await platform_adapter_service.update_variant(
        db,
        user_id=current_user.id,
        variant_id=variant_id,
        adapted_content=request.adapted_content,
        suggested_title=request.suggested_title,
        suggested_tags=request.suggested_tags,
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到该改写版本",
        )
    return result


@router.delete("/variant/{variant_id}")
async def delete_variant(
    variant_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> Dict[str, Any]:
    """删除单个改写版本"""
    success = await platform_adapter_service.delete_variant(
        db,
        user_id=current_user.id,
        variant_id=variant_id,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="未找到该改写版本",
        )
    return {"success": True, "message": "已删除"}
