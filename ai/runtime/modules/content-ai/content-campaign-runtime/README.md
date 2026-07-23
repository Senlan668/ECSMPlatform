# 🚀 AI 内容运营助手

基于 **LangGraph 1.0+** / **FastAPI** / **Vue 3** 构建的全链路内容创作平台。
涵盖 AI 选题 → 文章撰写 → 配图生成 → **AI 海报生成** → **作品库管理** → **多平台内容适配** → **内容日历规划**。
支持 Docker Compose 一键部署，已落地阿里云 SAE 与腾讯云轻量服务器。

---

## ✨ 功能全景

### 📝 内容工作流
| 功能 | 说明 |
|------|------|
| AI 选题生成 | 根据主题方向自动生成候选选题，支持结构化展现 |
| AI 文章撰写 | 根据选定选题生成长文草稿，支持流式输出 |
| 沉浸式 UI | 单列居中布局，配备浮动"状态胶囊"切换器 |
| 抽屉控制台 | 一键滑出深色控制台，集成聚合后的执行日志与节点性能指标 |
| 状态持久化 | PostgreSQL + LangGraph Checkpointer |

### 🎨 AI 海报生成

#### 基础生成
| 模式 | 说明 |
|------|------|
| 🎯 自定义生成 | 输入提示词 + 风格标签 + 色调偏好，AI 直出海报 |
| 📋 模板生成 | 支持系统预置模板与个人模板，填写文案槽位，AI 基于约束生成 |

#### 图片编辑
| 模式 | 说明 |
|------|------|
| ✏️ 以图改图 | 上传原图 + 编辑指令，AI 局部修改 |
| 🎭 风格迁移 | 上传原图 + 目标风格标签，支持 light/medium/strong 三档强度 |

#### 批量与系列
| 模式 | 说明 |
|------|------|
| 📦 批量生成 | 多组提示词并发生成，支持 CSV 导入 |
| 🔗 系列一致性 | 系列模式下首图锚定风格，后续图自动保持一致 |
| 📡 SSE 进度流 | 实时推送批量任务进度 |

#### 精细化编辑
| 模式 | 说明 |
|------|------|
| 🖌️ 局部重绘 (Inpaint) | Canvas 涂抹遮罩 → AI 定向替换选区内容 |
| 🧹 智能擦除 (Erase) | Canvas 涂抹遮罩 → AI 自动补全背景 |
| 📐 尺寸适配 (Adapt) | 智能裁剪 / AI 扩图 两种策略切换 |
| 📦 全平台导出 (Export All) | 一键并发适配 5 大平台比例 |

### 🖼️ 作品库 & 素材中心
| 功能 | 说明 |
|------|------|
| 分页浏览 | 瀑布流展示所有 AI 生成作品，支持无限滚动加载 |
| 多维筛选 | 按模式、收藏状态、标签、关键词检索 |
| 批量操作 | 批量选中 → 批量打标签 / 批量删除，配备高颜值确认弹窗 |
| 作品详情 | 高清预览 + Prompt 回溯 + 风格参数查看 |
| 存为模板 | 将成功作品一键保存为个人模板，沉淀创作资产 |
| 收藏管理 | 收藏 / 取消收藏快速标记 |

### 📋 模板中心
| 功能 | 说明 |
|------|------|
| 系统模板 | 预置 6 大专业模板（小红书封面、知识干货、活动促销等） |
| 个人模板 | 用户自建模板，自定义 Prompt 模板 + 文案槽位 + 色调选项 |
| Fork 系统模板 | 将系统模板复制为个人副本，自由修改 |
| 模板编辑器 | 可视化定义 AI Prompt 模板，支持 `{vars}` 变量语法 |

### 🌐 多平台内容适配
| 功能 | 说明 |
|------|------|
| 多平台改写 | 一键将文章改写为小红书 / 抖音 / 微信公众号 / B站 / 微博风格 |
| 平台规则引擎 | 字数限制、图片比例、标签格式、语调风格自动适配 |
| 手机预览模拟 | 实时预览各平台 Feed 流样式（含手机壳 UI） |
| 智能标签推荐 | AI 根据文章内容为每个平台推荐热门标签 |
| 一键复制导出 | 复制文案+标签，快速粘贴到各平台发布 |

### 📅 内容日历
| 功能 | 说明 |
|------|------|
| 日历视图 | 可视化展示内容排期，支持按月切换 |
| AI 排期建议 | 结合热点日历，AI 自动生成发布计划 |
| 事件管理 | 创建 / 编辑 / 删除内容事件 |
| 热点追踪 | 内置热点数据库，自动提示即将到来的营销节点 |
| 一键创作 | 从排期事件直接跳转生成文章/海报 |

### 🏷️ 品牌包
| 功能 | 说明 |
|------|------|
| 品牌设置 | 品牌名称、Slogan、调性描述、核心色等全局品牌参数 |
| Logo 上传 | 上传品牌 Logo，关联到海报生成 |
| 风格规范 | 定义品牌设计规范，AI 生成时自动遵循 |

### 👤 个人中心
| 功能 | 说明 |
|------|------|
| 用户资料 | 头像上传、昵称修改、密码修改 |
| 创作统计 | 作品数、模板数、生成次数等数据概览 |
| 引擎偏好 | 可切换 AI 图片生成引擎（Gemini / GPT Image / Doubao） |
| 偏好设置 | 默认风格、色调等个性化配置 |

---

## 🛠 技术栈

### 📐 系统架构

```mermaid
graph TB
    subgraph Client["🖥️ 用户浏览器"]
        VUE["Vue 3 + Vite + TailwindCSS"]
    end

    subgraph Backend["⚙️ FastAPI 后端"]
        API["REST API Layer<br/>(11 路由模块)"]
        AUTH["JWT 认证<br/>Argon2 密码哈希"]

        subgraph Services["📦 业务服务层"]
            PS["海报服务<br/>(8 种生成模式)"]
            WF["工作流服务"]
            PA["平台适配服务"]
            CS["日历规划服务"]
            GS["作品库 / 模板 / 品牌服务"]
        end

        subgraph Graph["🔀 LangGraph 工作流引擎"]
            NODES["Planner → Writer → Visualizer"]
            SUB["选题交互子图<br/>(Human-in-the-loop)"]
            CKP["PostgreSQL Checkpointer<br/>(状态持久化)"]
        end

        subgraph Infra["🏗️ 基础设施"]
            LOG["structlog<br/>JSON 日志 + PII 脱敏"]
            MW["请求日志中间件"]
            LS["LangSmith 追踪"]
        end
    end

    subgraph AI["🤖 AI 服务"]
        LLM["Doubao Seed 系列<br/>(选题/写作/改写)"]
        IMG["图片生成引擎<br/>Gemini │ GPT Image │ Doubao Seedream"]
    end

    subgraph DB["🗄️ PostgreSQL 16"]
        TABLES["Users │ Posters │ Templates<br/>Gallery │ Calendar │ Brand<br/>Platform Variants │ Batch Tasks"]
        LGCP["LangGraph Checkpoint Tables"]
    end

    VUE -->|"HTTP / SSE"| API
    API --> AUTH
    API --> Services
    API --> Graph
    Services --> AI
    Graph --> AI
    Services --> DB
    Graph -->|"Checkpointer"| LGCP
    CKP --> LGCP
    LOG -.->|"记录"| MW
    LS -.->|"追踪"| Graph

    style Client fill:#1a1a2e,stroke:#e94560,color:#fff
    style Backend fill:#16213e,stroke:#0f3460,color:#fff
    style AI fill:#1a1a2e,stroke:#e94560,color:#fff
    style DB fill:#0f3460,stroke:#533483,color:#fff
    style Services fill:#1a1a2e,stroke:#533483,color:#fff
    style Graph fill:#1a1a2e,stroke:#e94560,color:#fff
    style Infra fill:#1a1a2e,stroke:#0f3460,color:#fff
```

### 📊 技术选型

| 层 | 技术 |
|----|------|
| 后端框架 | **FastAPI** (Python 3.13+) |
| 工作流引擎 | **LangGraph 1.0+** |
| 数据库 | **PostgreSQL 16** + SQLAlchemy 2.0 (async) + asyncpg |
| AI 图片 | **Gemini API** / **GPT Image** / **火山引擎 Doubao (Seedream)** (多引擎切换) |
| AI 文案 | 火山引擎 Doubao (Seed 系列) / 通用 OpenAI 兼容 LLM |
| 前端框架 | **Vue 3** + Vite |
| 样式 | **TailwindCSS** (现代 UI 组件体系) |
| 认证 | JWT Token (python-jose) + Argon2 密码哈希 |
| 日志 | **structlog** (JSON 结构化日志 + PII 脱敏) |
| 追踪 | **LangSmith** (LangGraph 工作流可观测性) |
| 容器化 | **Docker Compose** (PostgreSQL + FastAPI 一体化部署) |

---

## 🚀 快速开始

### ⚡ Docker Compose 一键启动（推荐）

```bash
# 克隆项目
git clone https://github.com/your-username/graph_xiaohongshu.git
cd graph_xiaohongshu

# 配置环境变量
cp .env.example .env
# 编辑 .env 填写 API Key 等配置

# 启动（PostgreSQL + FastAPI 后端）
docker compose up -d --build

# 启动前端
cd frontend && npm install && npm run dev
```

### 🖥️ Windows 一键启动

> Windows 下双击项目根目录的 `start.bat`，自动关闭旧进程并启动前后端。

```bash
start.bat
```

#### 1. 后端（手动方式）

```bash
# 确保 PostgreSQL 运行，创建数据库
psql -U postgres -c "CREATE DATABASE langgraph_db;"

python -m venv .venv

# Windows
call .venv\Scripts\activate.bat
# Linux / Mac
source .venv/bin/activate

pip install -r requirements.txt
```

#### 2. 配置 `.env`

```env
# ===== 数据库 =====
DATABASE_URL=postgresql+asyncpg://postgres:your_password@localhost:5432/langgraph_db
POSTGRES_URI=postgresql://postgres:your_password@localhost:5432/langgraph_db

# ===== LLM 配置（火山引擎 Doubao）=====
LLM_API_KEY=your_ark_api_key
LLM_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
LLM_MODEL=doubao-seed-1-8-251228
LLM_MODEL_FAST=doubao-seed-1-6-flash-250828

# ===== AI 图片引擎（多引擎切换）=====
IMAGE_PROVIDER=gemini              # gemini / gemini_ch / doubao / gpt_image

# Gemini 配置
IMAGE_API_KEY=your_gemini_api_key
IMAGE_BASE_URL=https://generativelanguage.googleapis.com
IMAGE_MODEL=gemini-3-pro-image-preview

# 豆包生图（复用 LLM_API_KEY）
DOUBAO_IMAGE_MODEL=doubao-seedream-4-5-251128

# ===== 日志 =====
LOG_LEVEL=INFO                     # DEBUG / INFO / WARNING / ERROR
LOG_TARGET=file                    # file / loki / aliyun / volcengine
LOG_PII_ANONYMIZE=true             # PII 脱敏（邮箱、API Key、手机号）

# ===== LangSmith 追踪（可选）=====
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langsmith_key
LANGCHAIN_PROJECT=xiaohongshu-content-assistant
```

#### 3. 启动后端

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

#### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 访问地址

| 入口 | 地址 |
|------|------|
| 前端页面 | http://localhost:3000 |
| API 文档 | http://localhost:8000/docs |

### 一键停止

```bash
# 双击 stop.bat 或在 CMD 中运行：
stop.bat
```

---

## 📡 API 接口总览

### 海报生成 `/api/v1/poster`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/templates` | 获取预置模板列表 |
| GET | `/templates/{index}` | 获取单个模板详情 |
| GET | `/style-tags` | 获取风格标签列表 |
| GET | `/aspect-ratios` | 获取支持的输出尺寸 |
| POST | `/generate-prompt` | 仅生成提示词（不生成图片） |
| POST | `/generate/custom` | 自定义生成 |
| POST | `/generate/template` | 模板生成（支持系统/个人模板） |
| POST | `/generate/edit` | 以图改图 |
| POST | `/generate/style-transfer` | 风格迁移 |
| POST | `/inpaint` | 局部重绘 |
| POST | `/erase` | 智能擦除 |
| POST | `/adapt` | 单比例尺寸适配 |
| POST | `/export-all` | 全平台一键导出 |

### 批量生成 `/api/v1/poster/batch`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/generate` | 提交批量任务 |
| GET | `/{task_id}/status` | 查询任务状态 |
| GET | `/{task_id}/stream` | SSE 实时进度 |
| GET | `/{task_id}/download` | 下载 ZIP 结果 |
| POST | `/{task_id}/retry` | 重试失败项 |

### 作品库 `/api/v1/gallery`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/list` | 分页获取作品列表 |
| GET | `/search` | 搜索作品 |
| GET | `/filters` | 获取筛选项 |
| GET | `/{work_id}` | 获取作品详情 |
| PUT | `/{work_id}` | 更新作品信息 |
| DELETE | `/{work_id}` | 删除作品 |
| POST | `/{work_id}/favorite` | 切换收藏状态 |
| POST | `/{work_id}/save-template` | 存为个人模板 |
| POST | `/batch-delete` | 批量删除 |
| POST | `/batch-tag` | 批量打标签 |

### 模板管理 `/api/v1/templates`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/list` | 获取模板列表（系统 + 个人） |
| POST | `/create` | 新建个人模板 |
| PUT | `/{template_id}` | 编辑个人模板 |
| DELETE | `/{template_id}` | 删除个人模板 |
| POST | `/{template_id}/duplicate` | Fork 系统模板为个人模板 |

### 内容工作流 `/api/v1/workflow`

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/start` | 启动工作流 |
| GET | `/state/{thread_id}` | 获取工作流状态 |
| POST | `/resume/{thread_id}` | 恢复工作流（选题 / 审核） |

### 多平台适配 `/api/v1/platform`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/rules` | 获取 5 大平台规则配置 |
| POST | `/adapt` | 单平台改写 |
| POST | `/adapt-all` | 一键全平台并发改写 |
| GET | `/variants/{thread_id}` | 获取某篇文章的所有平台版本 |
| GET | `/variant/{variant_id}` | 查询单个改写详情 |
| PUT | `/variant/{variant_id}` | 编辑改写版本 |
| DELETE | `/variant/{variant_id}` | 删除改写版本 |

### 内容日历 `/api/v1/calendar`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/events` | 获取日历事件列表 |
| POST | `/events` | 创建事件 |
| PUT | `/events/{event_id}` | 更新事件 |
| DELETE | `/events/{event_id}` | 删除事件 |
| POST | `/generate-plan` | AI 生成排期计划 |
| GET | `/plans` | 获取排期计划列表 |
| GET | `/hotspots` | 获取热点日历 |
| GET | `/hotspots/upcoming` | 获取即将到来的热点 |
| POST | `/events/{event_id}/create-content` | 从事件创建内容 |

### 品牌包 `/api/v1/brand`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/me` | 获取当前品牌包 |
| PUT | `/me` | 创建或更新品牌包 |
| POST | `/me/logo` | 上传品牌 Logo |
| DELETE | `/me` | 重置品牌包 |

### 个人中心 `/api/v1/profile`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/me` | 获取用户完整资料 |
| PUT | `/me` | 更新个人资料 |
| POST | `/avatar` | 上传头像 |
| PUT | `/password` | 修改密码 |
| GET | `/stats` | 获取创作统计数据 |
| GET | `/preferences` | 获取偏好设置 |
| PUT | `/preferences` | 更新偏好设置 |

---

## 📁 项目结构

```
graph_xiaohongshu/
├── app/                              # 后端 Python
│   ├── api/v1/
│   │   ├── auth.py                   # 认证 API（注册/登录）
│   │   ├── workflow.py               # 内容工作流 API
│   │   ├── poster.py                 # 海报生成 API（8 种模式）
│   │   ├── batch.py                  # 批量生成 API（含 SSE）
│   │   ├── gallery.py                # 作品库 API
│   │   ├── user_template.py          # 个人模板 CRUD API
│   │   ├── platform.py               # 多平台适配 API
│   │   ├── calendar.py               # 内容日历 API
│   │   ├── brand.py                  # 品牌包 API
│   │   ├── profile.py                # 个人中心 API
│   │   └── image.py                  # 通用图片 API
│   ├── data/
│   │   ├── poster_templates.json     # 预置海报模板配置
│   │   ├── style_tags.json           # 风格标签数据
│   │   ├── system_templates.py       # 6 大系统模板定义
│   │   ├── hotspot_calendar.py       # 热点日历数据
│   │   └── platform_rules.py         # 5 大平台规则配置
│   ├── services/
│   │   ├── poster_service.py         # 海报生成核心逻辑
│   │   ├── batch_service.py          # 批量 & 系列一致性逻辑
│   │   ├── gallery_service.py        # 作品库管理服务
│   │   ├── template_service.py       # 模板 CRUD 服务
│   │   ├── platform_adapter_service.py # 多平台文案改写服务
│   │   ├── calendar_service.py       # 日历事件管理服务
│   │   ├── calendar_planner_service.py # AI 排期规划服务
│   │   ├── brand_service.py          # 品牌包管理服务
│   │   ├── profile_service.py        # 用户资料 & 偏好服务
│   │   ├── llm_service.py            # LLM 服务封装（Doubao Seed）
│   │   └── image_service.py          # 图片生成服务（Gemini/GPT Image/Doubao）
│   ├── models/
│   │   ├── poster.py                 # 海报 / 模板 / 风格标签 ORM
│   │   ├── batch_task.py             # 批量任务 ORM
│   │   ├── platform_variant.py       # 平台改写版本 ORM
│   │   ├── calendar.py               # 日历事件 ORM
│   │   ├── brand.py                  # 品牌包 ORM
│   │   └── user.py                   # 用户 ORM
│   ├── graph/                        # LangGraph 工作流
│   │   ├── workflow.py               # 主工作流定义
│   │   ├── state.py                  # AgentState 状态定义
│   │   ├── metrics.py                # 节点性能指标收集
│   │   ├── utils.py                  # Checkpointer 管理
│   │   ├── nodes/                    # 工作流节点
│   │   │   ├── planner.py            # 选题生成节点
│   │   │   ├── writer.py             # 文章撰写节点
│   │   │   └── visualizer.py         # 配图生成节点
│   │   └── subgraphs/                # 子图
│   │       └── topic_selection.py     # 选题交互子图
│   ├── core/                         # 基础设施
│   │   ├── config.py                 # pydantic-settings 配置
│   │   ├── db.py                     # SQLAlchemy async 引擎
│   │   ├── security.py               # JWT 令牌生成与校验
│   │   ├── logger.py                 # structlog 日志系统
│   │   ├── middleware.py             # 请求日志中间件
│   │   ├── pii_anonymizer.py         # PII 脱敏处理器
│   │   └── callbacks.py              # LangChain 回调
│   ├── dependencies/                 # FastAPI 依赖注入
│   │   └── auth.py                   # 当前用户鉴权依赖
│   └── main.py                       # FastAPI 入口 & 生命周期
│
├── frontend/                         # 前端 Vue 3 + TailwindCSS
│   └── src/
│       ├── App.vue                   # 路由壳组件
│       ├── MainApp.vue               # 主应用页面（侧边栏 + 动态布局）
│       ├── WorkflowPage.vue          # 内容工作流主页
│       ├── PosterPage.vue            # 海报生成主页（7 大面板）
│       ├── GalleryPage.vue           # 作品库 & 素材中心
│       ├── TemplateCenterPage.vue    # 模板中心（系统 + 个人模板）
│       ├── PlatformPage.vue          # 多平台适配主页
│       ├── CalendarPage.vue          # 内容日历主页
│       ├── BrandPage.vue             # 品牌包设置页
│       ├── ProfilePage.vue           # 个人中心
│       ├── components/
│       │   ├── common/               # 通用组件（ConfirmModal 等）
│       │   ├── poster/               # 海报子组件（7 面板 + Canvas 编辑器）
│       │   ├── gallery/              # 作品库子组件
│       │   ├── template/             # 模板子组件（Preview/Editor）
│       │   ├── platform/             # 平台适配子组件
│       │   ├── calendar/             # 日历子组件
│       │   ├── brand/                # 品牌包子组件
│       │   ├── profile/              # 个人中心子组件
│       │   ├── workflow/             # 工作流子组件
│       │   └── layout/               # 布局组件（侧边栏等）
│       ├── router.js                 # Vue Router 路由配置
│       ├── api.js                    # API 客户端（统一封装）
│       └── style.css                 # 全局样式
│
├── scripts/                          # 工具脚本
│   ├── init_db.sql                   # 数据库初始化 SQL
│   ├── seed_templates.py             # 系统模板 Seed 脚本
│   └── test_*.py                     # API 测试脚本
├── static/                           # 静态资源 & 生成图片
├── logs/                             # structlog 日志输出
├── docker-compose.yml                # Docker Compose 编排
├── Dockerfile                        # Docker 镜像构建
├── DEPLOYMENT.md                     # 阿里云 SAE 部署文档
├── DEPLOYMENT_TENCENT.md             # 腾讯云轻量服务器部署文档
├── start.bat                         # 一键启动（Windows）
├── stop.bat                          # 一键停止（Windows）
├── requirements.txt
├── .env                              # 本地环境变量
├── .env.production                   # 生产环境变量
└── README.md
```

---

## ⚠️ 注意事项

1. **数据库**: 确保 PostgreSQL 16+ 运行且可访问，或使用 `docker compose up` 自动拉起
2. **API Key**: 在 `.env` 中配置对应引擎的 API Key（Gemini / GPT Image / Doubao）
3. **图片存储**: 生成的海报保存在 `static/images/posters/`，需确保目录可写
4. **并发控制**: 批量生成使用 `Semaphore(3)` 限流；全平台导出使用 `Semaphore(2)` 限流
5. **多引擎切换**: 用户可在个人中心设置 AI 图片引擎偏好，支持 Gemini、GPT Image、Doubao (Seedream)
6. **日志系统**: structlog JSON 结构化日志输出到 `logs/` 目录，内置 PII 脱敏
7. **部署文档**: 详见 `DEPLOYMENT.md`（阿里云 SAE）和 `DEPLOYMENT_TENCENT.md`（腾讯云轻量服务器）

## 📄 License

MIT

---

## 数据库迁移（pg_dump）

适用于可停机的逻辑迁移，命令以 Windows PowerShell 为例。

1. A 机器导出
```powershell
New-Item -ItemType Directory -Path C:\temp -Force
pg_dump -F c -h <A_HOST> -U postgres -d langgraph_db -f "C:\temp\langgraph_db.dump"
```

2. 传输到 B 机器（scp / WinSCP / 共享盘任选其一）

3. B 机器建库（已存在可跳过）
```bash
createdb -h <B_HOST> -U postgres langgraph_db
```

4. B 机器导入
```bash
pg_restore -h <B_HOST> -U postgres -d langgraph_db -v /path/to/langgraph_db.dump
```

可选：覆盖已有对象
```bash
pg_restore -h <B_HOST> -U postgres -d langgraph_db --clean --if-exists -v /path/to/langgraph_db.dump
```

注意：
- `pg_dump/pg_restore` 版本尽量与源库一致，目标库版本不低于源库
- 若需迁移角色/权限：`pg_dumpall --globals-only > globals.sql`，再在 B 机器执行 `psql -f globals.sql`
