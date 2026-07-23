# AiWxChat - 销售课程 AI 知识库

一个专为**销售课程场景**设计的微信聊天记录 AI 系统，支持聊天记录查看、智能问答、数据标注、知识提炼、素材管理和高质量训练数据导出。

> 💡 **核心场景**：从微信销售聊天记录中提炼高质量的销售话术、异议处理、成交转化等数据，用于训练销售 AI 助手。

## 🎯 核心特性

- ⚡ **一键启动** - Docker Compose 容器化部署
- 🎨 **现代 UI** - 仿微信聊天界面，暗色主题，响应式设计
- 🤖 **AI 驱动** - 自动分类、质量评分、RAG 智能问答、知识提炼
- 🏷️ **可视化标注** - 人工审核 + AI 辅助标注，一键处理全部会话
- 📦 **多格式导出** - 支持 ShareGPT / Alpaca / OpenAI / JSONL 训练格式
- 🛡️ **数据安全** - 敏感信息脱敏、垃圾过滤、笔刷打码
- 📂 **素材管理** - 课程文档、成交喜报上传与管理，支持 TOS 对象存储、自定义标签
- 🎓 **学生管理** - 学生信息录入、AI 图片识别批量导入
- 🔐 **用户认证** - JWT 登录认证，角色权限控制
- 📝 **AI 考核** - 基于知识库自动出题、AI 评分、成绩统计

## ✨ 功能模块

### 📱 聊天记录管理
- 仿微信 UI 的聊天时间线视图
- 会话列表，支持私聊/群聊筛选
- 消息全文搜索与上下文跳转
- 自动识别销售对话场景

### 🧠 AI 智能问答
- **语义搜索** - 基于向量 Embedding 的智能检索
- **RAG 问答** - 流式输出，销售话术、异议处理快速查询
- **知识库构建** - 自动切片、向量化存储
- **场景分类** - 自动识别销售/课程/异议/成交场景

### 💡 知识提炼（Extractor）
- 从聊天记录和标注数据中自动提炼销售知识
- 结构化输出：场景 → 客户话术 → 推荐回复 → 关键要点
- 支持按场景分类浏览和人工审核
- 置信度评分，辅助质量判断

### 🛠️ 后台管理系统
- **会话级统计** - 总会话数、已处理、未处理进度条
- **一键处理全部** - 自动循环处理所有未处理会话，带实时进度
- **分批处理** - 支持单批次处理，快速响应
- **暂存区管理** - 待审核/已通过/已拒绝状态筛选
- **批量操作** - 批量通过、拒绝、删除
- **时间过滤** - 默认只处理 2025年10月及之后的数据
- **清理旧数据** - 一键清理过期和群聊暂存区数据

### 🏷️ 数据标注中心
- **AI 预标注** - 自动分类和质量评分
- **人工审核** - 可视化标注界面，快速分类
- **对话编辑** - 修改清洗后的对话内容
- **批量审核** - 高效处理大量数据
- **原始对照** - 查看原始消息与清洗后对照

### 📂 素材库
- **课程文档** - 课程资料上传与管理
- **成交喜报** - 喜报海报分文件夹管理
- **聊天素材** - 聊天截图管理，支持笔刷打码
- **标签管理** - 自定义多标签，按标签筛选，标签建议与自动补全
- **文件管理** - 上传、预览、下载、删除
- **TOS 对象存储** - 支持火山引擎 TOS 云存储

### 🎓 学生管理
- 学生信息 CRUD（姓名、渠道、薪资、班级等）
- AI 图片识别批量导入（拍照识别学生信息表）
- 按班级、状态、渠道筛选
- 搜索与分页

### ✏️ 自定义数据
- 手动录入训练数据（Q&A 对）
- 补充真实聊天以外的高质量训练样本

### 📤 训练数据导出
- **多格式支持** - ShareGPT / Alpaca / OpenAI / JSONL
- **质量筛选** - 高/中/低质量分级
- **场景过滤** - 按销售/课程/异议等分类导出
- **LLM 评分** - 可选 AI 质量评估
- **智能去重** - 移除相似对话

### 📝 AI 考核
- 基于知识库和标注数据自动生成销售场景考题
- AI 自动评分和详细评语
- 考核记录管理，支持人工复核
- 按场景分类出题（销售/异议/成交等）

### 🛡️ 数据安全
- **敏感信息脱敏** - 自动隐藏手机号、身份证等
- **垃圾过滤** - 移除无意义内容
- **笔刷打码** - 手动涂抹打码聊天截图中的敏感区域
- **时间过滤** - 可配置数据时间范围

## 🏗️ 技术架构

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           React Frontend (SPA)                          │
│  PrimarySidebar │ ChatView │ AIChat │ AdminView │ MaterialView │ Quiz  │
│  SearchView │ ExportView │ LabelingView │ ExtractorView │ Students     │
│  CustomDataView │ LoginPage │ ConfirmDialog │ Toast                     │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │ REST API (JWT Auth)
┌──────────────────────────────▼───────────────────────────────────────────┐
│                           FastAPI Backend                                │
│                                                                          │
│  ┌─ Routers ─────────────────────────────────────────────────────────┐  │
│  │ chats │ search │ knowledge │ export │ labeling │ admin │ auth     │  │
│  │ materials │ students │ extractor │ custom │ filter │ quiz         │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌─ Services ────────────────────────────────────────────────────────┐  │
│  │ rag │ rag_distiller │ rag_rewriter │ knowledge │ embedding        │  │
│  │ admin │ etl │ filter │ training_data │ quality_scorer              │  │
│  │ extractor │ data_generator │ quiz │ auth │ mask_service            │  │
│  │ tos_service │ vision_service │ schema_sync                        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│  ┌─ Deps ────────────────────────────────────────────────────────────┐  │
│  │ get_current_user │ get_optional_user │ require_admin              │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└───┬──────────────┬──────────────┬──────────────┬──────────────┬─────────┘
    │              │              │              │              │
┌───▼────────┐ ┌───▼──────┐ ┌────▼──────┐ ┌────▼──────────┐ ┌──▼──────────┐
│PostgreSQL  │ │Embedding │ │DeepSeek/  │ │ TOS 对象存储   │ │ 豆包视觉 AI  │
│17+pgvector │ │DashScope │ │OpenAI LLM │ │ (素材文件)     │ │ (火山方舟)   │
│            │ │(云端API) │ │           │ │               │ │             │
└────────────┘ └──────────┘ └───────────┘ └───────────────┘ └─────────────┘
```

### 核心技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | React 18 + TypeScript | 现代化 SPA，仿微信暗色主题 |
| | TailwindCSS 3.4 | 实用优先 CSS 框架 |
| | Vite 5 | 闪电级构建与 HMR |
| | React Router 6 | 前端路由 |
| | Axios + Lucide React | HTTP 客户端 + 图标库 |
| **后端** | FastAPI | 高性能异步 API（自动 Swagger 文档） |
| | SQLAlchemy + Pydantic | ORM + 数据验证 |
| | python-jose (JWT) | 用户认证与权限控制 |
| | uv | Python 依赖管理与运行 |
| **数据库** | PostgreSQL 17 + pgvector | 关系数据 + 向量检索 |
| **AI / ML** | DashScope API | 云端 Embedding（text-embedding-v3） |
| | DeepSeek / OpenAI | LLM 问答、质量评分、知识蒸馏 |
| | 豆包视觉模型（火山方舟） | 图片 AI 识别（学生信息批量导入） |
| **存储** | 火山引擎 TOS | 素材文件云存储 |
| **部署** | Docker Compose | 容器化一键部署 |
| | Nginx | 前端静态资源托管 + 反向代理 |

## 🚀 快速开始

### 方式一：Docker Compose（推荐）

```bash
# 启动所有服务（PostgreSQL + 后端 + 前端）
docker compose up -d

# 查看日志
docker compose logs -f backend

# 停止服务
docker compose down
```

访问：
- 前端: http://localhost:80（Docker）或 http://localhost:3000（开发模式）
- API 文档: http://localhost:8000/docs


### 方式二：本地开发

#### 1. 启动数据库（Docker）

```bash
# 启动 PostgreSQL + pgvector（首次自动建表并导入开发数据，无需手动迁移）
docker compose -f docker-compose.db.yml up -d

# 如需重置数据
docker compose -f docker-compose.db.yml down -v && docker compose -f docker-compose.db.yml up -d
```

#### 2. 后端

```bash
cd backend

# 安装 uv（如未安装）
curl -LsSf https://astral.sh/uv/install.sh | sh

# 安装依赖
uv sync

# 配置环境变量
cp env.example .env
# 编辑 .env 配置 API Key

# 启动后端
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

#### 3. 前端

```bash
cd frontend
npm install
npm run dev
# 访问 http://localhost:3000
```

## 📖 使用流程

### 1️⃣ 导入数据

将微信聊天记录文件放到 `Msg/Msg/` 目录，然后运行 ETL：

```bash
cd backend
python scripts/run_etl.py
```

或在后台管理界面点击触发 ETL 导入。

### 2️⃣ 后台管理 - 数据处理

- 打开后台管理页面，查看会话处理进度
- 点击 **"一键处理全部"** 自动将所有会话转换为对话块
- 系统自动过滤垃圾消息、脱敏、分类、评分

### 3️⃣ 数据标注

- 在暂存区列表中审核 AI 预标注结果
- 为对话选择分类标签（销售话术/课程咨询/异议处理等）
- 通过或拒绝对话，支持批量操作

### 4️⃣ AI 问答（可选）

- 点击侧边栏 AI 问答，构建知识库
- 基于已标注数据进行 RAG 语义问答

### 5️⃣ 知识提炼（可选）

- 从已标注对话和知识库中自动提炼结构化销售知识
- 审核并确认提炼结果

### 6️⃣ 导出训练数据

- 选择导出格式和筛选条件
- 预览数据统计和样例
- 下载 JSON 文件用于模型训练

## 📁 项目结构

```
AiWxChat/
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── main.py            # 应用入口（lifespan 管理）
│   │   ├── config.py          # 配置管理（Pydantic Settings）
│   │   ├── deps/              # 依赖注入
│   │   │   └── __init__.py    # 认证依赖（get_current_user / require_admin）
│   │   ├── models/            # 数据模型
│   │   │   ├── database.py    # 数据库连接（SQLAlchemy Engine）
│   │   │   ├── chat.py        # 聊天/标注/知识/素材/考核模型
│   │   │   ├── user.py        # 用户模型（角色权限）
│   │   │   └── student.py     # 学生模型
│   │   ├── routers/           # API 路由
│   │   │   ├── chats.py       # 聊天记录
│   │   │   ├── search.py      # 搜索
│   │   │   ├── knowledge.py   # 知识库 / RAG
│   │   │   ├── admin.py       # 后台管理（会话处理）
│   │   │   ├── labeling.py    # 数据标注
│   │   │   ├── export.py      # 训练数据导出
│   │   │   ├── extractor.py   # 知识提炼
│   │   │   ├── materials.py   # 素材库（TOS 云存储）
│   │   │   ├── students.py    # 学生管理
│   │   │   ├── custom.py      # 自定义数据
│   │   │   ├── auth.py        # 用户认证（JWT）
│   │   │   ├── quiz.py        # AI 考核试卷
│   │   │   └── filter.py      # 内容过滤
│   │   └── services/          # 业务逻辑
│   │       ├── admin.py       # 后台管理服务
│   │       ├── etl.py         # 微信数据 ETL 导入
│   │       ├── embedding.py   # 向量化服务（DashScope 云端）
│   │       ├── knowledge.py   # 知识库构建与管理
│   │       ├── rag.py         # RAG 问答
│   │       ├── rag_distiller.py  # 知识蒸馏（自动提炼话术）
│   │       ├── rag_rewriter.py   # RAG 查询改写与优化
│   │       ├── extractor.py   # 结构化知识提炼
│   │       ├── filter.py      # 内容过滤与脱敏
│   │       ├── training_data.py  # 训练数据生成
│   │       ├── data_generator.py # 数据生成器
│   │       ├── quality_scorer.py # LLM 质量评分
│   │       ├── quiz.py        # 考核试卷生成与评分
│   │       ├── auth.py        # 认证服务（JWT 编解码）
│   │       ├── mask_service.py   # 图片笔刷打码
│   │       ├── tos_service.py    # 火山引擎 TOS 对象存储
│   │       ├── vision_service.py # 豆包视觉 AI（图片识别）
│   │       ├── schema_sync.py    # 数据库 Schema 自动补丁
│   │       └── staging_text.py   # 暂存区文本处理
│   └── scripts/
│       ├── run_etl.py         # ETL 执行脚本
│       ├── explore_db.py      # 数据库探索
│       ├── build_knowledge.py # 知识库批量构建
│       ├── import_knowledge.py # 外部知识导入
│       ├── export_materials_rag.py # 素材 RAG 导出
│       ├── clean_training_data.py  # 训练数据清洗
│       ├── migrate_db.py      # 数据库迁移
│       └── add_system_prompt_column.py # Schema 补丁
│
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── App.tsx            # 应用入口（路由 + 布局）
│   │   ├── components/        # UI 组件
│   │   │   ├── PrimarySidebar.tsx  # 主侧边栏导航
│   │   │   ├── Sidebar.tsx        # 会话列表侧边栏
│   │   │   ├── ChatView.tsx       # 聊天视图（仿微信 UI）
│   │   │   ├── SearchView.tsx     # 搜索视图
│   │   │   ├── AIChat.tsx         # AI 问答（RAG 流式输出）
│   │   │   ├── AdminView.tsx      # 后台管理
│   │   │   ├── LabelingView.tsx   # 数据标注
│   │   │   ├── ExportView.tsx     # 导出界面
│   │   │   ├── ExtractorView.tsx  # 知识提炼
│   │   │   ├── MaterialView.tsx   # 素材库（上传/打码/TOS）
│   │   │   ├── StudentManagement.tsx # 学生管理
│   │   │   ├── CustomDataView.tsx # 自定义数据
│   │   │   ├── QuizView.tsx       # AI 考核
│   │   │   ├── LoginPage.tsx      # 登录页
│   │   │   ├── ConfirmDialog.tsx  # 确认弹窗
│   │   │   └── Toast.tsx          # Toast 通知组件
│   │   ├── contexts/          # React Context
│   │   │   ├── AuthContext.tsx # 认证状态管理
│   │   │   └── ToastContext.tsx # Toast 通知上下文
│   │   ├── utils/             # 工具模块
│   │   │   └── errorMessage.ts # 错误信息格式化
│   │   ├── api.ts             # Axios API 封装
│   │   ├── types.ts           # TypeScript 类型定义
│   │   └── utils.ts           # 通用工具函数
│   └── package.json
│
├── scripts/                    # 数据处理脚本
│   ├── generate_fake_data.py  # 生成假微信数据（开发用）
│   ├── build_dual_rag.py      # 双通道 RAG 构建
│   ├── clean_rag_csv.py       # RAG 数据清洗
│   └── clean_script_library.py # 话术库数据清洗
│
├── docs/                       # 项目文档
├── Msg/                        # 微信数据库（需自行放置）
│   └── Msg/
│       ├── MicroMsg.db        # 通讯录
│       └── Multi/MSG0-5.db    # 聊天记录
│
├── docker/                     # Docker 相关配置
│   └── initdb/                # 数据库初始化脚本（容器首次启动自动执行）
│       ├── 00-extensions.sql  # 启用 pgvector 扩展
│       └── 01-data.sql        # 建表 + 开发数据
│
├── docker-compose.yml          # Docker 编排（PostgreSQL + Backend + Frontend）
├── docker-compose.db.yml       # 仅数据库（本地开发用）
├── docker-compose.prod.yml     # 生产环境覆盖配置
├── AGENTS.md                   # AI Agent 开发指引
├── DEPLOY.md                   # 部署文档
└── README.md
```

## 🔧 配置说明

`.env` 文件配置项：

```bash
# ─── 数据库 ───
DATABASE_URL=postgresql://postgres:password@localhost:5432/aiwxchat

# ─── 云端 Embedding API（DashScope） ───
ARK_API_KEY=sk-xxx
ARK_EMBEDDING_MODEL=text-embedding-v3
ARK_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# ─── 豆包视觉模型（火山方舟，AI 图片识别，可选） ───
ARK_VISION_API_KEY=xxx
ARK_VISION_MODEL=ep-xxx
ARK_VISION_BASE_URL=https://ark.cn-beijing.volces.com/api/v3

# ─── LLM API（RAG 问答、质量评分、知识蒸馏） ───
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# ─── 微信数据路径 ───
WECHAT_DB_PATH=../Msg/Msg
VOICE_FILE_PATH=../FileStorage/Voice

# ─── TOS 对象存储（素材库，可选） ───
TOS_ACCESS_KEY=xxx
TOS_SECRET_KEY=xxx
TOS_BUCKET=xxx
TOS_ENDPOINT=https://tos-cn-beijing.volces.com
TOS_REGION=cn-beijing
TOS_PATH_PREFIX=                      # 路径前缀（区分 dev/prod 环境）

# ─── RAG 检索配置 ───
RAG_ARTICLE_SIMILARITY_THRESHOLD=0.55  # knowledge_articles 最低相似度
RAG_CHUNK_SIMILARITY_THRESHOLD=0.40    # knowledge_chunks 最低相似度
RAG_LLM_MAX_TOKENS=1500               # LLM 回答最大 token 数
RAG_CONTEXT_MAX_CHARS=6000             # 拼给 LLM 的上下文最大字符数

# ─── JWT 认证 ───
JWT_SECRET_KEY=your-secret-key
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7

# ─── 服务配置 ───
APP_ENV=dev                            # dev / prod
```

## 📊 数据导出格式

### ShareGPT 格式（推荐）

用于 LLaMA-Factory、FastChat 微调：

```json
{
  "id": "abc123",
  "conversations": [
    {"from": "system", "value": "你是一位专业的课程销售顾问。"},
    {"from": "human", "value": "这个课程多少钱？"},
    {"from": "gpt", "value": "现在活动价4666元，包含..."}
  ],
  "category": "sales",
  "quality": "high"
}
```

### Alpaca 格式

用于 Stanford Alpaca 指令微调：

```json
{
  "instruction": "这个课程多少钱？",
  "input": "",
  "output": "现在活动价4666元，包含...",
  "category": "sales"
}
```

### OpenAI Chat 格式

用于 OpenAI Fine-tuning API：

```json
{
  "messages": [
    {"role": "system", "content": "你是一位专业的课程销售顾问。"},
    {"role": "user", "content": "这个课程多少钱？"},
    {"role": "assistant", "content": "现在活动价4666元..."}
  ]
}
```

### 数据分类

| 分类 | 说明 | System Prompt |
|------|------|--------------|
| **sales** | 销售话术 | 专业的课程销售顾问 |
| **course** | 课程咨询 | 专业的课程咨询师 |
| **objection** | 异议处理 | 经验丰富的销售顾问，擅长化解异议 |
| **closing** | 成交转化 | 专业的成交顾问，擅长引导客户完成报名 |
| **followup** | 客户跟进 | 贴心的客户服务顾问 |
| **qa** | 问答 | 知识分享顾问 |

## 📡 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| 前端（开发） | 3000 | Vite dev server |
| 前端（Docker） | 80 | Nginx |
| 后端 API | 8000 | FastAPI |
| PostgreSQL | 5432 | 数据库 |
| API 文档 | 8000/docs | Swagger UI |

## ❓ 常见问题

### Q: 如何获取微信聊天数据库？
使用第三方工具（如 WeChatMsg）导出微信聊天记录为 `.db` 文件，放置到 `Msg/Msg` 目录。

### Q: 不配置 LLM API 可以使用吗？
可以。基础功能（查看、搜索、标注）不需要 LLM。AI 问答、知识提炼、LLM 质量评分需要配置 API Key。

### Q: SQLite 和 PostgreSQL 如何选择？
推荐使用 **PostgreSQL + pgvector**，支持向量检索和大数据量。项目默认配置为 PostgreSQL。

### Q: 后台管理显示大量未处理数据？
点击"一键处理全部"按钮，系统会自动循环处理所有待处理会话。处理过程中会显示实时进度。空内容会话会被自动标记为已处理，不会重复处理。

### Q: Embedding 模型如何配置？
项目使用阿里 DashScope 的 `text-embedding-v3` 云端 API，需要在 `.env` 中配置 `ARK_API_KEY`。无需本地下载模型。

### Q: 端口被占用？
```bash
docker compose down
```

---

## 📝 许可证

MIT License

## 🙏 致谢

- [FastAPI](https://fastapi.tiangolo.com/)
- [pgvector](https://github.com/pgvector/pgvector)
- [uv](https://docs.astral.sh/uv/)
- [React](https://react.dev/)
- [TailwindCSS](https://tailwindcss.com/)
