<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/FFmpeg-007808?style=flat-square&logo=ffmpeg&logoColor=white" />
  <img src="https://img.shields.io/badge/FFmpeg.wasm-Browser-FF6600?style=flat-square&logo=ffmpeg&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" />
</p>

# ✂️ AI Slice — 直播切片自动剪辑 Agent

> 上传一场 6 小时直播回放，喝杯咖啡的时间，AI 帮你找到 10 个爆款切片、配好标题文案——一键导出 ZIP 切片包就能出片。

AI Slice 是一个端到端的直播切片工作站。它把 **浏览器端音频提取 → 语音识别 → 大模型内容理解 → 精彩片段定位 → FFmpeg 一键导出** 串成全自动 Pipeline，让新媒体运营从"看 6 小时回放找素材"变成"审核 AI 输出、一键出片"。

---

## 🎬 它能做什么

| 能力 | 说明 |
|------|------|
| **浏览器端音频提取** | FFmpeg.wasm 在浏览器内直接从视频提取音频（16kHz mono MP3），2.5 GB 视频 → ~30 MB 音频，**上传体积缩减 99%** |
| **智能识别高能片段** | 大模型解读转录文本，按"高能时刻 / 干货知识 / 搞笑互动 / 金句名言 / 带货亮点"五大维度打分筛选 |
| **时间点清单输出** | 每个精彩片段精确到秒的时间区间 + AI 标题文案，复制到剪映中一键裁切 |
| **浏览器端一键切片** | 基于 FFmpeg.wasm 在浏览器内按 AI 推荐时间段批量裁切视频，打包 ZIP 下载 |
| **🆕 爆款标题生成** | 一键生成 5 个抖音风格爆款标题（悬念/反常识/情绪化/数字化等多种风格） |
| **🆕 AI 剪辑思路** | 为每个切片生成结构化剪辑指导：特效时间点、配乐推荐、字幕贴纸、节奏控制、封面截取 |
| **爆款指数量化** | 1-10 分 Virality Score 帮你优先处理最有传播力的内容 |
| **语音转录** | Groq Whisper 云端转录，自动切分长音频 |
| **实时进度追踪** | SSE 实时推送 Pipeline 各阶段的处理进度 |
| **任务管理** | 任务列表看板、重命名、删除、重试，完整任务生命周期管理 |

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Vite + React 19)                    │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ FFmpeg.wasm    │  │  任务看板     │  │ 切片时间点清单    │    │
│  │ 浏览器端提取音频│  │  SSE 实时进度 │  │ 标题·文案·评分   │    │
│  │ WORKERFS 零拷贝│  │  重命名/删除  │  │ 一键导出操作栏   │    │
│  └───────┬────────┘  └──────────────┘  └──────────────────┘    │
│          │ POST /api/upload/audio (~30 MB)                      │
└──────────┼──────────────────────────────────────────────────────┘
           │ /api/*
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                             │
│                                                                 │
│  ┌─────────┐    ┌──────────────────────────────────────────┐   │
│  │ REST API │───▶│       Background Task Pipeline            │   │
│  │ + SSE    │    │                                          │   │
│  │          │    │  音频就绪 → ASR 转录                      │   │
│  └─────────┘    │  → DeepSeek 大模型分析精彩片段            │   │
│       │         │  → 输出时间点清单 / FFmpeg 视频切片       │   │
│       │         └──────────────────────────────────────────┘   │
│       ▼                                                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           切片导出 (浏览器端 FFmpeg.wasm)                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────┐                           ┌──────────┐          │
│  │PostgreSQL│                           │ 本地存储  │          │
│  │ 任务+切片 │                           │ ./storage │          │
│  └──────────┘                           └──────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### 双模式 Pipeline

项目支持两种处理模式，根据上传内容自动切换：

| 模式 | 触发条件 | 处理流程 | 输出 |
|------|----------|----------|------|
| **音频直传**（推荐） | 上传 `.mp3/.wav/.m4a/.ogg` | 跳过视频处理 → ASR 转录 → LLM 分析 | 时间点清单 + 标题文案 |
| **视频处理** | 上传完整视频文件 | 提取音频 → ASR 转录 → LLM 分析 → FFmpeg 切片 | MP4 视频切片 + 标题文案 |

默认使用**音频直传模式**：前端通过 FFmpeg.wasm 在浏览器内提取音频后上传，无需传输 GB 级视频文件。

### 导出方式

分析完成后，点击「✂️ 一键切片」即可在浏览器端通过 FFmpeg.wasm 按 AI 推荐时间段批量裁切，输出 ZIP 包含所有独立 MP4 切片文件。

---

## 🛠️ 技术栈

### 后端
- **Web 框架**：FastAPI (async) + Uvicorn
- **后台任务**：数据库轮询 Runner — 单机进程内串行执行长时间处理任务
- **数据库**：PostgreSQL + SQLAlchemy 2.0 (async) + Alembic 迁移
- **文件存储**：本地文件系统 (`./storage`)，零云服务依赖


### AI Pipeline
- **语音识别**：Groq Whisper — 云端转录，自动切分长音频
- **内容分析**：DeepSeek Chat API — 按 6000 Token 分批分析，自动去重合并
- **视频处理**：FFmpeg — 音频提取 (16kHz mono MP3 64k) + 精确切片 (libx264 重编码 / `-c copy` 快切)

### 前端
- **框架**：React 19 + TypeScript 6 + Vite 8
- **样式**：Tailwind CSS — Glassmorphism 暗色主题
- **音频提取**：FFmpeg.wasm (WORKERFS 零拷贝挂载，支持 4GB+ 视频)
- **上传**：Axios multipart 直传后端
- **实时通信**：SSE (Server-Sent Events) 进度推送

---

## 📁 项目结构

```
ai-slice/
├── backend/
│   ├── app/
│   │   ├── api/                          # REST API 路由
│   │   │   ├── upload.py                 #   POST /api/upload/video | /audio
│   │   │   ├── tasks.py                  #   CRUD /api/tasks + SSE 进度 + 重命名/删除/重试
│   │   │   ├── clips.py                  #   切片列表 + 下载 + 爆款标题 + 剪辑思路
│   │   │   └── export.py                 #   导出（预留扩展）
│   │   ├── models/
│   │   │   ├── database.py               #   Task / Clip ORM 模型
│   │   │   └── schemas.py                #   Pydantic 请求/响应 Schema
│   │   ├── services/
│   │   │   ├── analyzer.py               #   DeepSeek LLM 精彩片段分析
│   │   │   ├── clipper.py                #   FFmpeg 音频提取 + 视频切片
│   │   │   ├── editing_guide_generator.py #  🆕 AI 剪辑思路生成器
│   │   │   ├── ffmpeg_tools.py           #   FFmpeg 工具函数
│   │   │   ├── task_duration.py           #   视频时长自动补全（惰性 ffprobe）
│   │   │   ├── task_lifecycle.py          #   任务生命周期管理（重试/清理）
│   │   │   ├── task_progress.py           #   进度更新工具
│   │   │   ├── task_runner.py             #   后台任务轮询 Runner
│   │   │   ├── transcriber.py             #   Groq Whisper 语音转录
│   │   │   └── viral_title_generator.py   #  🆕 抖音爆款标题生成器
│   │   ├── workers/
│   │   │   └── pipeline.py               #   双模式异步处理 Pipeline
│   │   ├── config.py                     #   Pydantic Settings 配置
│   │   ├── db.py                         #   AsyncEngine + Session
│   │   ├── migrate.py                    #   数据库迁移辅助
│   │   └── main.py                       #   FastAPI 应用入口 (v0.2.0)
│   ├── alembic/                          # 数据库迁移
│   ├── tests/                            # 后端测试
│   ├── pyproject.toml                    # uv 项目配置 + 依赖声明
│   ├── uv.lock                           # uv 依赖锁定文件
│   └── .env.example
├── frontend/
│   ├── public/
│   │   └── ffmpeg/                       # FFmpeg.wasm core 文件 (COOP/COEP 同源加载)
│   └── src/
│       ├── pages/
│       │   ├── UploadPage.tsx             #   拖拽上传 + 浏览器端音频提取
│       │   ├── TaskListPage.tsx           #   任务看板（删除/重试）
│       │   └── TaskDetailPage.tsx         #   任务详情 + 切片清单 + 导出操作栏
│       ├── components/
│       │   ├── FileUploader.tsx           #   拖拽文件选择器
│       │   ├── TaskCard.tsx               #   任务卡片
│       │   ├── ClipCard.tsx               #   切片结果展示（含时间点复制）
│       │   ├── EditingGuideModal.tsx      #  🆕 AI 剪辑思路弹窗
│       │   ├── LocalClipExportModal.tsx   #   浏览器端一键切片弹窗
│       │   └── ProgressBar.tsx            #   进度条
│       ├── services/
│       │   ├── api.ts                     #   Axios API 封装
│       │   ├── audioExtractor.ts          #   FFmpeg.wasm 音频提取器
│       │   ├── ffmpegRuntime.ts           #   FFmpeg.wasm 运行时管理
│       │   └── videoClipExporter.ts       #   浏览器端视频裁切导出
│       ├── types/
│       │   └── task.ts                    #   TypeScript 类型定义
│       └── utils/
│           ├── clipTime.ts                #   切片时间格式化工具
│           ├── localClipExport.ts         #   本地切片导出工具
│           ├── taskApi.ts                 #   任务 API 辅助
│           ├── taskPolling.ts             #   任务轮询工具
│           ├── taskTime.ts                #   任务时间显示工具
│           ├── uploadFlow.ts              #   上传流程工具
│           └── videoFileMatch.ts          #   视频文件匹配工具
├── docs/                                 # 项目文档
│   └── 架构图.md                          #   系统架构说明
├── scripts/                              # 运维脚本
│   ├── start_windows.ps1                 #   Windows 一键启动
│   └── stop_windows.ps1                  #   Windows 停止服务
├── docker-compose.yml                    # PostgreSQL 一键启动
├── Makefile                              # 常用命令快捷入口
└── README.md
```

---

## 🚀 快速开始

### 前置要求

- Docker & Docker Compose
- Python 3.11+
- [uv](https://docs.astral.sh/uv/)（Python 包管理器）
- Node.js 18+
- FFmpeg (`brew install ffmpeg` / `apt install ffmpeg`)
- DeepSeek API Key（用于 AI 分析）
- Groq API Key（用于语音转录）

### 1. 启动基础设施

```bash
docker-compose up -d
# ✅ PostgreSQL → localhost:5432
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
# 编辑 .env，填入以下关键配置：
#   DEEPSEEK_API_KEY          （必填）
#   GROQ_API_KEY              （必填，语音转录）
#   STORAGE_DIR=./storage     （默认即可）
```

### 3. 启动后端（uv）

> 项目使用 [uv](https://docs.astral.sh/uv/) 管理 Python 依赖和虚拟环境。

```bash
cd backend

# 安装依赖（自动创建 .venv 虚拟环境）
uv sync

# 数据库迁移
uv run alembic upgrade head

# 启动 API 服务
uv run uvicorn app.main:app --reload --port 8001
```

也可以在仓库根目录使用 Makefile 快捷命令：

```bash
make sync           # 安装依赖
make dev            # 启动 API 服务
make db-upgrade     # 数据库迁移
```

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
# ✅ http://localhost:5173
```

Vite 已配置代理，`/api/*` 请求自动转发至 `http://localhost:8000`。

> **⚠️ 浏览器安全头**：FFmpeg.wasm 依赖 `SharedArrayBuffer`，需要 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp` 响应头。Vite dev server 已自动注入。

### 5. Windows 一键启停

Windows 开发环境可直接使用仓库根目录脚本：

```bat
start_windows.bat
```

这个脚本会自动：
- 关闭旧的后端 / 前端进程
- 检查 PostgreSQL 是否可用
- 重新启动 FastAPI 和 Vite
- 将日志写入 `logs/`

Windows 如果没有全局配置 FFmpeg，也可以把 `ffmpeg.exe` 和 `ffprobe.exe` 解压到：
- `tools/ffmpeg/bin`

一键脚本和后端会优先识别这个项目内目录，不强制要求写入系统 `PATH`。

只想停服务时可使用：

```bat
stop_windows.bat
```

如需显示服务窗口，可直接运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start_windows.ps1 -ShowWindows
```

---

## 📡 API 一览

### 核心接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/upload/audio` | 上传浏览器端提取的音频文件 (MP3/WAV/M4A/OGG) |
| `POST` | `/api/upload/video` | 上传完整视频文件（流式写入，支持 GB 级）|
| `POST` | `/api/tasks` | 创建切片任务（后台执行） |
| `GET` | `/api/tasks` | 任务列表 |
| `GET` | `/api/tasks/{id}` | 任务详情（含切片时间点清单） |
| `PATCH` | `/api/tasks/{id}/rename` | 重命名任务标题 |
| `POST` | `/api/tasks/{id}/retry` | 重试失败/已完成的任务 |
| `DELETE` | `/api/tasks/{id}` | 删除任务及关联切片数据 |
| `GET` | `/api/tasks/{id}/progress` | SSE 实时进度流 |
| `GET` | `/api/tasks/{id}/clips` | 切片列表（含下载 URL） |
| `GET` | `/api/clips/{id}/download` | 本地文件下载 |
| `POST` | `/api/clips/{id}/viral-titles` | 🆕 生成 5 个抖音风格爆款标题 |
| `POST` | `/api/clips/{id}/editing-guide` | 🆕 生成结构化 AI 剪辑思路 |
| `GET` | `/api/health` | 健康检查 |


启动后端后访问 http://localhost:8000/docs 查看完整 Swagger 文档。

---

## ⚙️ 环境变量说明

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `DATABASE_URL` | | `postgresql+asyncpg://slice:slice_dev@localhost:5432/ai_slice` | PostgreSQL 连接串 |
| `STORAGE_DIR` | | `./storage` | 本地文件存储目录（上传文件 + 切片输出） |
| `DEEPSEEK_API_KEY` | ✅ | | DeepSeek API 密钥（内容分析 + 爆款标题 + 剪辑思路） |
| `DEEPSEEK_BASE_URL` | | `https://api.deepseek.com` | DeepSeek API 地址 |
| `DEEPSEEK_MODEL` | | `deepseek-chat` | 使用的模型名 |
| `GROQ_API_KEY` | ✅ | | Groq API Key |
| `GROQ_ASR_MODEL` | | `whisper-large-v3-turbo` | Groq ASR 模型 |
| `GROQ_ASR_CHUNK_MINUTES` | | `25` | Groq 音频分段分钟数 |
| `TEMP_DIR` | | `/tmp/ai-slice` | Pipeline 临时文件目录 |
| `FFMPEG_BIN_DIR` | | | FFmpeg 可执行文件目录（Windows 可指向 `tools/ffmpeg/bin`） |

---

## 🧠 语音转录

使用 Groq Whisper 进行语音转录，支持长音频自动分段。

需要在 `.env` 中配置 `GROQ_API_KEY`。

---

## 🎬 一键切片说明

浏览器端通过 FFmpeg.wasm 直接在客户端完成视频裁切，无需上传完整视频到服务器：

- 点击「✂️ 一键切片」按钮，选择本地视频文件
- FFmpeg.wasm 按 AI 推荐时间段逐个裁切
- 所有切片打包为 ZIP 下载，文件按 `序号_标题.mp4` 命名

---

## ⚡ 性能瓶颈与优化

### Pipeline 各阶段耗时分布（6 小时直播回放基准）

```
┌──────────────────┬───────────┬────────────────────────────────────────┐
│ 阶段             │ 典型耗时   │ 瓶颈分析                               │
├──────────────────┼───────────┼────────────────────────────────────────┤
│ 浏览器端音频提取  │ 3~8 min   │ FFmpeg.wasm 单线程 WASM，无硬件加速     │
│ 音频上传         │ 5~30 sec  │ ~30 MB MP3，取决于网络带宽              │
│ 语音转录 (ASR)   │ 5~40 min  │ ⭐ 最大瓶颈 — 详见下方分析              │
│ LLM 分析         │ 1~3 min   │ DeepSeek API 多轮调用，受 API 限流影响  │
│ FFmpeg 切片      │ 1~5 min   │ libx264 重编码，CPU 密集                │
│ 浏览器端切片      │ 5~60 sec  │ FFmpeg.wasm 客户端裁切                  │
└──────────────────┴───────────┴────────────────────────────────────────┘
```

### 已解决的性能问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| **浏览器端 OOM** | `fetchFile()` 将整个视频复制到 WASM 内存，2.5 GB 视频需 ~5 GB 内存 | 改用 **WORKERFS** 零拷贝挂载，FFmpeg 按需惰性读取，内存占用降至 ~50 MB |
| **上传耗时过长** | 原方案直传 GB 级完整视频到服务器 | 浏览器端提取音频后仅上传 **~30 MB MP3**，体积缩减 99% |
| **长音频转录失败** | 云端 ASR 单文件大小限制 | 自动按配置分钟数切分音频，逐段转录后合并并修正时间偏移 |
| **SSE 进度丢失** | 多状态源可能不同步 | 进度统一写入 PostgreSQL，SSE 从数据库读取 |
| **MKV 时间戳偏移** | OBS 分段录制的 MKV 容器 PTS 起始值非零 | Pipeline 自动检测 `video_start_offset` 并修正转录时间戳 |

### 当前已知瓶颈

#### 1. 语音转录 — Pipeline 的最大瓶颈（占总耗时 60%+）

| 转录方案 | 6h 视频预估耗时 | 制约因素 |
|----------|----------------|----------|
| Groq Whisper | 取决于免费额度与网络 | 单文件大小限制 + 分段上传 + API 限流 |

**可优化方向**：
- 长音频分段后**并发**转录（当前是串行）
- 考虑 Groq / AssemblyAI 等高速云端 ASR 服务

#### 2. 浏览器端音频提取 — 前端侧最大耗时

- FFmpeg.wasm 运行在 **WASM 单线程**，无法利用多核 CPU 或 GPU 硬件编解码
- 6 小时视频在 M3 Pro 上约需 3-5 分钟（原生 FFmpeg 仅需 30 秒）
- **约为原生 FFmpeg 性能的 1/6 ~ 1/10**

**可优化方向**：
- FFmpeg.wasm 多线程版（需 `SharedArrayBuffer`，已具备前提条件）
- 使用 WebCodecs API 替代 FFmpeg.wasm 进行音频解码（浏览器原生，接近原生性能）

#### 3. LLM 分析 — 受限于 API 吞吐

- 6000 Token/批分片，6 小时直播约产生 **8-15 个批次**
- DeepSeek API 串行调用，每批 5-15 秒
- 多批次结果需去重合并（时间区间重叠 > 50% 保留高分项）

**可优化方向**：
- 批次间**并发**调用（注意 API rate limit）
- 增大单批 Token 窗口（DeepSeek 支持 64K context）
- 先用轻量模型粗筛，再用大模型精选

#### 4. FFmpeg 视频切片 — CPU 密集

- Pipeline 模式使用 `libx264 -preset fast -crf 23` 重编码，确保关键帧对齐
- 导出功能使用 `-c copy` 流拷贝，**无需重编码，速度提升 10x+**
- 音频直传模式下 Pipeline **完全跳过**此阶段（推荐使用）

**可优化方向**：
- Pipeline 模式也切换为 `-c copy`（牺牲精度换速度，可能出现开头黑帧）
- 多切片**并行** FFmpeg 进程
- 硬件加速编码（`h264_videotoolbox` macOS / `h264_nvenc` NVIDIA）

---

## 📜 License

MIT
