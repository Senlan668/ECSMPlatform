import hmac

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.upload import router as upload_router
from app.api.tasks import router as tasks_router
from app.api.clips import router as clips_router
from app.api.export import router as export_router
from app.db import Base, engine
from app.services.task_runner import start_task_runner, stop_task_runner
from app.config import settings

app = FastAPI(
    title="AI Slice - 直播切片自动剪辑",
    description="上传直播长视频，AI 自动提取精彩片段并输出粗切视频",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_credentials=False,
    allow_methods=[],
    allow_headers=[],
)


@app.middleware("http")
async def require_control_plane_token(request: Request, call_next):
    """Keep the tenant-unaware runtime behind the trusted Java control plane."""
    if request.url.path == "/api/health" or not request.url.path.startswith("/api/"):
        return await call_next(request)

    expected = settings.runtime_control_token
    if not expected:
        return JSONResponse(
            status_code=503,
            content={"detail": "运行时控制令牌未配置"},
        )

    provided = request.headers.get("X-Runtime-Token", "")
    if not hmac.compare_digest(provided, expected):
        return JSONResponse(status_code=401, content={"detail": "运行时调用未授权"})
    return await call_next(request)

# 注册路由
app.include_router(upload_router)
app.include_router(tasks_router)
app.include_router(clips_router)
app.include_router(export_router)


@app.on_event("startup")
async def startup_event():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    await start_task_runner()


@app.on_event("shutdown")
async def shutdown_event():
    await stop_task_runner()


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "ai-slice", "storage": "local"}
