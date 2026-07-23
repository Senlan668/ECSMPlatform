# AI 内容运营助手 — 系统架构图（GPT Image 2 Prompt）

> 本文档用于提供给 GPT Image 2 / DALL·E 生成高质量系统架构图。每个 Section 包含一个独立的 Prompt，可按需组合。

---

## 一、系统全景架构图 Prompt

```
请生成一张专业的技术系统架构图（Tech Architecture Diagram），风格为现代科技感的深色主题（深蓝/深灰底色，霓虹蓝 + 亮青色 + 紫色 + 品红渐变高亮线条），图片尺寸 1920x1080，布局清晰、层次分明。

系统名称：「AI 内容运营助手」— 全链路内容创作平台

架构分为 4 层，从上到下排列：

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第 1 层 — 客户端层（Client Tier）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用一个大的圆角矩形包裹，标题「Vue 3 + Vite + TailwindCSS SPA」
图标：浏览器 🖥️

内部用小圆角卡片排列 10 大功能模块：

第一行：
· 📝 内容工作流（AI 选题 → 文章 → 配图）
· 🎨 AI 海报生成（8 种模式）
· 🖼️ 作品库 & 素材中心
· 📋 模板中心（系统 + 个人模板）
· 🌐 多平台适配（小红书/抖音/微信/B站/微博）

第二行：
· 📅 内容日历（AI 排期）
· 🏷️ 品牌包管理
· 👤 个人中心
· 🖌️ Canvas 精细化编辑（Inpaint / Erase / Adapt）
· 📦 批量生成 & SSE 进度流

客户端底部一条向下的粗箭头，标注「HTTP / SSE」连接到第 2 层。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第 2 层 — 后端 API 层（Backend Tier）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

一个大的圆角矩形，标题「FastAPI + Uvicorn（Python 3.13+）」

顶部横条 — 中间件栈（从左到右排列的小方块）：
CORS → 请求日志中间件 → JWT 认证 → Argon2 密码哈希

中间区域分为 3 个横向板块：

板块 A — 路由层（左侧）
  11 个路由模块用小卡片展示：
  · auth（注册/登录）
  · workflow（内容工作流）
  · poster（海报 8 模式）
  · batch（批量生成 + SSE）
  · gallery（作品库 CRUD）
  · user_template（模板管理）
  · platform（多平台适配）
  · calendar（内容日历）
  · brand（品牌包）
  · profile（个人中心）
  · image（通用图片）

板块 B — LangGraph 工作流引擎（右侧，突出显示，发光边框）
  工作流节点用箭头串联，形成有向图：
  START → topic_selection（选题子图，Human-in-the-loop）
       → write_draft（AI 写文章）
       → human_review（interrupt() 中断审稿）
       → [approved] extract_visuals → generate_images → END
       → [rejected] 回到 write_draft（重写循环）
  底部标注：PostgreSQL Checkpointer 状态持久化

板块 C — 服务层（底部横向排列的小方块矩阵）
  4×3 的服务网格：
  · poster_service / batch_service / gallery_service / template_service
  · platform_adapter_service / calendar_service / calendar_planner_service / brand_service
  · profile_service / llm_service / image_service

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第 3 层 — 数据层（Data Tier）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

一个数据库图标圆柱形，标注：
「PostgreSQL 16（Docker / 阿里云 SAE / 腾讯云）」

围绕数据库列出表名（用小标签排列）：
users | posters | poster_templates | user_templates |
gallery_works | batch_tasks | batch_task_items |
platform_variants | calendar_events | calendar_plans |
brand_packages | user_preferences |
langgraph_checkpoint (状态持久化)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
第 4 层 — 外部 AI 服务层（External AI Services）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

右侧竖向排列的云服务图标（每个用品牌色圆角卡片）：

🤖 AI 文案引擎：
  · 火山方舟 Doubao Seed 系列 — 选题/写作/改写 LLM
  · OpenAI 兼容接口（通用 LLM）

🎨 AI 图片引擎（多引擎切换）：
  · Google Gemini API — gemini-3-pro-image-preview
  · GPT Image — gpt-image-2
  · 火山方舟 Doubao Seedream — seedream-4-5

🔍 可观测性：
  · LangSmith — LangGraph 工作流追踪
  · structlog — JSON 结构化日志 + PII 脱敏

连接线说明：
- 第 2 层向第 3 层用实线双向箭头（SQLAlchemy async + asyncpg）
- 第 2 层向第 4 层用虚线箭头（httpx API 调用）
- LangGraph 节点向 Checkpointer 用虚线（psycopg + checkpoint）
- 第 2 层 LangGraph 向 LangSmith 用点线（可选追踪）

整体风格要求：
- 深色背景（#0D1117 或类似深蓝灰）
- 层与层之间有明显分隔带
- 每一层有半透明背景色区分（从上到下：蓝、紫、青、绿）
- 箭头用渐变发光效果
- 中英文混合标注
- 无多余装饰，信息密度高
- 专业技术文档风格，适合放在 README 或技术博客
```

---

## 二、LangGraph 工作流详细图 Prompt

```
请生成一张 LangGraph 工作流架构图（Workflow Architecture Diagram），展示 AI 内容运营助手的完整工作流编排。

风格：现代深色科技风，深蓝底色，霓虹色高亮，1920x1080。

标题：「LangGraph 1.0+ 内容创作工作流引擎」

整体布局：从左到右的有向图（Directed Graph），分为两大区域——主图（Main Graph）和选题子图（Topic Selection Subgraph），子图用虚线框包裹。

━━━ 选题子图 Topic Selection Subgraph（虚线框内）━━━

┌─ generate_topics ─────────────────┐
│ 🧠 AI 选题生成                     │
│ · Doubao Seed LLM 调用            │
│ · 结构化选题解析（标题列表）        │
│ · NodeMetric 性能指标采集          │
└───────────────────────────────────┘
    ↓
┌─ human_select_topic ──────────────┐
│ 👤 人工选题（Human-in-the-loop）    │
│ · interrupt() 暂停执行             │
│ · 用户从候选列表中选择             │
│ · Command(goto=...) 动态路由       │
└───────────────────────────────────┘

━━━ 主图 Main Graph ━━━

START（绿色圆形）
    ↓
topic_selection（引用子图，蓝色发光边框）
    ↓
┌─ write_draft ─────────────────────┐
│ ✍️ AI 文章撰写                     │
│ · Doubao Seed LLM 长文生成         │
│ · review_feedback 驳回反馈注入     │
│ · revision_count 修改次数追踪      │
│ · 性能指标：duration_ms / tokens   │
└───────────────────────────────────┘
    ↓
┌─ human_review ────────────────────┐
│ 📋 人工审稿（interrupt() 中断）     │
│ · 展示文章预览（前 500 字）         │
│ · approve / reject 二选一          │
│ · 返回 Command 动态路由            │
└───────────────────────────────────┘
    ↓ approve          ↓ reject
    ↓                  └──→ 回到 write_draft（红色虚线循环箭头）
    ↓
┌─ extract_visuals ─────────────────┐
│ 🔍 视觉要点提取                    │
│ · LLM 从文章中提取 3-5 个配图要点  │
│ · 输出：visual_points 列表         │
└───────────────────────────────────┘
    ↓
┌─ generate_images ─────────────────┐
│ 🎨 AI 配图生成                     │
│ · 多引擎切换：Gemini / GPT Image / Doubao│
│ · asyncio.gather 并行生成          │
│ · 失败自动重试（备用 Prompt）       │
│ · 输出：image_urls 列表            │
└───────────────────────────────────┘
    ↓
END（红色圆形）

底部区域 — AgentState 状态流（贯穿所有节点的虚线）：
TypedDict 字段列表：
topic_direction | generated_topics | selected_topic |
article_content | review_feedback | review_status |
revision_count | visual_points | image_urls |
status | error | node_metrics[]

右下角标注：
🗄️ PostgreSQL Checkpointer（psycopg + 异步连接池）
🔭 LangSmith 追踪（可选）

每个节点用不同颜色的发光边框：
generate_topics: 蓝色
human_select_topic: 橙色
write_draft: 紫色
human_review: 红色
extract_visuals: 青色
generate_images: 金色

节点之间的箭头用渐变发光效果。
Human-in-the-loop 节点右上角标注 「interrupt()」 标签。
```

---

## 三、海报生成 Pipeline 详细图 Prompt

```
请生成一张 AI 海报生成 Pipeline 架构图（Poster Generation Pipeline），展示 8 种生成模式和精细化编辑工作流。

风格：现代深色科技风，深蓝底色，霓虹色高亮，1920x1080。

标题：「AI 海报生成引擎 — 8 模式 + 精细化编辑」

整体布局：上半部分为 8 种生成模式（蜂窝/辐射式排列），下半部分为精细化编辑流程。

━━━ 8 种生成模式（辐射式排列）━━━

中心节点：「poster_service.py」（发光核心）

从中心向外辐射 8 个模式卡片：

🎯 自定义生成（custom）
   提示词 + 风格标签 + 色调偏好 → AI 直出

📋 模板生成（template）
   系统模板 / 个人模板 → 文案槽位填写 → AI 生成

✏️ 以图改图（edit）
   上传原图 + 编辑指令 → AI 局部修改

🎭 风格迁移（style-transfer）
   上传原图 + 目标风格 → light/medium/strong 三档强度

📦 批量生成（batch）
   多组 Prompt 并发 → Semaphore(3) 限流 → SSE 进度推送

🔗 系列一致性（series）
   首图锚定风格 → 后续图自动保持一致

🖌️ 局部重绘（inpaint）
   Canvas 涂抹遮罩 → AI 定向替换选区

🧹 智能擦除（erase）
   Canvas 涂抹遮罩 → AI 自动补全背景

━━━ 精细化编辑流程（底部横向）━━━

用户选择作品 → Canvas 编辑器（前端）
    ↓
涂抹遮罩区域 → Base64 编码
    ↓
POST /api/v1/poster/inpaint 或 /erase
    ↓
image_service → 多引擎调用（Gemini / GPT Image / Doubao）
    ↓
返回新图 → 保存至 Gallery

━━━ 尺寸适配 & 全平台导出（右侧竖向）━━━

📐 单比例适配（adapt）
   · 智能裁剪 / AI 扩图 两种策略

📦 全平台导出（export-all）
   · 一键并发适配 5 大平台比例
   · Semaphore(2) 限流
   · 输出：小红书 3:4 / 抖音 9:16 / 微信 1:1 / B站 16:9 / 微博 16:9

底部标注 AI 图片引擎切换：
🔄 Gemini API ↔ GPT Image ↔ Doubao Seedream
  （用户可在个人中心偏好设置中切换）

每种模式用不同颜色的发光边框，专业技术文档风格。
```

---

## 四、技术栈全景图 Prompt

```
请生成一张技术栈全景图（Tech Stack Overview），展示项目使用的所有技术和工具。

风格：深色背景 + 彩色 Logo/图标，类似 awesome-stack 风格的多层展示，1920x1080。

标题：「AI 内容运营助手 — 技术栈全景」

分为 7 个区域（每个区域用不同的渐变色背景区分）：

🎨 前端 | 渐变蓝色区域
  Vue 3 · Vite 5 · TailwindCSS · Vue Router 4
  Axios · Canvas API（遮罩编辑）
  SSE EventSource（实时进度）

⚙️ 后端框架 | 渐变紫色区域
  Python 3.13+ · FastAPI · Uvicorn
  Pydantic 2 · pydantic-settings
  httpx（异步 HTTP 客户端）

🔀 工作流引擎 | 渐变品红色区域
  LangGraph 1.0+ · StateGraph · interrupt()
  PostgreSQL Checkpointer（状态持久化）
  LangChain Core · LangChain OpenAI
  Human-in-the-loop · Command 动态路由

🗄️ 数据库 & ORM | 渐变绿色区域
  PostgreSQL 16 · SQLAlchemy 2.0 (async)
  asyncpg · psycopg 3（Checkpointer）
  psycopg-pool（连接池管理）

🤖 AI 文案 | 渐变金色区域
  火山方舟 Doubao Seed 系列
  · doubao-seed-1-8（主力模型）
  · doubao-seed-1-6-flash（快速模型）
  OpenAI 兼容接口（通用 LLM）

🎨 AI 图片（多引擎）| 渐变橙色区域
  Google Gemini API — gemini-3-pro-image-preview
  GPT Image — gpt-image-2
  火山方舟 Doubao Seedream 4.5 — 文生图
  Pillow — 图片后处理

🔐 安全 & 可观测性 | 渐变红色区域
  JWT Token (python-jose) · Argon2 密码哈希
  structlog — JSON 结构化日志
  PII 脱敏处理器（邮箱/API Key/手机号）
  请求日志中间件 · LangSmith 追踪

☁️ 部署 & DevOps | 渐变青色区域
  Docker Compose（PostgreSQL + FastAPI）
  阿里云 SAE（容器化部署）
  腾讯云轻量服务器
  Vercel（前端托管）

每个技术用小圆角标签显示，重要技术用更大的标签突出。
```

---

## 五、部署架构图 Prompt

```
请生成一张云部署架构图（Cloud Deployment Diagram），展示多环境部署拓扑。

风格：深色科技风，云平台风格布局，1920x1080。

标题：「生产环境部署架构」

━━━ 用户访问入口 ━━━

🌐 用户浏览器（PC / 移动端）
    │
    ├─ 前端 SPA ──→ Vercel（静态资源托管）
    │                · Vue 3 构建产物
    │                · CDN 全球加速
    │
    └─ API 请求 ──→ 阿里云 SAE / 腾讯云轻量服务器
                      │
                      ├── FastAPI + Uvicorn
                      │   · 11 路由模块
                      │   · LangGraph 工作流引擎
                      │   · Semaphore 并发控制
                      │
                      ├── Docker Compose 编排
                      │   · xhs-backend（FastAPI 容器，1G 内存限制）
                      │   · xhs-postgres（PostgreSQL 16 Alpine，512M 内存限制）
                      │
                      └── 挂载卷
                          · ./static → /app/static（生成图片持久化）
                          · ./logs → /app/logs（structlog 日志持久化）

━━━ 外部 AI 服务连接 ━━━

FastAPI 后端 ──→ 火山方舟 Doubao API（LLM 文案生成）
            ──→ Gemini API（图片生成 - 代理中转）
            ──→ GPT Image / Doubao Seedream（图片生成）
            ──→ LangSmith（工作流追踪 - 可选）

━━━ 数据持久化 ━━━

PostgreSQL 16
    │
    ├── 业务表（12+ 张）
    │   · users / posters / gallery_works / batch_tasks ...
    │
    └── LangGraph Checkpoint 表
        · 工作流状态持久化 / 恢复

━━━ 开发环境 ━━━

💻 开发者本地
    · frontend :3000（Vite Dev Server）
    · backend :8000（uvicorn --reload）
    · PostgreSQL :5432（Docker / 本地安装）
    · start.bat / stop.bat 一键启停（Windows）

端口映射均绑定 127.0.0.1（安全），仅对外暴露反向代理端口。
```

---

## 六、组合 Prompt（一张图全览）

> 如果只需要一张图，使用以下精简 Prompt：

```
Generate a professional, high-quality software architecture diagram for an AI-powered content creation platform called "AI 内容运营助手".

Style: Dark theme (#0D1117 background), neon blue/cyan/purple/magenta gradient highlights, modern tech aesthetic. Size: 1920x1080. Clean layout with clear layer separation.

The architecture has 4 tiers arranged top to bottom:

TIER 1 - CLIENT (top):
"Vue 3 + Vite + TailwindCSS SPA" with 10 feature modules: Content Workflow (AI Topics→Articles→Images), AI Poster Generation (8 modes), Gallery & Assets, Template Center, Multi-Platform Adaptation (Xiaohongshu/Douyin/WeChat/Bilibili/Weibo), Content Calendar, Brand Package, Profile Center, Canvas Editor (Inpaint/Erase/Adapt), Batch Generation + SSE Progress

TIER 2 - BACKEND (middle, largest):
- Title: "FastAPI + Uvicorn (Python 3.13+)"
- Top bar: Middleware stack (CORS → Request Logger → JWT Auth → Argon2)
- Left: 11 API Route modules (auth, workflow, poster, batch, gallery, template, platform, calendar, brand, profile, image)
- Right (highlighted): "LangGraph 1.0+ Workflow Engine" - Directed Graph:
  START → topic_selection(Subgraph, Human-in-the-loop) → write_draft → human_review(interrupt()) → [approve]extract_visuals → generate_images → END / [reject]→write_draft(loop)
  PostgreSQL Checkpointer for state persistence
- Bottom: Service Layer grid (12 services: poster, batch, gallery, template, platform_adapter, calendar, calendar_planner, brand, profile, llm, image, volcengine_sign)

TIER 3 - DATA (bottom-left):
- PostgreSQL 16 cylinder icon (Docker / Alibaba Cloud SAE / Tencent Cloud)
- 12+ business tables + LangGraph checkpoint tables

TIER 4 - EXTERNAL AI SERVICES (bottom-right):
- LLM: Volcano Engine Doubao Seed (text generation)
- Image (multi-engine switch): Google Gemini API / Doubao Seedream / Volcano Jimeng
- Observability: LangSmith (workflow tracing) + structlog (JSON logs + PII masking)

Connections:
- Client → Backend: solid HTTP/SSE arrows
- Backend → Database: solid bidirectional (SQLAlchemy async + asyncpg)
- Backend → AI Services: dashed API call arrows (httpx)
- LangGraph → Checkpointer: dotted line (psycopg)
- LangGraph → LangSmith: dotted optional trace line

Use semi-transparent colored bands for each tier (blue, purple, cyan, green).
Glowing gradient arrows. Mix of Chinese and English labels.
Professional documentation style suitable for a technical README.
```

---

## 使用说明

1. **单独生成**：将上面任一 Section 的 Prompt 复制到 GPT Image 2 / ChatGPT 的图片生成功能
2. **组合使用**：Section 六提供了英文精简版，适合一张图全览
3. **调整建议**：
   - 如果图片文字太密，可删减部分子模块
   - 如果需要中文为主，把 Section 六的英文 Prompt 替换为对应中文 Section
   - 可以追加指令如 "把 LangGraph 部分放大突出" 或 "增加数据流箭头标注"
4. **推荐组合**：
   - 技术博客/README → Section 六（全景图）
   - 技术方案汇报 → Section 一（全景）+ Section 二（LangGraph 详细）
   - 海报功能展示 → Section 三（海报 Pipeline）
   - 对外展示 → Section 四（技术栈）+ Section 五（部署架构）
