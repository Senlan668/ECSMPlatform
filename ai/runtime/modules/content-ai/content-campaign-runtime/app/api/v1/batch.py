"""
批量生成 API 路由
提供批量生成提交、进度查询、SSE 推送、ZIP 下载、失败重试等接口
"""
import asyncio
from typing import Optional, List, Dict, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.errors import CapabilityUnavailableError
from app.core.limits import IMAGE_PROMPT_MAX_LENGTH, MAX_REFERENCE_IMAGES
from app.core.media import ImageBase64
from app.core.runtime_context import tenant_hash
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.brand_service import brand_service
from app.services.batch_service import batch_service
from app.services.image_model_service import image_model_service
from app.services.profile_service import profile_service
from app.services.poster_service import poster_service

router = APIRouter(prefix="/poster/batch", tags=["Poster Batch"])


# ======================== 请求/响应模型 ========================

class BatchItemInput(BaseModel):
    """单条批量生成内容"""
    title: str = Field("", description="主标题（可选）")
    subtitle: str = Field("", description="副标题（可选）")
    prompt: str = Field(..., description="画面描述/提示词（必填）", min_length=1, max_length=IMAGE_PROMPT_MAX_LENGTH)


class BatchGenerateRequest(BaseModel):
    """批量生成请求"""
    mode: str = Field("custom", description="生成模式: custom / template")
    aspect_ratio: str = Field("3:4", description="统一输出比例")
    color_tone: Optional[str] = Field(None, description="全局色调偏好")
    style_tags: Optional[List[str]] = Field(None, description="全局风格标签")
    template_index: Optional[int] = Field(None, description="模板索引（mode=template 时使用）")
    series_mode: bool = Field(False, description="是否启用系列风格一致性")
    items: List[BatchItemInput] = Field(..., description="生成内容列表", min_length=1, max_length=50)


class BatchGenerateResponse(BaseModel):
    """批量生成响应"""
    success: bool
    task_id: Optional[str] = None
    total_count: int = 0
    mode: str = "batch"
    error: Optional[str] = None


class BatchItemStatus(BaseModel):
    """子任务状态"""
    id: Optional[str] = None
    order_index: int
    status: str
    image_url: Optional[str] = None
    error_message: Optional[str] = None
    title: str = ""
    subtitle: str = ""


class BatchStatusResponse(BaseModel):
    """任务状态响应"""
    task_id: str
    status: str
    total_count: int
    success_count: int
    failed_count: int
    running_count: int
    series_mode: bool = False
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    items: List[BatchItemStatus]


class TemplateBatchReferenceImage(BaseModel):
    """模板批量图片槽位引用图"""
    name: str = Field(..., max_length=80)
    image_base64: ImageBase64


class TemplateBatchItemInput(BaseModel):
    """模板批量生成单条内容"""
    params: Dict[str, Any] = Field(..., description="模板参数")
    title: Optional[str] = Field(None, description="队列展示标题")
    reference_images: Optional[List[TemplateBatchReferenceImage]] = Field(
        None,
        max_length=MAX_REFERENCE_IMAGES,
        description="图片槽位引用图",
    )


class TemplateBatchGenerateRequest(BaseModel):
    """模板批量生成请求"""
    template_id: str = Field(..., description="模板 ID")
    items: List[TemplateBatchItemInput] = Field(..., min_length=1, max_length=50)
    style_tag: Optional[str] = None
    color_option: Optional[str] = None
    aspect_ratio: Optional[str] = None


class BatchAppendResponse(BaseModel):
    """追加批量任务条目响应"""
    success: bool
    task_id: Optional[str] = None
    appended_count: int = 0
    total_count: int = 0
    should_start_worker: bool = False
    error: Optional[str] = None


class SingleReferenceImage(BaseModel):
    """自定义生成参考图"""
    image_base64: ImageBase64 = Field(..., description="参考图 base64 / data URL")
    name: Optional[str] = Field(None, max_length=80, description="参考图名称，如 图1")


class SingleCustomRequest(BaseModel):
    """单张自定义生成（后台异步）请求"""
    prompt: str = Field(..., min_length=1, max_length=IMAGE_PROMPT_MAX_LENGTH)
    style_tags: Optional[List[str]] = None
    aspect_ratio: str = "3:4"
    color_tone: Optional[str] = None
    reference_images: Optional[List[SingleReferenceImage]] = Field(None, max_length=MAX_REFERENCE_IMAGES)


class SingleEditRequest(BaseModel):
    """单张以图改图（后台异步）请求"""
    image_base64: ImageBase64 = Field(..., description="原始图片 base64")
    edit_prompt: str = Field(..., min_length=1, max_length=IMAGE_PROMPT_MAX_LENGTH)
    aspect_ratio: str = "3:4"


# ======================== 接口 ========================

async def _get_runtime_image_context(
    db: AsyncSession,
    current_user: Optional[User],
) -> Dict[str, Any]:
    brand_kit = None
    image_provider = None
    image_model_config = None
    if current_user:
        kit = await brand_service.get_brand_kit(db, user_id=current_user.id)
        if kit:
            brand_kit = brand_service.serialize(kit)
        image_provider = await profile_service.get_user_image_provider(
            db,
            user_id=current_user.id,
        )
    image_model_config = await image_model_service.resolve_runtime_config(
        db,
        user_id=current_user.id if current_user else None,
        legacy_provider=image_provider,
    )
    poster_service.require_configured(image_provider, image_model_config)

    return {
        "brand_kit": brand_kit,
        "image_provider": image_provider,
        "image_model_config": image_model_config,
    }


def _template_batch_items(items: List[TemplateBatchItemInput]) -> List[Dict[str, Any]]:
    normalized = []
    for item in items:
        params = dict(item.params or {})
        if item.title:
            params["_batch_title"] = item.title
        if item.reference_images:
            params["reference_images"] = [
                image.model_dump()
                for image in item.reference_images
            ]
        normalized.append(params)
    return normalized


async def _template_shared_config(
    req: TemplateBatchGenerateRequest,
    db: AsyncSession,
    current_user: Optional[User],
) -> Dict[str, Any]:
    from app.services.template_service import template_service

    tpl = await template_service.get_template(db, template_id=UUID(req.template_id))
    if not tpl:
        raise HTTPException(status_code=404, detail=f"模板 {req.template_id} 不存在")

    return {
        "mode": "template",
        "sequential": True,
        "template_id": str(tpl.id),
        "template_name": tpl.name,
        "template_style_tag": tpl.style_tag,
        "template_config": tpl.config or {},
        "style_tag": req.style_tag,
        "color_option": req.color_option,
        "aspect_ratio": req.aspect_ratio or (tpl.config or {}).get("default_aspect_ratio", "3:4"),
        "series_mode": False,
        **(await _get_runtime_image_context(db, current_user)),
    }


@router.post(
    "/template",
    response_model=BatchGenerateResponse,
    summary="提交模板批量生成任务",
)
async def template_batch_generate(
    req: TemplateBatchGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    提交模板批量生成任务。该模式强制后端串行执行，避免多张图同时打模型通道。
    """
    try:
        result = await batch_service.create_batch_task(
            _template_batch_items(req.items),
            await _template_shared_config(req, db, current_user),
            tenant_key=tenant_hash(),
            user_id=current_user.id,
        )
        background_tasks.add_task(batch_service.run_batch_task, result["task_id"])
        return BatchGenerateResponse(
            success=True,
            task_id=result["task_id"],
            total_count=result["total_count"],
            mode="batch",
        )
    except HTTPException:
        raise
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        return BatchGenerateResponse(
            success=False,
            error=f"创建模板批量任务失败: {str(e)}",
        )


@router.post(
    "/{task_id}/template-items",
    response_model=BatchAppendResponse,
    summary="向模板批量任务追加条目",
)
async def append_template_batch_items(
    task_id: str,
    req: TemplateBatchGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """
    向已有模板批量任务追加条目；如果任务已结束，会重新启动同一个任务继续处理新条目。
    """
    result = await batch_service.append_batch_items(
        task_id,
        _template_batch_items(req.items),
        tenant_key=tenant_hash(),
        user_id=current_user.id,
    )
    if result is None:
        raise HTTPException(status_code=404, detail=f"任务 {task_id} 不存在")

    if result.get("should_start_worker"):
        background_tasks.add_task(batch_service.run_batch_task, task_id)

    return BatchAppendResponse(**result)


@router.post(
    "/single/custom",
    response_model=BatchGenerateResponse,
    summary="提交单张自定义生成任务（后台异步）",
)
async def single_custom_generate(
    req: SingleCustomRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    提交单张自定义生成任务，立即返回 task_id，图片在后台生成。

    避免长时间同步请求被反向代理/浏览器判定超时。
    """
    try:
        context = await _get_runtime_image_context(db, current_user)
        shared_config = {
            "aspect_ratio": req.aspect_ratio,
            "color_tone": req.color_tone,
            "style_tags": req.style_tags,
            "series_mode": False,
            **context,
        }
        result = await batch_service.create_single_generation_task(
            mode="custom",
            params={"prompt": req.prompt},
            runtime_input={
                "reference_images": [img.model_dump() for img in (req.reference_images or [])],
            },
            shared_config=shared_config,
            tenant_key=tenant_hash(),
            user_id=current_user.id,
        )
        background_tasks.add_task(
            batch_service.run_single_generation_task,
            result["task_id"],
        )
        return BatchGenerateResponse(
            success=True,
            task_id=result["task_id"],
            total_count=1,
            mode="batch",
        )
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        return BatchGenerateResponse(
            success=False,
            error=f"创建单张自定义任务失败: {str(e)}",
        )


@router.post(
    "/single/edit",
    response_model=BatchGenerateResponse,
    summary="提交单张以图改图任务（后台异步）",
)
async def single_edit_generate(
    req: SingleEditRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    提交单张以图改图任务，立即返回 task_id，图片在后台生成。
    """
    try:
        context = await _get_runtime_image_context(db, current_user)
        shared_config = {
            "aspect_ratio": req.aspect_ratio,
            "series_mode": False,
            **context,
        }
        result = await batch_service.create_single_generation_task(
            mode="edit",
            params={"edit_prompt": req.edit_prompt},
            runtime_input={"image_base64": req.image_base64},
            shared_config=shared_config,
            tenant_key=tenant_hash(),
            user_id=current_user.id,
        )
        background_tasks.add_task(
            batch_service.run_single_generation_task,
            result["task_id"],
        )
        return BatchGenerateResponse(
            success=True,
            task_id=result["task_id"],
            total_count=1,
            mode="batch",
        )
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        return BatchGenerateResponse(
            success=False,
            error=f"创建单张改图任务失败: {str(e)}",
        )


@router.post(
    "/generate",
    response_model=BatchGenerateResponse,
    summary="提交批量生成任务",
)
async def batch_generate(
    req: BatchGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    提交批量生成任务

    - 立即返回 task_id，后台异步执行生成
    - 启用 series_mode 时，首图先同步生成作为风格锚点，后续图片并发生成
    - 最大并发数: 3
    """
    try:
        # 构建共享配置
        shared_config = {
            "mode": req.mode,
            "aspect_ratio": req.aspect_ratio,
            "color_tone": req.color_tone,
            "style_tags": req.style_tags,
            "template_index": req.template_index,
            "series_mode": req.series_mode,
            **(await _get_runtime_image_context(db, current_user)),
        }

        # 转换 items
        items = [item.model_dump() for item in req.items]

        # 创建任务
        result = await batch_service.create_batch_task(
            items,
            shared_config,
            tenant_key=tenant_hash(),
            user_id=current_user.id,
        )

        # 后台异步执行
        background_tasks.add_task(batch_service.run_batch_task, result["task_id"])

        return BatchGenerateResponse(
            success=True,
            task_id=result["task_id"],
            total_count=result["total_count"],
            mode="batch",
        )

    except CapabilityUnavailableError:
        raise
    except Exception as e:
        return BatchGenerateResponse(
            success=False,
            error=f"创建批量任务失败: {str(e)}",
        )


@router.get(
    "/{task_id}/status",
    response_model=BatchStatusResponse,
    summary="查询批量任务进度",
)
async def get_batch_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    查询批量生成任务的详细进度

    返回整体状态、各子任务的生成状态和结果图片 URL
    """
    status = batch_service.get_batch_status(
        task_id,
        tenant_key=tenant_hash(),
        user_id=current_user.id,
    )
    if not status:
        raise HTTPException(status_code=404, detail=f"任务 {task_id} 不存在")
    return status


@router.get(
    "/{task_id}/stream",
    summary="SSE 实时推送生成进度",
)
async def stream_batch_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Server-Sent Events 实时推送批量任务进度

    前端通过 EventSource 监听，每 2 秒发送一次当前状态
    任务完成后自动关闭连接
    """
    import json

    tenant_key = tenant_hash()
    user_id = current_user.id
    initial_status = batch_service.get_batch_status(
        task_id,
        tenant_key=tenant_key,
        user_id=user_id,
    )
    if initial_status is None:
        raise HTTPException(status_code=404, detail=f"任务 {task_id} 不存在")

    async def event_generator():
        max_polls = 300  # 最多轮询 10 分钟
        poll_count = 0

        while poll_count < max_polls:
            status = batch_service.get_batch_status(
                task_id,
                tenant_key=tenant_key,
                user_id=user_id,
            )
            if not status:
                yield f"data: {json.dumps({'error': '任务不存在'})}\n\n"
                break

            yield f"data: {json.dumps(status, ensure_ascii=False)}\n\n"

            # 任务已完成
            if status["status"] in ("completed", "partial_failed", "failed"):
                break

            poll_count += 1
            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/{task_id}/download",
    summary="ZIP 打包下载所有成功图片",
)
async def download_batch(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    将批量生成的所有成功图片打包为 ZIP 下载

    文件命名格式: 序号_标题.png
    """
    zip_buffer = batch_service.build_download_zip(
        task_id,
        tenant_key=tenant_hash(),
        user_id=current_user.id,
    )
    if not zip_buffer:
        raise HTTPException(
            status_code=404,
            detail="任务不存在或尚无成功的图片可下载",
        )

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=batch_{task_id[:8]}.zip",
        },
    )


@router.post(
    "/{task_id}/retry",
    summary="重试所有失败的子任务",
)
async def retry_failed(
    task_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """
    重新生成批量任务中所有状态为 failed 的子任务

    重试时保留原有参数和系列风格锚定配置
    """
    tenant_key = tenant_hash()
    status = batch_service.get_batch_status(
        task_id,
        tenant_key=tenant_key,
        user_id=current_user.id,
    )
    if status is None:
        raise HTTPException(status_code=404, detail=f"任务 {task_id} 不存在")

    failed_count = status.get("failed_count", 0)
    if failed_count <= 0:
        return {
            "task_id": task_id,
            "retried_count": 0,
            "queued": False,
            "message": "没有需要重试的失败项",
        }

    background_tasks.add_task(
        batch_service.retry_failed_items,
        task_id,
        tenant_key=tenant_key,
        user_id=current_user.id,
    )
    return {
        "task_id": task_id,
        "retried_count": failed_count,
        "queued": True,
        "message": "失败项已加入后台重试队列",
    }
