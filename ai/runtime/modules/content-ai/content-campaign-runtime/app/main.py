"""
FastAPI 应用入口
AI 内容运营助手后端服务 (v1.1 - 添加日志系统)
"""
import sys
from pathlib import Path

# 确保 backend 目录在 Python 路径中
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import close_db
from app.core.logger import setup_logging, app_logger
from app.core.middleware import RequestLoggingMiddleware, RuntimeSecurityMiddleware
from app.core.runtime_context import tenant_static_path
from app.core.errors import CapabilityUnavailableError
from app.core.db import get_async_session
from app.dependencies.auth import get_current_user
from app.models.user import User
from app.graph.utils import close_checkpointer
from app.api.v1.workflow import router as workflow_router
from app.api.v1.image import router as image_router
from app.api.v1.poster import router as poster_router
from app.api.v1.batch import router as batch_router
from app.api.v1.gallery import router as gallery_router
from app.api.v1.brand import router as brand_router
from app.api.v1.user_template import router as template_router
from app.api.v1.profile import router as profile_router
from app.api.v1.platform import router as platform_router
from app.api.v1.calendar import router as calendar_router
from app.api.v1.image_model import router as image_model_router
from app.api.v1.prompt import router as prompt_router
from app.api.v1.video import router as video_router

# 初始化日志系统（在导入其他模块之前）
setup_logging(
    log_level=settings.log_level,
    log_target=settings.log_target,
    log_dir=settings.log_dir,
    json_logs=settings.log_json,
    console_output=settings.log_console,
    pii_anonymize=settings.log_pii_anonymize,
)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    应用生命周期管理
    
    启动时：
    - 初始化数据库连接
    - 初始化 LangGraph Checkpointer（创建必要的表）
    
    关闭时：
    - 关闭数据库连接
    - 关闭 Checkpointer 连接池
    """
    # 启动时执行
    app_logger.info(f"Starting {settings.app_name}...")
    
    try:
        app_logger.service_started(
            app_name=settings.app_name,
            debug=settings.debug,
            log_level=settings.log_level,
            docs_url="http://localhost:8000/docs"
        )
        
        # 同时保留控制台输出，方便开发时查看
        print(f"[OK] {settings.app_name} started successfully!")
        print(f"[Docs] API docs: http://localhost:8000/docs")
        print(f"[Logs] Log files: {settings.log_dir}/")
        
    except Exception as e:
        app_logger.error(f"Startup failed: {str(e)}", error=str(e))
        raise
    
    yield
    
    # 关闭时执行
    app_logger.info(f"Stopping {settings.app_name}...")
    
    try:
        await close_checkpointer()
        await close_db()
        app_logger.db_disconnected()
        app_logger.service_stopped(app_name=settings.app_name)
    except Exception as e:
        app_logger.warning(f"Error during shutdown: {str(e)}", error=str(e))


# 创建 FastAPI 应用
app = FastAPI(
    title=settings.app_name,
    description="""
## AI 内容运营助手 API

为教育培训公司提供的自动化内容生成工作流服务。

### 核心功能

- **选题生成**: AI 根据主题方向生成多个候选选题
- **文章撰写**: AI 根据选定选题生成技术文章
- **人工审核**: 支持通过/驳回机制，驳回后可重写
- **配图生成**: 自动提取视觉要点并生成配图

### 工作流程

1. 启动工作流，AI 生成候选选题
2. 人工选择一个选题
3. AI 生成文章草稿
4. 人工审核（通过/驳回）
5. 通过后自动生成配图
    """,
    version="1.0.0",
    lifespan=lifespan,
)


@app.exception_handler(CapabilityUnavailableError)
async def capability_unavailable_handler(
    _request: Request,
    exception: CapabilityUnavailableError,
) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "code": "CAPABILITY_NOT_CONFIGURED",
            "capability": exception.capability,
            "detail": exception.detail,
        },
    )

# 配置中间件（注意顺序：先添加的后执行）
# 1. 请求日志中间件
app.add_middleware(RequestLoggingMiddleware)

# 2. 平台运行时鉴权和租户上下文
app.add_middleware(RuntimeSecurityMiddleware)

# 3. CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(workflow_router, prefix="/api/v1")
app.include_router(image_router, prefix="/api/v1")
app.include_router(poster_router, prefix="/api/v1")
app.include_router(batch_router, prefix="/api/v1")
app.include_router(gallery_router, prefix="/api/v1")
app.include_router(brand_router, prefix="/api/v1")
app.include_router(template_router, prefix="/api/v1")
app.include_router(profile_router, prefix="/api/v1")
app.include_router(image_model_router, prefix="/api/v1")
app.include_router(platform_router, prefix="/api/v1")
app.include_router(calendar_router, prefix="/api/v1")
app.include_router(prompt_router, prefix="/api/v1")
app.include_router(video_router, prefix="/api/v1")


@app.get("/static/{file_path:path}", include_in_schema=False)
async def get_tenant_static_file(file_path: str):
    """Serve media only from the authenticated tenant's storage root."""
    try:
        path = tenant_static_path(file_path)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail="静态文件路径无效") from exception
    if not path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(
        path,
        headers={
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/")
async def root():
    """项目根路径 - 服务信息"""
    return {
        "service": settings.app_name,
        "status": "running",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/api/v1/runtime/capabilities")
async def runtime_capabilities(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
):
    from app.services.image_service import image_service
    from app.services.image_model_service import image_model_service
    from app.services.llm_service import llm_service
    from app.services.profile_service import profile_service
    from app.services.tts_service import tts_service

    provider = await profile_service.get_user_image_provider(db, user_id=current_user.id)
    image_model_config = await image_model_service.resolve_runtime_config(
        db,
        user_id=current_user.id,
        legacy_provider=provider,
    )

    return {
        "service": "content-campaign",
        "storage": {"database": "tenant_sqlite", "vector_store": "not_connected"},
        "workflow": {"checkpoint_backend": settings.checkpoint_backend},
        "dependencies": {
            "llm": "available" if llm_service.is_configured else "not_configured",
            "image": (
                "available"
                if image_service.is_runtime_configured(provider, image_model_config)
                else "not_configured"
            ),
            "tts": "available" if tts_service.is_configured else "not_configured",
            "remotion": "configured" if bool(settings.remotion_service_url) else "not_configured",
        },
    }


@app.get("/health")
async def health_check():
    """健康检查接口"""
    return {
        "status": "healthy",
        "service": settings.app_name,
        "runtime_auth_configured": bool(settings.runtime_control_token),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
