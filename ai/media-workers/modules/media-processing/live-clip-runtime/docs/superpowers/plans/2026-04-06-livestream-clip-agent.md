# 直播切片自动剪辑 Agent 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Web 应用，上传直播长视频 → AI 自动转录 → LLM 分析精彩片段 → FFmpeg 粗切 → 下载切片视频

**Architecture:** FastAPI 后端 + ARQ 异步任务队列 + Vite React 前端。视频存阿里云 OSS，元数据存 PostgreSQL，任务队列和进度缓存用 Redis。前端直传 OSS，后端 Worker 异步执行 pipeline。

**Tech Stack:** Python 3.11+, FastAPI, ARQ, SQLAlchemy (async), PostgreSQL, Redis, FFmpeg, faster-whisper, DeepSeek API, Vite, React, TypeScript, ali-oss

**Spec:** [设计文档](../specs/2026-04-06-livestream-clip-agent-design.md)

---

## Task 1: 项目脚手架 — 后端

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/db.py`
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`

- [ ] **Step 1: 创建 requirements.txt**

```txt
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy[asyncio]==2.0.35
asyncpg==0.30.0
alembic==1.14.0
pydantic-settings==2.5.0
arq==0.26.1
redis==5.1.0
oss2==2.19.0
openai==1.50.0
faster-whisper==1.0.3
librosa==0.10.2
pydub==0.25.1
python-multipart==0.0.12
httpx==0.27.0
```

- [ ] **Step 2: 创建 config.py**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://slice:slice@localhost:5432/ai_slice"
    
    # Redis
    redis_url: str = "redis://localhost:6379"
    
    # 阿里云 OSS
    oss_access_key_id: str = ""
    oss_access_key_secret: str = ""
    oss_bucket_name: str = ""
    oss_endpoint: str = ""
    oss_region: str = ""
    oss_role_arn: str = ""  # STS 角色 ARN
    
    # DeepSeek
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    
    # 阿里云 ASR（无 GPU 时备用）
    aliyun_asr_appkey: str = ""
    aliyun_asr_token: str = ""
    
    # Worker
    temp_dir: str = "/tmp/ai-slice"
    
    class Config:
        env_file = ".env"

settings = Settings()
```

- [ ] **Step 3: 创建 db.py**

```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        yield session
```

- [ ] **Step 4: 创建 main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="AI Slice - 直播切片自动剪辑")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
async def health():
    return {"status": "ok"}
```

- [ ] **Step 5: 创建 .env.example 和 __init__.py**

- [ ] **Step 6: 验证后端可启动**

```bash
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# 访问 http://localhost:8000/api/health → {"status": "ok"}
```

- [ ] **Step 7: Commit**

```bash
git add backend/
git commit -m "feat: scaffold backend with FastAPI, config, and database setup"
```

---

## Task 2: 数据库模型 + Alembic 迁移

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/database.py`
- Create: `backend/app/models/schemas.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`

- [ ] **Step 1: 创建 ORM 模型 database.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Float, Text, DateTime, ForeignKey, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.db import Base
import enum

class TaskStatus(str, enum.Enum):
    pending = "pending"
    downloading = "downloading"
    transcribing = "transcribing"
    analyzing = "analyzing"
    clipping = "clipping"
    uploading = "uploading"
    done = "done"
    failed = "failed"

class Task(Base):
    __tablename__ = "tasks"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(String(20), default=TaskStatus.pending)
    video_filename: Mapped[str] = mapped_column(String(500))
    video_oss_key: Mapped[str] = mapped_column(String(500))
    video_duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    progress_message: Mapped[str] = mapped_column(String(200), default="等待处理")
    transcript_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    clips: Mapped[list["Clip"]] = relationship(back_populates="task", cascade="all, delete-orphan")

class Clip(Base):
    __tablename__ = "clips"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tasks.id"))
    clip_index: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text)
    clip_type: Mapped[str] = mapped_column(String(50))
    start_time: Mapped[float] = mapped_column(Float)
    end_time: Mapped[float] = mapped_column(Float)
    duration: Mapped[float] = mapped_column(Float)
    virality_score: Mapped[int] = mapped_column(Integer)
    suggested_caption: Mapped[str] = mapped_column(Text)
    oss_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    task: Mapped["Task"] = relationship(back_populates="clips")
```

- [ ] **Step 2: 创建 Pydantic schemas.py**

```python
from pydantic import BaseModel
from datetime import datetime
from uuid import UUID

class TaskCreate(BaseModel):
    video_oss_key: str
    video_filename: str

class ClipResponse(BaseModel):
    id: UUID
    clip_index: int
    title: str
    summary: str
    clip_type: str
    start_time: float
    end_time: float
    duration: float
    virality_score: int
    suggested_caption: str
    oss_key: str | None
    download_url: str | None = None

class TaskResponse(BaseModel):
    id: UUID
    status: str
    video_filename: str
    progress: int
    progress_message: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    clips: list[ClipResponse] = []

class TaskListResponse(BaseModel):
    id: UUID
    status: str
    video_filename: str
    progress: int
    progress_message: str
    created_at: datetime
```

- [ ] **Step 3: 初始化 Alembic 并生成首次迁移**

```bash
cd backend
alembic init alembic
# 编辑 alembic/env.py 引入 Base.metadata
alembic revision --autogenerate -m "create tasks and clips tables"
alembic upgrade head
```

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "feat: add Task and Clip ORM models with Alembic migration"
```

---

## Task 3: API 路由 — 上传（STS）+ 任务管理

**Files:**
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/upload.py`
- Create: `backend/app/api/tasks.py`
- Create: `backend/app/api/clips.py`
- Create: `backend/app/services/__init__.py`
- Create: `backend/app/services/oss.py`

- [ ] **Step 1: 创建 OSS 服务 oss.py**

核心方法：
- `get_sts_token()` — 获取 STS 临时凭证供前端直传
- `generate_signed_url(oss_key)` — 生成签名下载 URL
- `download_file(oss_key, local_path)` — Worker 下载文件到本地
- `upload_file(local_path, oss_key)` — Worker 上传切片到 OSS

- [ ] **Step 2: 创建 upload.py 路由**

```python
@router.post("/api/upload/sts-token")
async def get_sts_token():
    """返回 STS 临时凭证，前端用于直传 OSS"""
    token = oss_service.get_sts_token()
    return token
```

- [ ] **Step 3: 创建 tasks.py 路由**

```python
@router.post("/api/tasks")
async def create_task(data: TaskCreate, db: AsyncSession):
    """创建处理任务，入队 ARQ"""

@router.get("/api/tasks")
async def list_tasks(db: AsyncSession):
    """任务列表"""

@router.get("/api/tasks/{task_id}")
async def get_task(task_id: UUID, db: AsyncSession):
    """任务详情"""

@router.get("/api/tasks/{task_id}/progress")
async def task_progress_sse(task_id: UUID):
    """SSE 实时进度流，从 Redis 读取"""
```

- [ ] **Step 4: 创建 clips.py 路由**

```python
@router.get("/api/tasks/{task_id}/clips")
async def list_clips(task_id: UUID, db: AsyncSession):
    """获取任务的切片列表"""

@router.get("/api/clips/{clip_id}/download")
async def download_clip(clip_id: UUID, db: AsyncSession):
    """返回签名下载 URL"""
```

- [ ] **Step 5: 在 main.py 注册所有路由**

- [ ] **Step 6: 验证 API 文档**

```bash
# 启动后访问 http://localhost:8000/docs → Swagger UI 显示所有接口
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add upload, task, and clip API routes with OSS service"
```

---

## Task 4: 核心 Services — 转录 + LLM 分析 + 切片

**Files:**
- Create: `backend/app/services/transcriber.py`
- Create: `backend/app/services/analyzer.py`
- Create: `backend/app/services/clipper.py`

- [ ] **Step 1: 创建 transcriber.py — 转录服务**

```python
class BaseTranscriber:
    async def transcribe(self, audio_path: str) -> list[dict]:
        """返回 [{"start": float, "end": float, "text": str}, ...]"""
        raise NotImplementedError

class LocalWhisperTranscriber(BaseTranscriber):
    """GPU 环境：faster-whisper 本地转录"""

class AliyunASRTranscriber(BaseTranscriber):
    """无 GPU：阿里云语音识别 API"""

def get_transcriber() -> BaseTranscriber:
    """运行时自动检测 GPU，选择转录方案"""
    try:
        import torch
        if torch.cuda.is_available():
            return LocalWhisperTranscriber()
    except ImportError:
        pass
    return AliyunASRTranscriber()
```

- [ ] **Step 2: 创建 analyzer.py — LLM 精彩分析**

核心逻辑：
- `_split_transcript()` — 按 ~6000 Token 分批
- `_call_deepseek(batch)` — 调用 DeepSeek API，返回切片方案 JSON
- `analyze(transcript)` — 分批分析 → 合并 → 按 virality_score 降序排列

- [ ] **Step 3: 创建 clipper.py — FFmpeg 切片**

核心方法：
- `extract_audio(video_path, audio_path)` — FFmpeg 提取音频 (16kHz mono WAV)
- `clip_video(video_path, start, end, output_path)` — FFmpeg 精确切片 (libx264 重编码)
- `batch_clip(video_path, clips, output_dir)` — 批量切片

- [ ] **Step 4: 单元测试核心逻辑**

```bash
# 测试 analyzer 的文本分批逻辑
# 测试 clipper 的时间格式转换
pytest tests/ -v
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add transcriber, analyzer, and clipper services"
```

---

## Task 5: ARQ Worker — Pipeline 串联

**Files:**
- Create: `backend/app/workers/__init__.py`
- Create: `backend/app/workers/pipeline.py`
- Create: `backend/app/workers/settings.py`

- [ ] **Step 1: 创建 pipeline.py — 完整处理流程**

```python
async def process_video(ctx: dict, task_id: str):
    """ARQ 任务：完整的视频处理 pipeline"""
    # Step 1: 从 OSS 下载视频 → 进度 0-10%
    # Step 2: FFmpeg 提取音频 → 进度 10-15%
    # Step 3: 语音转录 → 进度 15-60%
    # Step 4: DeepSeek 分析 → 进度 60-80%
    # Step 5: FFmpeg 批量切片 → 进度 80-95%
    # Step 6: 上传切片到 OSS + 写入 DB → 进度 95-100%
    # Step 7: 清理临时文件
```

每个步骤中通过 Redis 更新进度，同时更新 DB 中的 Task status。

- [ ] **Step 2: 创建 settings.py — ARQ 配置**

```python
from arq.connections import RedisSettings
from app.workers.pipeline import process_video
from app.config import settings

class WorkerSettings:
    functions = [process_video]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    max_jobs = 2
    job_timeout = 7200  # 2 小时超时
```

- [ ] **Step 3: 在 tasks.py 的 create_task 中入队 ARQ**

```python
@router.post("/api/tasks")
async def create_task(data: TaskCreate, db: AsyncSession):
    task = Task(...)
    db.add(task)
    await db.commit()
    # 入队
    redis = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    await redis.enqueue_job("process_video", str(task.id))
    return TaskResponse.model_validate(task)
```

- [ ] **Step 4: 验证 Worker 可启动**

```bash
arq app.workers.settings.WorkerSettings
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add ARQ worker with complete video processing pipeline"
```

---

## Task 6: Docker Compose — Redis + PostgreSQL

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/Dockerfile`

- [ ] **Step 1: 创建 docker-compose.yml**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ai_slice
      POSTGRES_USER: slice
      POSTGRES_PASSWORD: slice_dev
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
volumes:
  pgdata:
```

- [ ] **Step 2: 创建 backend/Dockerfile**

- [ ] **Step 3: 验证服务启动**

```bash
docker-compose up -d redis postgres
# 确认 Redis 和 PostgreSQL 可连接
```

- [ ] **Step 4: Commit**

```bash
git commit -m "infra: add Docker Compose for Redis and PostgreSQL"
```

---

## Task 7: 前端脚手架

**Files:**
- Create: `frontend/` (Vite + React + TypeScript)

- [ ] **Step 1: 初始化 Vite 项目**

```bash
cd /path/to/ai-slice
npx -y create-vite@latest frontend -- --template react-ts
cd frontend && npm install
```

- [ ] **Step 2: 安装依赖**

```bash
npm install react-router-dom ali-oss axios
npm install -D @types/react-router-dom
```

- [ ] **Step 3: 创建基础路由结构**

```
src/
├── App.tsx          # 路由配置
├── pages/
│   ├── UploadPage.tsx
│   ├── TaskListPage.tsx
│   └── TaskDetailPage.tsx
├── services/
│   ├── api.ts       # 后端 API 封装
│   └── oss.ts       # OSS 直传封装
└── components/
    ├── FileUploader.tsx
    ├── TaskCard.tsx
    ├── ClipCard.tsx
    └── ProgressBar.tsx
```

- [ ] **Step 4: 配置 Vite 代理**

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8000'
    }
  }
})
```

- [ ] **Step 5: 验证前端启动**

```bash
npm run dev
# http://localhost:5173 可访问
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: scaffold frontend with Vite + React + TypeScript"
```

---

## Task 8: 前端 — 上传页面

**Files:**
- Create: `frontend/src/pages/UploadPage.tsx`
- Create: `frontend/src/services/oss.ts`
- Create: `frontend/src/services/api.ts`
- Create: `frontend/src/components/FileUploader.tsx`

- [ ] **Step 1: 实现 api.ts — 后端 API 调用封装**
- [ ] **Step 2: 实现 oss.ts — OSS STS 直传封装**
- [ ] **Step 3: 实现 FileUploader 组件 — 拖拽 + 分片上传 + 进度条**
- [ ] **Step 4: 实现 UploadPage — 整合上传逻辑，上传完成后调 POST /api/tasks 跳转**
- [ ] **Step 5: 验证上传流程端到端**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat: implement upload page with OSS multipart upload"
```

---

## Task 9: 前端 — 任务列表 + 详情页

**Files:**
- Create: `frontend/src/pages/TaskListPage.tsx`
- Create: `frontend/src/pages/TaskDetailPage.tsx`
- Create: `frontend/src/components/TaskCard.tsx`
- Create: `frontend/src/components/ClipCard.tsx`
- Create: `frontend/src/components/ProgressBar.tsx`

- [ ] **Step 1: 实现 TaskListPage — 卡片列表 + 状态标签**
- [ ] **Step 2: 实现 TaskDetailPage — SSE 进度 + 切片结果网格**
- [ ] **Step 3: 实现 ClipCard — 标题/评分/文案/下载按钮**
- [ ] **Step 4: 实现 ProgressBar — 动态进度 + 步骤文字**
- [ ] **Step 5: 端到端验证完整流程**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat: implement task list and detail pages with SSE progress"
```

---

## Task 10: 前端 UI 美化 + 整体联调

**Files:**
- Modify: `frontend/src/styles/index.css`
- Modify: 所有页面和组件

- [ ] **Step 1: 设计整体 CSS 变量和主题**（暗色主题，渐变色，卡片阴影）
- [ ] **Step 2: 优化上传页动效**（拖拽高亮、上传动画）
- [ ] **Step 3: 优化任务列表页**（状态标签颜色、hover 效果）
- [ ] **Step 4: 优化切片结果页**（评分星级、文案复制交互）
- [ ] **Step 5: 全流程联调测试**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat: polish UI with dark theme and micro-animations"
```

---

## Task 11: README + 最终验证

**Files:**
- Create: `README.md`

- [ ] **Step 1: 编写 README**（项目介绍、技术栈、本地开发指南、环境变量说明）
- [ ] **Step 2: 完整端到端测试**（上传真实视频 → 转录 → 分析 → 切片 → 下载）
- [ ] **Step 3: Commit + Tag**

```bash
git commit -m "docs: add README with setup instructions"
git tag v0.1.0
```
