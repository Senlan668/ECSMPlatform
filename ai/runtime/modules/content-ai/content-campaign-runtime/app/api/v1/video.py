"""
视频生成 API 路由
"""
from pathlib import Path
from typing import Optional, List

from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.runtime_context import resolve_static_url
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.services.video_service import video_service

router = APIRouter(prefix="/video", tags=["视频生成"])

# 静态文件目录
STATIC_DIR = Path(__file__).resolve().parent.parent.parent.parent / "static"


# ============== 请求/响应模型 ==============

class VideoGenerateRequest(BaseModel):
    """视频生成请求"""
    topic: str = Field(..., description="视频主题", example="3个Python技巧让你代码更简洁")
    voice_type: Optional[str] = Field(None, description="TTS 音色（可选）")
    style: Optional[str] = Field(None, description="视频风格", example="幽默")
    template: str = Field("KnowledgeVideo", description="模板类型: KnowledgeVideo / DataVizVideo")
    aspect_ratio: str = Field("9:16", description="视频尺寸: 9:16 或 16:9")


class ScriptPreviewRequest(BaseModel):
    """脚本预览请求"""
    topic: str = Field(..., description="视频主题")
    style: Optional[str] = Field(None, description="风格偏好")
    template: str = Field("KnowledgeVideo", description="模板类型")


class VideoTaskResponse(BaseModel):
    """视频任务基础响应"""
    id: str
    topic: str
    status: str
    message: str


class VoiceOption(BaseModel):
    """可用音色"""
    label: str
    value: str
    gender: str
    description: str


# ============== API 端点 ==============

@router.post("/generate", response_model=VideoTaskResponse)
async def generate_video(
    request: VideoGenerateRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    创建视频生成任务

    1. 创建任务记录
    2. 后台异步执行完整流水线
    3. 通过 GET /status/{task_id} 轮询进度
    """
    video_service.require_pipeline_configured()
    task = await video_service.create_task(
        db=db,
        topic=request.topic,
        user_id=str(current_user.id),
        voice_type=request.voice_type,
        style=request.style,
        template=request.template,
        aspect_ratio=request.aspect_ratio,
    )

    # 后台执行流水线
    async def _run_pipeline():
        from app.core.db import async_session_factory
        async with async_session_factory() as session:
            await video_service.execute_pipeline(session, str(task.id))

    background_tasks.add_task(_run_pipeline)

    return VideoTaskResponse(
        id=str(task.id),
        topic=request.topic,
        status="pending",
        message="视频生成任务已创建，正在后台处理",
    )


@router.get("/status/{task_id}")
async def get_video_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    """查询视频生成任务状态"""
    result = await video_service.get_task_status(db, task_id, user_id=str(current_user.id))
    if not result:
        raise HTTPException(status_code=404, detail="任务不存在")
    return result


@router.post("/script/preview")
async def preview_script(
    request: ScriptPreviewRequest,
    current_user: User = Depends(get_current_user),
):
    """
    仅生成视频脚本预览（不创建任务、不渲染）

    用于让用户先看脚本效果，确认后再生成完整视频。
    """
    script = await video_service.preview_script(
        topic=request.topic,
        style=request.style,
        template=request.template,
    )
    return {"script": script}


@router.get("/list")
async def list_videos(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    """查询历史视频列表"""
    tasks = await video_service.list_tasks(db, user_id=str(current_user.id), limit=limit)
    return {"videos": tasks, "total": len(tasks)}


@router.get("/download/{task_id}")
async def download_video(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    下载视频文件

    返回真实 MP4 文件流，支持浏览器直接下载。
    """
    result = await video_service.get_task_status(db, task_id, user_id=str(current_user.id))
    if not result:
        raise HTTPException(status_code=404, detail="任务不存在")

    if result["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"视频尚未完成 (当前状态: {result['status']})",
        )

    video_url = result.get("video_url", "")
    if not video_url:
        raise HTTPException(status_code=404, detail="视频文件不存在")

    # /static/videos/xxx.mp4 → 绝对路径
    try:
        video_path = resolve_static_url(video_url)
    except ValueError as exception:
        raise HTTPException(status_code=404, detail="视频文件路径无效") from exception

    if not video_path.exists():
        raise HTTPException(status_code=404, detail="视频文件在磁盘上不存在")

    filename = result.get("title", "video") + ".mp4"

    return FileResponse(
        path=str(video_path),
        media_type="video/mp4",
        filename=filename,
    )


@router.delete("/{task_id}")
async def delete_video_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    """
    删除视频生成任务

    同时删除磁盘上的视频和音频文件。
    """
    result = await video_service.delete_task(db, task_id, user_id=str(current_user.id))
    if not result:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"message": "已删除", "id": task_id}


@router.get("/voices", response_model=List[VoiceOption])
async def list_available_voices(
    current_user: User = Depends(get_current_user),
):
    """
    获取可用的 TTS 音色列表

    返回系统预配置的火山引擎音色信息，前端可用于下拉选择。
    """
    return [
        VoiceOption(
            label="灿灿 2.0",
            value="BV700_V2_streaming",
            gender="female",
            description="女声，支持22种情感，最通用，强烈推荐",
        ),
        VoiceOption(
            label="灿灿",
            value="BV700_streaming",
            gender="female",
            description="女声，经典版灿灿",
        ),
        VoiceOption(
            label="擎苍 2.0",
            value="BV701_V2_streaming",
            gender="male",
            description="男声，沉稳旁白，适合知识讲解",
        ),
        VoiceOption(
            label="阳光青年",
            value="BV123_streaming",
            gender="male",
            description="男声，年轻活力，适合轻松干货",
        ),
        VoiceOption(
            label="通用女声 2.0",
            value="BV001_V2_streaming",
            gender="female",
            description="标准女声",
        ),
        VoiceOption(
            label="通用男声",
            value="BV002_streaming",
            gender="male",
            description="标准男声",
        ),
        VoiceOption(
            label="炀炀",
            value="BV705_streaming",
            gender="female",
            description="女声，支持自然对话，适合分享型视频",
        ),
        VoiceOption(
            label="超自然-梓梓 2.0",
            value="BV406_V2_streaming",
            gender="female",
            description="女声，支持7种情感，自然流畅",
        ),
        VoiceOption(
            label="超自然-燃燃 2.0",
            value="BV407_V2_streaming",
            gender="male",
            description="男声，自然表达",
        ),
        VoiceOption(
            label="反卷青年",
            value="BV120_streaming",
            gender="male",
            description="男声轻快，适合有趣干货",
        ),
    ]
