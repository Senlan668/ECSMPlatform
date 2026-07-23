# 直播切片自动剪辑 Agent — 设计文档

> **目标**：构建一个独立的 Web 应用，用户上传直播长视频，AI 自动提取精彩片段并输出粗切视频，供用户下载后在剪映中精修。

---

## 1. 项目定位

- **独立项目**，与 Auteur Studio 无关
- **MVP 范围**：上传 → 转录 → LLM 分析 → FFmpeg 粗切 → 下载
- **目标用户工作流**：上传直播录像 → AI 自动粗剪精彩片段 → 下载粗切视频 → 丢进剪映精修
- **不在 MVP 内**：字幕烧录、封面生成、多平台适配、剪映草稿导出、弹幕/音频多信号融合

---

## 2. 技术栈

| 层 | 技术 | 说明 |
|:---|:---|:---|
| **前端** | Vite + React | SPA，前后端分离 |
| **后端框架** | FastAPI | REST API + SSE 进度推送 |
| **任务队列** | ARQ（async Redis queue） | 轻量异步队列，比 Celery 简单 |
| **消息/缓存** | Redis | ARQ 队列 + 任务进度缓存 |
| **数据库** | PostgreSQL | 任务和切片元数据存储 |
| **文件存储** | 阿里云 OSS | 原始视频 + 切片视频存储 |
| **语音转录** | faster-whisper（GPU） / 阿里云 ASR（无 GPU） | 自适应选择 |
| **LLM** | DeepSeek | 精彩片段分析 |
| **视频处理** | FFmpeg | 音频提取 + 视频切片 |

---

## 3. 系统架构

```
┌──────────────────────────────────────────────────────────┐
│                    Vite + React 前端                       │
│                                                           │
│  ┌──────────┐  ┌───────────┐  ┌─────────────┐            │
│  │ 上传页面  │  │ 任务列表   │  │ 切片结果页   │            │
│  │ OSS 直传  │  │ 实时进度   │  │ 预览 + 下载  │            │
│  └──────────┘  └───────────┘  └─────────────┘            │
└────────────────────┬─────────────────────────────────────┘
                     │ REST API + SSE（进度推送）
┌────────────────────┴─────────────────────────────────────┐
│                  FastAPI 后端                               │
│                                                           │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐       │
│  │ Upload   │  │ Task      │  │ Clip             │       │
│  │ Service  │  │ Service   │  │ Service          │       │
│  │ STS 凭证  │  │ 任务调度   │  │ 切片结果管理    │       │
│  └────┬─────┘  └─────┬─────┘  └───────┬──────────┘       │
│       │              │                │                   │
│  ┌────┴──────────────┴────────────────┴──────────┐       │
│  │              ARQ Worker（异步任务执行）          │       │
│  │                                                │       │
│  │  Step 1: 从 OSS 下载视频到本地临时目录          │       │
│  │  Step 2: FFmpeg 提取音频（16kHz mono WAV）      │       │
│  │  Step 3: 语音转录（GPU/云端自适应）             │       │
│  │  Step 4: DeepSeek 分析精彩片段                  │       │
│  │  Step 5: FFmpeg 批量切片                        │       │
│  │  Step 6: 切片上传回 OSS + 写入数据库            │       │
│  │  Step 7: 清理临时文件                           │       │
│  └────────────────────────────────────────────────┘       │
└───────┬──────────────┬──────────────────┬─────────────────┘
        │              │                  │
   ┌────┴────┐   ┌─────┴─────┐   ┌───────┴───────┐
   │  Redis  │   │PostgreSQL │   │ 阿里云 OSS    │
   │ 任务队列 │   │ 任务/切片  │   │ 视频文件存储  │
   │ 进度缓存 │   │ 元数据     │   │              │
   └─────────┘   └───────────┘   └──────────────┘
```

### 关键设计决策

- **前端分片上传直传 OSS**：大文件不经过 FastAPI，前端通过 STS 临时凭证直传阿里云 OSS，减轻服务器压力
- **SSE 进度推送**：单向推送，比 WebSocket 实现简单，进度数据缓存在 Redis 中
- **ARQ Worker 与 FastAPI 同一 Python 项目**：共享代码（models、services），但可分进程部署
- **切片结果存 OSS**：用户通过签名 URL 下载，不走后端流量
- **GPU 自适应转录**：运行时检测 CUDA 是否可用，有 GPU 用 faster-whisper，无 GPU 降级到阿里云 ASR API

---

## 4. 数据模型

### Task 表

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `id` | UUID | 主键 |
| `status` | Enum | pending / transcribing / analyzing / clipping / done / failed |
| `video_filename` | String | 原始文件名 |
| `video_oss_key` | String | OSS 中的路径 |
| `video_duration` | Float | 视频时长（秒） |
| `progress` | Integer | 0-100 |
| `progress_message` | String | 当前步骤描述 |
| `transcript_json` | JSON | 转录结果（带时间轴） |
| `error_message` | String | 失败原因（可空） |
| `created_at` | DateTime | 创建时间 |
| `updated_at` | DateTime | 更新时间 |

### Clip 表

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `id` | UUID | 主键 |
| `task_id` | UUID | 外键关联 Task |
| `clip_index` | Integer | 切片序号 |
| `title` | String | LLM 生成的标题 |
| `summary` | String | 内容概要 |
| `clip_type` | String | 高能时刻 / 干货知识 / 金句名言 等 |
| `start_time` | Float | 起始秒数 |
| `end_time` | Float | 结束秒数 |
| `duration` | Float | 时长（秒） |
| `virality_score` | Integer | 精彩度 1-10 |
| `suggested_caption` | String | 推荐发布文案 |
| `oss_key` | String | 切片文件 OSS 路径 |
| `created_at` | DateTime | 创建时间 |

---

## 5. API 设计

| 方法 | 路径 | 说明 |
|:---|:---|:---|
| `POST` | `/api/upload/sts-token` | 获取 OSS STS 临时凭证，前端直传用 |
| `POST` | `/api/tasks` | 创建处理任务（传入 video_oss_key 和 video_filename） |
| `GET` | `/api/tasks` | 任务列表（分页） |
| `GET` | `/api/tasks/{id}` | 任务详情 |
| `GET` | `/api/tasks/{id}/progress` | SSE 进度流（实时推送） |
| `GET` | `/api/tasks/{id}/clips` | 获取该任务的切片列表 |
| `GET` | `/api/clips/{id}/download` | 获取切片签名下载 URL（302 重定向到 OSS） |
| `GET` | `/api/tasks/{id}/download-all` | 打包下载所有切片（签名 URL 列表或 ZIP） |

---

## 6. Pipeline 流程详情

### 进度分配

| 步骤 | 进度范围 | 耗时预估（6 小时视频） |
|:---|:---|:---|
| Step 1: 从 OSS 下载视频 | 0% → 10% | 1-5 分钟（取决于带宽） |
| Step 2: FFmpeg 提取音频 | 10% → 15% | 30 秒 - 2 分钟 |
| Step 3: 语音转录 | 15% → 60% | 5-20 分钟（GPU） / 10-40 分钟（云端） |
| Step 4: LLM 分析精彩片段 | 60% → 80% | 1-5 分钟（取决于转录文本长度和分批数） |
| Step 5: FFmpeg 批量切片 | 80% → 95% | 1-10 分钟（取决于切片数量） |
| Step 6: 上传切片到 OSS | 95% → 100% | 1-3 分钟 |

### 转录自适应策略

```python
def get_transcriber():
    """根据环境自动选择转录方案"""
    import torch
    if torch.cuda.is_available():
        return LocalWhisperTranscriber()   # faster-whisper + GPU
    else:
        return AliyunASRTranscriber()      # 阿里云语音识别 API
```

### LLM 分析策略

- 转录文本按 ~6000 Token 分批
- 每批独立调用 DeepSeek，输出切片方案 JSON
- 合并所有批次结果，按 virality_score 降序排列
- 去重处理（时间段重叠的合并取高分项）

### FFmpeg 切片策略

- 使用 `-ss` + `-to` 精确切割
- 重编码（`-c:v libx264 -c:a aac`）确保关键帧对齐，避免开头黑帧
- 使用 `-preset fast -crf 23` 平衡速度和画质

---

## 7. 前端页面

### 页面 1：首页 / 上传页

- 大面积拖拽上传区域
- 支持格式提示（MP4 / MKV / FLV / MOV）
- 文件选择后：文件名、大小、分片上传进度条
- 上传期间使用阿里云 OSS JS SDK 分片上传
- 上传完成后自动创建任务并跳转到任务详情页

### 页面 2：任务列表页

- 卡片式列表
- 每张卡片显示：文件名、状态标签、进度百分比、创建时间
- 状态标签颜色区分：进行中（蓝）、完成（绿）、失败（红）
- 点击卡片进入详情

### 页面 3：任务详情 / 切片结果页

- **处理中**：顶部进度条 + 当前步骤描述（SSE 实时推送）
- **完成后**：切片卡片网格
  - 标题 + 类型标签（高能 / 干货 / 金句）
  - 精彩度评分
  - 时间范围 `00:12:30 → 00:14:45`
  - 内容摘要
  - 推荐文案（复制按钮）
  - 下载按钮
- 底部：一键下载所有切片按钮

---

## 8. 项目结构

```
ai-slice/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI 入口
│   │   ├── config.py              # 配置（环境变量管理）
│   │   ├── db.py                  # 数据库连接（SQLAlchemy async）
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── upload.py          # STS 凭证接口
│   │   │   ├── tasks.py           # 任务 CRUD + SSE 进度
│   │   │   └── clips.py           # 切片结果 + 下载
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── oss.py             # 阿里云 OSS 封装
│   │   │   ├── transcriber.py     # 转录服务（GPU/云端自适应）
│   │   │   ├── analyzer.py        # DeepSeek LLM 精彩分析
│   │   │   └── clipper.py         # FFmpeg 切片执行
│   │   ├── workers/
│   │   │   ├── __init__.py
│   │   │   ├── pipeline.py        # ARQ 任务：完整 pipeline
│   │   │   └── settings.py        # ARQ Worker 配置
│   │   └── models/
│   │       ├── __init__.py
│   │       ├── database.py        # SQLAlchemy ORM 模型
│   │       └── schemas.py         # Pydantic 请求/响应模型
│   ├── alembic/                   # 数据库迁移
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── UploadPage.tsx     # 上传页
│   │   │   ├── TaskListPage.tsx   # 任务列表
│   │   │   └── TaskDetailPage.tsx # 任务详情 + 切片结果
│   │   ├── components/
│   │   │   ├── FileUploader.tsx   # OSS 分片上传组件
│   │   │   ├── ProgressBar.tsx    # 进度条
│   │   │   ├── TaskCard.tsx       # 任务卡片
│   │   │   └── ClipCard.tsx       # 切片结果卡片
│   │   ├── services/
│   │   │   ├── api.ts             # 后端 API 调用
│   │   │   └── oss.ts             # OSS 直传封装
│   │   └── styles/
│   │       └── index.css
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── docker-compose.yml             # Redis + PostgreSQL + 后端 + Worker
└── README.md
```

---

## 9. 错误处理

| 场景 | 策略 |
|:---|:---|
| 上传中断 | OSS 分片上传天然支持断点续传 |
| Worker 崩溃 | ARQ 自动重试（最多 3 次） |
| 转录失败 | 记录错误到 Task.error_message，状态设为 failed |
| LLM 返回格式异常 | JSON 解析失败时重试一次，仍失败则跳过该批次 |
| FFmpeg 切片失败 | 单个切片失败不影响其他切片，标记该切片为失败 |
| OSS 连接异常 | 上传/下载重试 3 次，超时报错 |

---

## 10. 部署方案

```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    depends_on: [redis, postgres]
    env_file: .env

  worker:
    build: ./backend
    command: arq app.workers.settings.WorkerSettings
    depends_on: [redis, postgres]
    env_file: .env

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ai_slice
      POSTGRES_USER: slice
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: ["pgdata:/var/lib/postgresql/data"]

volumes:
  pgdata:
```
