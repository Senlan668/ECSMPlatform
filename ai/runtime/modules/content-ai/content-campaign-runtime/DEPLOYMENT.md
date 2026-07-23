# AI 内容运营助手 - 部署指南

本文档详细说明了如何将"AI 内容运营助手"项目部署到阿里云 Serverless 架构（SAE + OSS + CDN + RDS Serverless）。

> 后端采用 **容器镜像 + SAE（Serverless 应用引擎）** 部署，前端构建为静态文件后上传 **OSS + CDN** 加速，数据库使用 **阿里云 RDS PostgreSQL Serverless**（按量付费、自动弹性伸缩）。

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                │
│  ┌──────────────────┐    ┌─────────────────────────────────┐    │
│  │ Vue 3 SPA 前端    │    │ Axios HTTP 请求                  │    │
│  └────────┬─────────┘    └─────────────────────────────────┘    │
└───────────┼─────────────────────────────────────────────────────┘
            │
     ┌──────┴──────┐
     │ HTTPS 请求   │
     └──────┬──────┘
            │
  ┌─────────▼──────────────────────────────────────────────────┐
  │           阿里云 Serverless 托管层                           │
  │                                                            │
  │  [ CDN + OSS ]  ──→ 前端 SPA 静态文件 (dist/)              │
  │                                                            │
  │  [ CLB/SLB ]    ──→ SAE 容器 (FastAPI :8000)               │
  │                                                            │
  └────────────────────────┬───────────────────────────────────┘
                           │
  ┌────────────────────────▼───────────────────────────────────┐
  │                 SAE 容器 (FastAPI 后端)                      │
  │                                                            │
  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
  │  │ Auth (JWT)    │  │ Workflow API │  │ Poster API       │  │
  │  └──────────────┘  └──────┬───────┘  └────────┬─────────┘  │
  │                           │                   │             │
  │  ┌──────────────┐  ┌──────▼───────┐  ┌────────▼─────────┐  │
  │  │ Batch API    │  │  LangGraph   │  │  Poster Service  │  │
  │  │ (批量/系列)  │  │  工作流引擎   │  │  (8 种生成模式)   │  │
  │  └──────────────┘  └──────┬───────┘  └────────┬─────────┘  │
  │                           │                   │             │
  │                    ┌──────▼───────┐            │             │
  │                    │  LangGraph   │            │             │
  │                    │  工作流引擎   │            │             │
  │                    └──────┬───────┘            │             │
  │                           │                   │             │
  └───────────────────────────┼───────────────────┼─────────────┘
                              │                   │
               ┌──────────────┼───────────────────┼──────────┐
               │              ▼                   ▼          │
               │  ┌────────────────┐  ┌────────────────────┐ │
               │  │ RDS Serverless │  │ 外部 API 服务       │ │
               │  │ PostgreSQL     │  │                    │ │
               │  │  VPC 内网连接   │  │ • 火山引擎 Doubao   │ │
               │  └────────────────┘  │   (LLM 大模型)     │ │
               │                      │ • Gemini Image     │ │
               │  ┌────────────────┐  │   (AI 配图生成)     │ │
               │  │ OSS 对象存储    │  └────────────────────┘ │
               │  │ (配图持久化)    │                         │
               │  └────────────────┘                         │
               │        持久化层 & 外部依赖                    │
               └─────────────────────────────────────────────┘
```

---

## 云产品对照表

| 功能 | 云产品 | 说明 |
|------|--------|------|
| 容器镜像仓库 | ACR（阿里云容器镜像服务） | 存储后端 Docker 镜像 |
| Serverless 计算 | SAE（Serverless 应用引擎） | 运行后端 FastAPI 容器 |
| 负载均衡 | CLB（传统型负载均衡） | SAE 公网入口，HTTPS 终止 |
| Serverless 数据库 | RDS PostgreSQL Serverless | 业务数据 + LangGraph 状态持久化（VPC 内网） |
| 对象存储 | OSS | 前端静态文件 + AI 配图存储 |
| 内容分发 | CDN | 前端静态资源加速 |
| 出网网关 | NAT 网关 + EIP | SAE 容器访问外部 API（LLM / 图片生成） |
| 域名解析 | 云解析 DNS | 域名 CNAME / A 记录配置 |
| SSL 证书 | SSL 证书管理 | HTTPS 证书申请与管理 |

---

## 技术栈清单

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端框架 | Vue 3 + Vite | SPA 单页应用，构建后产出静态文件 |
| HTTP 客户端 | Axios | 前端请求后端 API |
| 前端托管 | OSS + CDN | 静态文件存储 + 全球加速 |
| 后端框架 | FastAPI + Uvicorn | 异步 Python Web 框架 |
| 后端部署 | Docker + ACR + SAE | 容器镜像 → 镜像仓库 → Serverless 应用引擎 |
| 工作流引擎 | LangGraph 1.0+ | AI 工作流编排（选题→写作→审核→配图） |
| LLM 接口 | LangChain OpenAI | 对接火山引擎 Doubao 大模型 |
| 图片生成 | Gemini Image API | AI 海报生成（自定义/模板/编辑/风格迁移/局部重绘/擦除/适配/扩图） |
| 数据库 | 阿里云 RDS PostgreSQL Serverless | Serverless 数据库（VPC 内网），业务数据 + LangGraph Checkpoint |
| ORM | SQLAlchemy (AsyncIO) | 异步数据库操作 |
| 认证 | JWT (python-jose) | 用户登录与接口鉴权 |
| 日志 | structlog | 结构化日志，支持 PII 脱敏 |

---

## 数据库存储方案设计

本项目使用 **阿里云 RDS PostgreSQL Serverless** 作为唯一数据库，承载业务数据和 AI 工作流状态两类数据。生成的配图文件存储在 **OSS 对象存储**（或 SAE 挂载 NAS）。

### 存储架构总览

```
┌──────────────────────────────────────────────────────────────────────┐
│          阿里云 RDS PostgreSQL Serverless (VPC 内网)                   │
│                     (langgraph_db / aicontent)                        │
│                                                                      │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐  │
│  │      业务数据层               │  │    LangGraph 状态持久化层      │  │
│  │                              │  │                              │  │
│  │  ┌────────────────────────┐  │  │  ┌────────────────────────┐  │  │
│  │  │  users                 │  │  │  │  checkpoints           │  │  │
│  │  │  ├─ id (UUID PK)       │  │  │  │  ├─ thread_id          │  │  │
│  │  │  ├─ username (UNIQUE)  │  │  │  │  ├─ checkpoint_id      │  │  │
│  │  │  ├─ password_hash      │  │  │  │  └─ checkpoint (JSONB) │  │  │
│  │  │  ├─ created_at         │  │  │  ├────────────────────────┤  │  │
│  │  │  └─ updated_at         │  │  │  │  checkpoint_blobs      │  │  │
│  │  └────────────────────────┘  │  │  │  (大型二进制数据)        │  │  │
│  │                              │  │  ├────────────────────────┤  │  │
│  │  连接方式:                    │  │  │  checkpoint_writes      │  │  │
│  │  SQLAlchemy AsyncSession     │  │  │  (待写入缓冲)           │  │  │
│  │  (asyncpg 驱动)              │  │  ├────────────────────────┤  │  │
│  │                              │  │  │  checkpoint_migrations  │  │  │
│  │                              │  │  │  (版本迁移记录)          │  │  │
│  │                              │  │  └────────────────────────┘  │  │
│  │                              │  │                              │  │
│  │                              │  │  连接方式:                    │  │
│  │                              │  │  psycopg3 AsyncConnectionPool│  │
│  │                              │  │  (psycopg 驱动)              │  │
│  └──────────────────────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     OSS 对象存储 / NAS 文件存储                        │
│                                                                      │
│  AI 配图:   oss://bucket/images/generated/   或 NAS 挂载 /app/static │
│  AI 海报:   oss://bucket/images/posters/     或 NAS /app/static      │
│  应用日志:  SAE 容器 stdout → SLS 日志服务自动采集                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 双连接池设计

项目使用**两个独立的数据库连接池**访问同一个 RDS Serverless 实例，原因是 SQLAlchemy 和 LangGraph Checkpointer 使用不同的 PostgreSQL 驱动：

| 连接池 | 环境变量 | 驱动 | 用途 | 连接串格式 |
|-------|---------|------|------|-----------|
| SQLAlchemy AsyncSession | `DATABASE_URL` | `asyncpg` | 业务数据 CRUD（用户注册/登录） | `postgresql+asyncpg://user:pass@host:5432/db` |
| psycopg3 AsyncConnectionPool | `POSTGRES_URI` | `psycopg` | LangGraph Checkpoint 状态读写 | `postgresql://user:pass@host:5432/db` |

> ⚠️ **注意**：两个连接串指向**同一个数据库实例**，仅协议前缀不同（`postgresql+asyncpg://` vs `postgresql://`）。配置时请确保 host、port、数据库名、用户名、密码完全一致。

### 表结构详解

#### 1. `users` 表 — 业务数据（手动创建）

用户注册与认证信息，由 `scripts/init_db.sql` 初始化，`SQLAlchemy ORM` 管理。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | `UUID` | PRIMARY KEY, 自动生成 | 用户唯一标识 |
| `username` | `VARCHAR(50)` | UNIQUE, NOT NULL, INDEX | 用户名 |
| `password_hash` | `VARCHAR(255)` | NOT NULL | 密码哈希值（Argon2 / bcrypt） |
| `created_at` | `TIMESTAMPTZ` | DEFAULT NOW() | 注册时间 |
| `updated_at` | `TIMESTAMPTZ` | DEFAULT NOW(), ON UPDATE | 更新时间 |

   ```sql
-- scripts/init_db.sql 中创建
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
```

#### 2. LangGraph Checkpoint 表 — 工作流状态（自动创建）

以下表由 `AsyncPostgresSaver.setup()` 在后端首次启动时**自动创建**，无需手动建表。

| 表名 | 用途 | 说明 |
|------|------|------|
| `checkpoints` | 工作流状态快照 | 存储每个 thread 在各个节点执行后的完整 State 快照（JSONB） |
| `checkpoint_blobs` | 大型二进制数据 | 存储超过阈值的状态数据（如长文章内容） |
| `checkpoint_writes` | 待写入缓冲 | 节点执行过程中的中间写入记录 |
| `checkpoint_migrations` | 迁移版本 | Checkpointer schema 版本跟踪 |

**Checkpoint 中存储的工作流状态字段（AgentState）：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `topic_direction` | `str` | 用户输入的主题方向 |
| `generated_topics` | `List[str]` | AI 生成的 5 个候选选题标题 |
| `selected_topic` | `str` | 用户选中的选题 |
| `article_content` | `str` | AI 生成的文章内容（Markdown，800~1200 字） |
| `review_feedback` | `str` | 用户审核驳回时的修改意见 |
| `review_status` | `"pending" / "approved" / "rejected"` | 审核状态 |
| `revision_count` | `int` | 文章修改次数 |
| `visual_points` | `List[str]` | 从文章提取的 3 个配图描述 |
| `image_urls` | `List[str]` | 生成的配图 URL 路径列表 |
| `status` | `str` | 工作流当前阶段描述 |
| `node_metrics` | `List[NodeMetric]` | 各节点执行指标（耗时、Token 用量、模型名） |

### 数据隔离策略

用户之间的工作流数据通过 **thread_id 前缀** 实现隔离：

```
thread_id 格式: {user_uuid}_{workflow_uuid}

示例: 550e8400-e29b-41d4-a716-446655440000_a1b2c3d4-e5f6-7890-abcd-ef1234567890
      ├─────── 用户 ID ──────────────────┤ ├──── 工作流 ID ────────────────────────┤
```

| 操作 | 隔离方式 |
|------|---------|
| 查询用户的所有线程 | `SELECT ... FROM checkpoints WHERE thread_id LIKE '{user_id}_%'` |
| 访问特定工作流 | API 层校验 `thread_id.startswith(current_user.id)` |
| 删除工作流 | 验证所有权后删除 `checkpoints` / `checkpoint_blobs` / `checkpoint_writes` 三张表的对应记录 |

### 配图存储方案

> ⚠️ Serverless 容器的本地文件系统是**临时的**（容器重建后文件丢失），配图不能存在容器内部。

| 方案 | 存储位置 | 访问方式 | 适合场景 |
|------|---------|---------|---------|
| **OSS 对象存储（推荐）** | 阿里云 OSS Bucket | CDN 加速访问 | 生产环境 |
| 挂载 NAS | 阿里云 NAS 文件存储 | 挂载到容器 `/app/static` | 需兼容现有代码路径 |
| 数据库存储 | PostgreSQL BYTEA / Large Object | API 读取 | 不推荐（性能差） |

> 💡 当前代码将配图保存到 `static/images/generated/`。如果暂时不改代码，可以通过 SAE 挂载 NAS 到 `/app/static` 目录来解决持久化问题。长期建议改为 OSS 存储。

### 数据量预估

| 数据项 | 单条大小（估算） | 说明 |
|--------|---------------|------|
| 用户记录 | ~0.5 KB | 用户名 + 密码哈希 |
| 单个 Checkpoint 快照 | ~5-20 KB | 含选题列表 + 文章内容（Markdown） |
| 单个工作流完整链路 | ~50-200 KB | 约 5-10 个 Checkpoint（每个节点一次快照） |
| 单张配图 | ~200-500 KB | PNG 格式，3:4 竖版 |
| 单个工作流配图 | ~0.6-1.5 MB | 3 张配图 |
| 单张 AI 海报 | ~300-800 KB | 多种比例（3:4/16:9/9:16/1:1/2.35:1） |
| 全平台导出套装 | ~1.5-4 MB | 4 张不同比例海报 |

> 以 1000 个用户、每用户每月 10 次工作流计算：
> - 数据库：~2 GB / 月（Checkpoint 为主）
> - 配图存储：~15 GB / 月（建议定期清理或迁移到对象存储）

### 数据库部署方案选型

> ⚠️ 本项目后端采用 **容器镜像 + SAE** 的 Serverless 部署方案，容器是无状态的、随时可能被调度重建，因此 **PostgreSQL 不能运行在容器内部**，必须使用独立的外部数据库服务。

#### 为什么 Serverless 后端不能自带数据库？

```
❌ 错误做法：数据库跑在容器里

  ┌─────────────────────────┐
  │  SAE 容器（无状态）        │
  │  ├─ FastAPI              │   ← 容器重建后 PostgreSQL 数据全部丢失！
  │  └─ PostgreSQL           │   ← 多实例扩容时各容器的数据不一致！
  └─────────────────────────┘

✅ 正确做法：数据库独立部署（RDS Serverless）

  ┌──────────────────────┐          ┌──────────────────────────┐
  │  SAE 容器实例 ×N      │   VPC    │  RDS PostgreSQL Serverless│
  │  (无状态，可扩缩容)    │────────→│  (自动弹性伸缩，按量付费) │
  │  FastAPI :8000        │  内网    │  :5432                   │
  └──────────────────────┘          └──────────────────────────┘
```

#### 方案对比

| 维度 | 方案 A：RDS Serverless（✅ 当前方案） | 方案 B：RDS 常规版（备选升级） | 方案 C：第三方 Serverless DB |
|------|-------------------------------------|---------------------------|--------------------------|
| 产品示例 | 阿里云 RDS PostgreSQL **Serverless 版** | 阿里云 RDS 基础版 / 高可用版 | Neon / Supabase |
| 运维复杂度 | ⭐ 全托管，零运维 | ⭐ 全托管，免运维 | ⭐ 全托管，零运维 |
| 计费模式 | ✅ **按量付费（ACU 弹性伸缩）** | 包月/按量（固定规格） | 按量付费 |
| 自动弹性伸缩 | ✅ 0~8 ACU 自动伸缩，空闲时缩容到最低 | ❌ 固定规格，手动升降配 | ✅ 自动伸缩 |
| 高可用 | ✅ 自动主备切换 | ✅ 高可用版自动主备切换 | ✅ 内置高可用 |
| 自动备份 | ✅ 每日自动备份 + 秒级时间点恢复 | ✅ 每日自动备份 + 秒级恢复 | ✅ 自动备份 |
| 与 SAE 网络 | ✅ **同 VPC 内网直通（延迟 <1ms）** | ✅ 同 VPC 内网直通 | ⚠️ 需公网或 PrivateLink |
| 连接数限制 | 按 ACU 弹性（每 ACU ~100 连接） | 按规格（100~1000+） | 免费版 50~100 |
| 月成本（估算） | **¥10~80/月（按实际用量）** | ¥50~300/月（固定规格） | 免费~$19/月 |
| 适合场景 | ✅ **Serverless 后端最佳搭配** | 高流量固定负载生产环境 | 多云部署 / 海外项目 |

#### ✅ 当前方案：阿里云 RDS PostgreSQL Serverless

RDS Serverless 与 SAE 完美搭配：同 VPC 内网直通、按量付费、自动弹性伸缩。空闲时 ACU 缩至最低，流量高峰时自动扩容，无需预置固定规格。

```
┌─────────────────────────────────────────────────────────────────────┐
│                         阿里云 VPC 内网                               │
│                                                                     │
│  ┌──────────────────────────┐     ┌───────────────────────────────┐ │
│  │     SAE 容器实例 ×N       │     │ RDS PostgreSQL Serverless     │ │
│  │                          │     │                               │ │
│  │  FastAPI 后端             │     │ pgm-xxx.pg.rds.aliyuncs.com   │ │
│  │  (从 ACR 拉取镜像启动)    │────→│ :5432                         │ │
│  │                          │内网  │                               │ │
│  │  ├─ 业务数据 (asyncpg)   │     │ ┌─ langgraph_db              │ │
│  │  └─ Checkpoint (psycopg) │     │ │  ├─ users (业务表)          │ │
│  │                          │     │ │  ├─ checkpoints             │ │
│  └──────────────────────────┘     │ │  ├─ checkpoint_blobs        │ │
│                                   │ │  └─ checkpoint_writes       │ │
│  ┌──────────────────────────┐     │ └──────────────────────────────│ │
│  │     OSS + CDN             │     │                               │ │
│  │  (前端静态文件 + 配图)    │     │ ✅ 自动备份（7天时间点恢复）   │ │
│  └──────────────────────────┘     │ ✅ ACU 自动弹性伸缩            │ │
│                                   │ ✅ 主备自动切换                │ │
│                                   │ ✅ 性能监控 + 慢 SQL 分析       │ │
│                                   └───────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

#### RDS Serverless 与常规版区别

| 维度 | RDS Serverless | RDS 常规版 |
|------|---------------|-----------|
| 计费单位 | **ACU（弹性计算单元）** | 固定 CPU + 内存 |
| 计算弹性 | 自动在 min~max ACU 之间伸缩 | 固定规格，手动升配 |
| 空闲时 | 缩至最低 ACU（0.5 ACU 起），费用极低 | 固定计费，即使无请求 |
| 按量计费 | ✅ 按秒计费，用多少付多少 | 包月或按小时 |
| 适用场景 | 流量波动大、个人项目、Serverless 后端 | 稳定高流量生产环境 |

> 💡 **为什么选 RDS Serverless 而非常规 RDS？**
> 本项目后端已是 SAE（Serverless），数据库也用 Serverless 版本，整套架构按量付费、弹性伸缩，避免为固定规格买单。个人项目低流量时月费极低（~¥10），流量增长时自动扩容，无需手动升配。

#### 💡 备选方案：RDS 常规版（后续优化）

当项目流量稳定且较高时，可切换到 RDS 常规版（固定规格），获得更可控的性能和更低的单位成本：

| 场景 | RDS 规格 | 存储空间 | 月费用（估算） |
|------|---------|---------|---------------|
| 小型生产（<100 用户） | 1 核 2G 高可用版 | 50G SSD | ¥100~200/月 |
| 正式商用（100~1000 用户） | 2 核 4G 高可用版 | 100G SSD | ¥300~500/月 |

> 切换方式：在 RDS 控制台将实例从 Serverless 转为常规版（或新建常规版实例后用 `pg_dump`/`pg_restore` 迁移），修改 SAE 环境变量中的内网地址即可。代码无需任何改动。

---

## 部署步骤

### 阶段一：创建 RDS Serverless 数据库

项目强依赖 PostgreSQL，用于存储业务数据（用户表）及 LangGraph 异步工作流状态（Checkpoint）。SAE 容器是无状态的，**必须使用外部数据库服务**。

#### 1. 创建 RDS PostgreSQL Serverless 实例

1. 登录 **[RDS 控制台](https://rdsnext.console.aliyun.com)**
2. 点击 **创建实例**，按以下配置选择：

| 配置项 | 推荐值 | 说明 |
|--------|--------|------|
| **数据库引擎** | PostgreSQL 14+ | 推荐 14 或 16 |
| **产品类型** | **Serverless** | ⚠️ 不要选基础版/高可用版 |
| **地域和可用区** | 与 SAE 同地域（如华东1杭州） | 确保 VPC 内网可达 |
| **VPC** | ⚠️ **与 SAE 相同的 VPC** | SAE 自动创建的 VPC 即可 |
| **存储空间** | 20G 起步 | 按量计费，可自动扩容 |
| **RCU 范围** | 最小 0.5 ~ 最大 8 | 按实际负载自动伸缩 |
| **自动启停** | 建议关闭 | 生产环境避免冷启动延迟 |

3. 完成支付，等待实例创建（约 5~10 分钟）

> 💡 **Serverless 计费说明**：RDS Serverless 按 RCU（弹性计算单元）秒级计费。空闲时自动缩至最低 RCU（~0.5），费用极低；有请求时自动扩容。无需预先选择 CPU/内存规格。

#### 2. 创建高权限账号

1. RDS 控制台 → 实例详情 → **账号管理**
2. 点击 **创建账号**：
   - **账号名**：`postgres`
   - **账号类型**：**高权限账号**
   - **密码**：设置强密码（⚠️ 记住此密码，后续 SAE 环境变量要用）

#### 3. 创建数据库

1. RDS 控制台 → 实例详情 → **数据库管理**
2. 点击 **创建数据库**：
   - **数据库名**：`langgraph_db`
   - **字符集**：`UTF-8`
   - **授权账号**：`postgres`

#### 4. 配置白名单

1. RDS 控制台 → 实例详情 → **数据安全性** → **白名单设置**
2. 修改默认白名单分组，添加 SAE 所在 VPC 的网段：
   ```
   192.168.0.0/16
   ```
3. 如需通过 DMS 控制台登录，临时添加 `0.0.0.0/0`（⚠️ 调试完成后务必删除）

#### 5. 执行数据库初始化 SQL

> 💡 LangGraph Checkpoint 表（`checkpoints` / `checkpoint_blobs` / `checkpoint_writes`）会在后端首次启动时通过 `AsyncPostgresSaver.setup()` **自动创建**，无需手动建表。此步骤仅需创建 `users` 业务表和 UUID 扩展。

**方式一：通过 DMS 控制台执行（推荐，无需安装任何工具）**

1. RDS 控制台 → 实例详情 → 点击顶部 **登录数据库** 按钮（跳转到 DMS）
2. 登录方式选择 **密码登录**：
   - 用户名：`postgres`
   - 密码：第 2 步设置的密码
   - 数据库：`langgraph_db`
3. 进入 SQL Console 后，**逐条执行**以下 SQL（每次只粘贴一条，点击执行）：

**第 ① 条** — 设置 search_path：

```sql
SET search_path TO public;
```

**第 ② 条** — 启用 UUID 扩展：

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

> 如果报权限错误，可改用 PostgreSQL 14+ 内置的 `gen_random_uuid()` 替代，跳过此步。

**第 ③ 条** — 创建用户表：

```sql
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

> 如果第 ② 条的 `uuid-ossp` 扩展创建失败，将 `uuid_generate_v4()` 替换为 `gen_random_uuid()`。

**第 ④ 条** — 创建用户名索引：

```sql
CREATE INDEX idx_users_username ON public.users(username);
```

**第 ⑤ 条** — 验证建表成功：

```sql
SELECT 'Database initialization successful!' AS status,
       current_database() AS database_name,
       current_user AS user_name;
```

每条 SQL 执行后应看到 `[Success]` 提示。

**方式二：通过 psql 命令行执行（需本地安装 PostgreSQL 客户端）**

```bash
# 需先开启 RDS 公网访问，并在白名单中添加你的公网 IP
psql -h pgm-bp16l24gbh51mh47.rwlb.rds.aliyuncs.com -U postgres -d langgraph_db

# 在 psql 中运行初始化脚本
\i scripts/init_db.sql
# 期望输出：CREATE EXTENSION / CREATE TABLE / CREATE INDEX

\q
```

#### 6. 获取内网连接地址

1. RDS 控制台 → 实例详情 → **数据库连接**
2. 复制 **VPC 内网地址**：`pgm-bp16l24gbh51mh47.rwlb.rds.aliyuncs.com`
3. 端口：`5432`

> 此内网地址将在阶段二配置 SAE 环境变量时使用。两个连接串（`DATABASE_URL` 和 `POSTGRES_URI`）都指向同一个 RDS Serverless 实例。

#### ✅ 阶段一完成检查

| 检查项 | 状态 |
|--------|------|
| RDS Serverless 实例已创建 | ✅ |
| 高权限账号 `postgres` 已创建 | ✅ |
| 数据库 `langgraph_db` 已创建 | ✅ |
| VPC 白名单已配置 | ✅ |
| `uuid-ossp` 扩展已安装 | ✅ |
| `users` 表已创建 | ✅ |
| `idx_users_username` 索引已创建 | ✅ |
| VPC 内网地址已记录 | ✅ |
| LangGraph Checkpoint 表 | ⏭️ 后端首次启动时自动创建 |

---

### 阶段二：后端部署到 SAE

后端通过容器镜像部署到 SAE（Serverless 应用引擎），流程为：本地构建镜像 → 推送到 ACR → SAE 拉取镜像运行。

#### 1. 创建 ACR 镜像仓库

1. 登录 **[ACR 控制台](https://cr.console.aliyun.com)**
2. 创建 **命名空间**（如 `graph-xhs`）和 **镜像仓库**（如 `backend`）
3. 记录镜像仓库地址（如 `crpi-dxpwwh2xu5fk4t07.cn-hangzhou.personal.cr.aliyuncs.com`）

#### 2. 构建并推送镜像

   ```bash
# 1. 登录 ACR
docker login --username=mood6666 crpi-dxpwwh2xu5fk4t07.cn-hangzhou.personal.cr.aliyuncs.com

# 2. 构建镜像
   cd /path/to/graph_xiaohongshu
docker build --platform linux/amd64 \
  -t crpi-dxpwwh2xu5fk4t07.cn-hangzhou.personal.cr.aliyuncs.com/graph-xhs/backend:v1.0.0 .

# PowerShell（Windows）
docker build --platform linux/amd64 -t crpi-dxpwwh2xu5fk4t07.cn-hangzhou.personal.cr.aliyuncs.com/graph-xhs/backend:v1.0.0 .

# 3. 推送镜像到 ACR
docker push crpi-dxpwwh2xu5fk4t07.cn-hangzhou.personal.cr.aliyuncs.com/graph-xhs/backend:v1.0.0
```

#### 3. 创建 SAE 应用

1. 登录 **[SAE 控制台](https://sae.console.aliyun.com)**
2. 点击 **创建应用**：
   - **应用名称**：`ai-content-assistant`
   - **部署方式**：镜像部署
   - **镜像地址**：`crpi-dxpwwh2xu5fk4t07.cn-hangzhou.personal.cr.aliyuncs.com/graph-xhs/backend:v1.0.0`
   - **实例规格**：推荐 `1 核 2 GiB`（保证 LLM 流式回调处理效率）
   - **最小实例数**：`1`（避免冷启动）
   - **最大实例数**：按业务量设置（如 `5`）

3. **端口配置**：
   - 容器端口：`8000`（与 Dockerfile 中 `PORT` 默认值一致）

4. **健康检查**：
   - 检查路径：`/health`
   - 检查方式：HTTP GET
   - 端口：`8000`

#### 4. 配置环境变量

在 SAE 应用的 **环境变量** 配置中，注入以下变量：

**必填项：**

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:密码@pgm-bp16l24gbh51mh47.rwlb.rds.aliyuncs.com:5432/langgraph_db` | SQLAlchemy 异步连接（RDS **VPC 内网地址**） |
| `POSTGRES_URI` | `postgresql://postgres:密码@pgm-bp16l24gbh51mh47.rwlb.rds.aliyuncs.com:5432/langgraph_db` | LangGraph Checkpointer 连接（RDS **VPC 内网地址**） |
| `LLM_API_KEY` | `your-llm-api-key` | 火山引擎方舟平台大模型 API Key |
| `IMAGE_API_KEY` | `your-image-api-key` | Gemini API Key（海报生成 + 配图） |
| `JWT_SECRET_KEY` | 随机字符串 | JWT 签名密钥（**必须修改默认值**） |

> ⚠️ **数据库连接串说明**：
> - 两个连接串指向**同一个 RDS Serverless 实例**，仅协议前缀不同（`postgresql+asyncpg://` vs `postgresql://`）
> - host 必须使用 RDS 的 **VPC 内网地址**（`pgm-bp16l24gbh51mh47.rwlb.rds.aliyuncs.com`），不要用公网地址
> - SAE 与 RDS Serverless 在同一 VPC 内网直通，**不需要走 NAT 网关**，延迟 <1ms

**可选项（有默认值）：**

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DEBUG` | `true` | 调试模式（**生产环境设为 `false`**） |
| `LLM_BASE_URL` | `https://ark.cn-beijing.volces.com/api/v3` | LLM API 基础地址 |
| `LLM_MODEL` | `doubao-seed-1-8-251228` | 标准 LLM 模型（文章写作） |
| `LLM_MODEL_FAST` | `doubao-seed-1-6-flash-250828` | 快速 LLM 模型（选题生成） |
| `LLM_TEMPERATURE` | `0.7` | 标准模型温度 |
| `LLM_TEMPERATURE_FAST` | `0.7` | 快速模型温度 |
| `LLM_TEMPERATURE_EXTRACT` | `0.4` | 提取模型温度（配图要点） |
| `IMAGE_BASE_URL` | `https://cn-beijing.yuannengai.com` | 图片生成 API 基础地址 |
| `IMAGE_MODEL` | `gemini-3-pro-image-preview` | 图片生成模型 |
| `LOG_LEVEL` | `INFO` | 日志级别 |
| `LOG_CONSOLE` | `true` | 输出到控制台（SAE 自动采集 stdout） |
| `LOG_JSON` | `true` | JSON 格式日志（便于 SLS 解析） |
| `LOG_PII_ANONYMIZE` | `true` | 启用 PII 脱敏 |
| `JWT_ALGORITHM` | `HS256` | JWT 签名算法 |
| `JWT_EXPIRE_MINUTES` | `1440` | Token 有效期（分钟，默认 24 小时） |

#### 5. 配置公网访问（入站）

1. SAE 控制台 → 应用详情 → **网络配置** → **公网 CLB**，开启公网访问
2. 配置 HTTP:80 → 容器端口 8000
3. 记录分配的 **公网 CLB IP 地址**（如 `121.196.151.159`）
4. 在 DNS 控制台添加 **A 记录**：`xhs-api.dongwangai.top` → CLB 公网 IP

> ⚠️ **注意**：SAE 2023 年 7 月后不再支持复用已有 CLB，每个 SAE 应用会创建独立的 CLB 实例。

#### 6. 验证后端

   ```bash
# 健康检查
curl http://121.196.151.159/health
# 或使用域名
curl http://xhs-api.dongwangai.top/health
# 期望返回: {"status":"healthy","service":"AI内容运营助手"}
   ```

---

### 阶段 2.5：SAE 出网配置（NAT 网关）

> ⚠️ **SAE 容器默认无法主动访问公网**。CLB 入站（用户请求 → SAE）正常工作，但 SAE 容器 → 外部 API（火山引擎 Doubao、Gemini Image）的出站请求会失败。
>
> **症状**：LLM 调用超时 30 秒，图片生成失败，日志显示连接超时。
>
> **解决方案**：配置 NAT 网关 + EIP，为 SAE 容器提供公网出口。

#### 为什么需要 NAT 网关？

SAE 容器运行在阿里云 VPC（私有网络）内部，网络访问分为两个方向：

```
入站（已通过 CLB 解决）：
  用户浏览器 ──→ CLB (公网 IP) ──→ SAE 容器 (私网 IP)    ✅ 正常

出站（需要 NAT 网关）：
  SAE 容器 (私网 IP) ──→ ??? ──→ ark.cn-beijing.volces.com  ❌ 不通
  SAE 容器 (私网 IP) ──→ NAT 网关 ──→ EIP ──→ 公网          ✅ 通过 NAT
```

**本项目后端需要主动调用以下外部 API：**

| 外部 API | 域名 | 用途 |
|---------|------|------|
| 方舟 LLM | `ark.cn-beijing.volces.com` | 选题生成、文章写作、要点提取 |
| Gemini Image | `cn-beijing.yuannengai.com` | AI 配图生成 |

> 💡 **RDS Serverless 走 VPC 内网**，不需要 NAT 网关。NAT 网关仅用于以上外部 API 的公网出站。

如果不配置出网，**所有 AI 生成功能都会失败**（选题、写作、配图全部超时）。

> 💡 **简单理解**：CLB 是「门」，让用户进来；NAT 网关是「出口」，让容器出去。两个都要配。

#### 1. 确认 SAE 应用的 VPC 信息

1. SAE 控制台 → `ai-content-assistant` → **基础信息**
2. 记录 **VPC ID** 和 **交换机（vSwitch）ID**

> 💡 如果你已经为其他项目（如 ark-h5）配置过同 VPC 的 NAT 网关 + EIP + SNAT 规则（VPC 粒度），则**无需重复配置**，新 SAE 应用自动共享出网能力。可直接跳到「阶段三」。

#### 2. 购买弹性公网 IP (EIP)

1. 进入 **[弹性公网 IP 控制台](https://vpc.console.aliyun.com/eip)**
2. **创建弹性公网 IP**：
   - 地域：与 SAE 同地域
   - 计费方式：**按量付费**
   - 流量计费方式：**按使用流量**
   - 带宽峰值：**5 Mbps**（够用）
3. 记录 EIP 地址

#### 3. 创建公网 NAT 网关

1. 进入 **[NAT 网关控制台](https://vpc.console.aliyun.com/nat)**
2. **创建 NAT 网关**：
   - 地域：与 SAE 同地域
   - VPC：选择 **SAE 所在的 VPC**
   - 网络类型：**公网 NAT 网关**
   - 计费方式：**按量付费**
3. 创建时选择 **绑定已有弹性公网 IP**（选第 2 步创建的 EIP）

#### 4. 配置 SNAT 规则

> ⚠️ **踩坑警告**：SAE 自动创建的 VPC 中可能有多个交换机。SNAT 规则必须使用 **VPC 粒度** 覆盖所有交换机，否则容器分配到未覆盖的交换机时出网仍不通。

1. 进入 NAT 网关详情页 → **SNAT 管理**
2. 点击 **创建 SNAT 条目**：
   - SNAT 条目粒度：**VPC 粒度** ✅（不要选交换机粒度）
   - 弹性公网 IP：选择已绑定的 EIP
   - 条目名称：`sae-vpc-outbound`
3. 确认创建

#### 5. 验证出网能力

SNAT 规则创建后立即生效，**不需要重新部署 SAE 应用**。

   ```bash
# 通过后端健康检查验证
curl http://xhs-api.dongwangai.top/health
# 期望返回: {"status":"healthy","service":"AI内容运营助手"}

# 直接测试 AI 功能（选题生成依赖 LLM 出网调用）
# 如能正常返回选题结果，说明出网配置成功
```

---

### 阶段三：前端部署到 OSS + CDN

前端采用 Vue 3 + Vite 构建的 SPA 应用，构建后生成静态文件上传到 **OSS**，通过 **CDN** 加速访问。

#### 1. 构建前端

   ```bash
cd frontend

# 生产环境变量已配置在 frontend/.env.production：
# VITE_API_BASE_URL=http://xhs-api.dongwangai.top

# 构建（Vite 自动读取 .env.production）
npm install
npm run build
```

构建产出在 `frontend/dist/` 目录下。

#### 2. 创建 OSS 存储桶

1. 登录 **[OSS 控制台](https://oss.console.aliyun.com)**
2. **创建 Bucket**：
   - Bucket 名称：`ai-content-frontend`
   - 地域：选择与 SAE 相同地域
   - 存储类型：标准存储
   - 读写权限：**公共读**（ℹ️ 不使用 CDN 时必须设为公共读，否则匿名用户无法访问）
3. 进入 Bucket → **基础设置** → **静态页面**：
   - 默认首页：`index.html`
   - 默认 404 页：`index.html`（SPA 路由支持）

#### 3. 上传前端文件

   ```bash
# 方式一：OSS 控制台手动上传 frontend/dist/ 目录下所有文件

# 方式二：使用 ossutil 命令行批量上传
ossutil cp -r frontend/dist/ oss://ai-content-frontend/ --update
```

#### 4. 绑定自定义域名

1. OSS 控制台 → Bucket → **域名管理**
2. 点击 **绑定自定义域名**：
   - 自定义域名：`xhs.dongwangai.top`
   - 勾选 **「自动添加 CNAME 记录」**（如 DNS 在阿里云）
3. 如未自动添加，手动到 DNS 控制台添加 CNAME 记录：
   - 主机记录：`xhs`
   - 记录值：`ai-content-frontend.oss-cn-hangzhou.aliyuncs.com`（Bucket 外网域名）

#### 5. 配置 CDN 加速

1. 登录 **[CDN 控制台](https://cdn.console.aliyun.com)**
2. **添加域名**：
   - 加速域名：`xhs.dongwangai.top`
   - 业务类型：网页小文件
   - 源站类型：OSS 域名 → 选择 `ai-content-frontend.oss-cn-hangzhou.aliyuncs.com`
3. 获取 CDN 分配的 **CNAME 地址**

#### 6. 处理 SPA 路由（关键）

Vue SPA 应用刷新非根路径（如 `/workflow`）时，OSS 会返回 404。需配置错误页面重定向：

**方案 A：CDN 自定义错误页面（推荐）**

1. CDN 控制台 → 域名管理 → `xhs.dongwangai.top` → **缓存配置** → **自定义错误页面**
2. 添加规则：
   - HTTP 状态码：`404`
   - 重定向地址：`/index.html`
   - 返回状态码：`200`

**方案 B：OSS 静态页面设置**

1. OSS 控制台 → Bucket → **基础设置** → **静态页面**
2. 配置默认 404 页：`index.html`

> 两个方案任选一个即可，推荐方案 A（CDN 层处理更高效）。

#### 7. 验证前端

   ```bash
# 测试访问
curl -I http://xhs.dongwangai.top
# 期望返回: HTTP/1.1 200

# 测试 SPA 路由（应返回 200 而非 404）
curl -I http://xhs.dongwangai.top/workflow
# 期望返回: 200
   ```

---

### 阶段四：SSL 证书与 HTTPS 配置

> ⚠️ **必须完成此步骤**，原因：
> 1. 浏览器安全策略要求 HTTPS 页面不能请求 HTTP 接口（Mixed Content）
> 2. JWT Token 在 HTTP 明文传输中容易被截获
> 3. 搜索引擎和浏览器对 HTTPS 网站更友好

#### 1. 申请免费 SSL 证书

1. 进入 **[SSL 证书管理控制台](https://yundun.console.aliyun.com/?p=cas)**
2. 点击 **免费证书** → **创建证书** → **申请证书**
3. 分别为以下域名申请证书：
   - `xhs-api.dongwangai.top`（后端 API 域名）
   - `xhs.dongwangai.top`（前端域名）
4. 验证方式选择 **DNS 验证**：按页面提示添加 TXT 记录
5. 等待验证通过（通常 5~10 分钟），状态变为 **已签发**

#### 2. 配置 CLB HTTPS 监听（后端）

SAE 的 CLB 默认只有 HTTP:80 监听，需手动添加 HTTPS:443：

**2.1 上传 SSL 证书到 CLB**

> ⚠️ SAE CLB 的 HTTPS 配置下拉框默认**找不到在 SSL 证书管理控制台签发的证书**，需手动导入。

1. 去 **[传统型负载均衡 CLB 控制台](https://slb.console.aliyun.com/clb)** → **证书管理**
2. 点击 **创建证书**：
   - 证书来源：选择 **「阿里云签发证书」**（推荐，一键导入）
   - 如选「上传非阿里云签发证书」：下载 Nginx 格式证书，分别上传 `.pem` 和 `.key`
   - 证书名称：`xhs-api-dongwangai-top`
3. 创建完成

**2.2 添加 HTTPS:443 监听器**

1. SAE 控制台 → `ai-content-assistant` → **基础信息** → 公网 CLB 访问 → **编辑**
2. 切换到 **「HTTPS 协议」** 标签页
3. 配置：
   - HTTPS 端口：`443`
   - SSL 证书：选择刚上传的证书（如看不到请点「刷新」）
   - 容器端口：`8000`
4. 保存配置

#### 3. 配置 CDN HTTPS（前端）

1. CDN 控制台 → 域名管理 → `xhs.dongwangai.top` → **HTTPS 配置**
2. 点击 **修改配置**：
   - 证书来源：选择 **「云盾（SSL）证书中心」**
   - 选择已签发的 `xhs.dongwangai.top` 证书
3. 开启 **HTTP/2** 和 **强制 HTTPS 跳转**（可选）

#### 4. 配置 DNS 域名解析

在域名 DNS 管理后台（如阿里云 **[云解析 DNS](https://dns.console.aliyun.com)**）添加以下记录：

| 记录类型 | 主机记录 | 记录值 | 说明 |
|---------|---------|--------|------|
| **A** | `xhs-api` | CLB 公网 IP（`121.196.151.159`） | 后端 API 域名指向 SAE CLB |
| **CNAME** | `xhs` | OSS Bucket 域名 或 CDN CNAME 地址 | 前端域名指向 OSS/CDN |

> CLB 的公网 IP 可在 SAE 控制台 → 应用基础信息 → 公网 CLB 访问中查看。

#### 5. 验证 HTTPS

   ```bash
# 验证后端 HTTPS
curl https://xhs-api.dongwangai.top/health
# 期望返回: {"status":"healthy","service":"AI内容运营助手"}

# 验证前端 HTTPS
curl -I https://xhs.dongwangai.top
# 期望返回: HTTP/2 200

# 验证 DNS 解析
nslookup xhs-api.dongwangai.top
nslookup xhs.dongwangai.top
   ```

---

### 阶段五：安全加固

#### 1. CORS 跨域限制

修改 `app/main.py`，将 `allow_origins` 从 `["*"]` 改为具体域名：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://xhs.dongwangai.top",
        "https://xhs.dongwangai.top",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

> 修改后需重新构建镜像并推送到 ACR，然后在 SAE 控制台更新镜像版本。

#### 2. JWT 密钥

**必须**修改默认的 JWT 密钥，在 SAE 环境变量中设置 `JWT_SECRET_KEY`：

   ```bash
# 生成随机密钥
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

#### 3. RDS 数据库安全

1. **白名单限制**：RDS 白名单仅添加 SAE 所在 VPC 网段，不要添加 `0.0.0.0/0`
2. **强密码**：确保 RDS 使用强密码（大小写字母 + 数字 + 特殊字符）
3. **关闭公网访问**：生产环境建议关闭 RDS 的公网访问入口，仅保留 VPC 内网地址
4. **环境变量安全**：数据库密码通过 SAE 环境变量注入，不要写入代码或 Dockerfile

#### 4. SAE 安全组

SAE 默认安全组已限制了不必要的端口访问。确认：
- 入站仅开放 CLB 转发端口（由 SAE 自动管理）
- 出站通过 NAT 网关统一出口（用于外部 LLM/图片 API 调用，数据库走 VPC 内网）

---

## 不需要改的文件（确认清单）

以下文件在开发环境和生产环境完全相同，部署时不需要任何修改：

| 文件 | 原因 |
|------|------|
| `app/main.py` | 标准 FastAPI 应用入口（仅 CORS 域名需按需修改） |
| `app/core/config.py` | pydantic-settings，通过环境变量覆盖 |
| `app/core/db.py` | 数据库连接，读取 `DATABASE_URL` 环境变量 |
| `app/graph/**` | LangGraph 工作流逻辑，纯业务代码 |
| `app/services/llm_service.py` | 调用火山引擎 Doubao API，纯 HTTPS 请求 |
| `app/services/image_service.py` | 调用 Gemini Image API，纯 HTTPS 请求 |
| `app/api/**` | API 路由，纯业务逻辑 |
| `requirements.txt` | Python 依赖清单 |
| `Dockerfile` | 容器构建文件（已适配 SAE） |
| `frontend/` 全部源码 | 构建后部署为静态文件，不涉及服务器平台 |

---

## 日常发版工作流

### 后端更新

```bash
# 1. 拉取最新代码
cd /path/to/graph_xiaohongshu
git pull origin main

# 2. 构建新镜像
docker build --platform linux/amd64 \
  -t crpi-dxpwwh2xu5fk4t07.cn-hangzhou.personal.cr.aliyuncs.com/graph-xhs/backend:v1.0.1 .

# 3. 推送到 ACR
docker push crpi-dxpwwh2xu5fk4t07.cn-hangzhou.personal.cr.aliyuncs.com/graph-xhs/backend:v1.0.1

# 4. 在 SAE 控制台 → 部署应用 → 更新镜像版本 → 确认发布
# SAE 支持灰度发布和自动回滚
```

### 前端更新

```bash
# 1. 构建
cd frontend
npm install  # 如有新依赖
npm run build  # 自动读取 .env.production

# 2. 上传覆盖 OSS
ossutil cp -r dist/ oss://ai-content-frontend/ --update

# 3. 刷新 CDN 缓存
# CDN 控制台 → 刷新预热 → 提交 URL 刷新或目录刷新
```

---

## 运维与监控

### 日志查看

SAE 自动采集容器 stdout/stderr 日志，可通过以下方式查看：

```bash
# 方式一：SAE 控制台 → 应用详情 → 日志管理 → 实时日志
# 可查看实时 stdout 输出（structlog JSON 格式）

# 方式二：接入 SLS（日志服务）
# SAE 控制台 → 应用详情 → 日志管理 → 开启 SLS 日志采集
# 支持日志查询、告警、仪表盘

# 方式三：本地开发时查看文件日志
tail -f logs/app.log
tail -f logs/error.log
```

### 健康检查

```bash
# 后端健康检查
curl http://xhs-api.dongwangai.top/health
# 期望返回: {"status":"healthy","service":"AI内容运营助手"}

# 前端访问检查
curl -I http://xhs.dongwangai.top
# 期望返回: HTTP/1.1 200
```

### 数据库备份

RDS Serverless 提供与 RDS 常规版相同的自动备份功能，无需手动配置：

1. **自动备份**：RDS 控制台 → 实例详情 → **备份恢复** → 默认每日自动备份（保留 7 天）
2. **手动备份**：RDS 控制台 → **创建备份** → 可随时手动创建全量备份
3. **数据恢复**：支持按时间点恢复（精确到秒）或从备份集恢复

```bash
# 如需导出备份到本地（需开启 RDS 公网访问或通过跳板机）
pg_dump -h pgm-bp16l24gbh51mh47.rwlb.rds.aliyuncs.com -U postgres -d langgraph_db \
  -F c -f backup_$(date +%Y%m%d).dump
```

### LangSmith 链路追踪（可选）

如需监控 LangGraph 工作流的完整链路（Agent 思考、Prompt、LLM 调用），可集成 LangSmith：

在 SAE 环境变量中添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `LANGCHAIN_TRACING_V2` | `true` | 启用链路追踪 |
| `LANGCHAIN_API_KEY` | `your-langsmith-api-key` | LangSmith API Key |
| `LANGCHAIN_PROJECT` | `ai-content-assistant` | 项目名称 |

配置后可通过 [LangSmith 控制台](https://smith.langchain.com/) 实时分析和追踪工作流细节。

---

## 常见问题与排查

### 问题 1：浏览器报 Mixed Content 错误

**症状**：前端 HTTPS 页面加载后，所有 API 请求被浏览器拦截，控制台显示 `Mixed Content: The page was loaded over HTTPS, but requested an insecure resource`。

**原因**：前端通过 HTTPS 访问，但后端 API 还是 HTTP 协议（CLB 缺少 HTTPS 监听或 `VITE_API_BASE_URL` 未改为 HTTPS）。

**解决方案**：
1. 确认 CLB 已配置 HTTPS:443 监听（阶段四步骤 2）
2. 修改 `frontend/.env.production`，确保使用 HTTPS 地址：
   ```ini
   VITE_API_BASE_URL=https://xhs-api.dongwangai.top
   ```
3. 重新构建前端并上传 OSS + 刷新 CDN 缓存

---

### 问题 2：刷新页面返回 404

**症状**：首次访问正常，但在 Vue Router 的子路由（如 `/workflow`）下刷新页面返回 404。

**原因**：Vue Router 使用 History 模式，刷新时 OSS 直接查找对应路径的文件，找不到则返回 404。

**解决方案**：
配置 CDN 自定义错误页面（阶段三步骤 6）：
- HTTP 状态码：`404`
- 重定向地址：`/index.html`
- 返回状态码：`200`

或配置 OSS 静态页面设置，默认 404 页设为 `index.html`。

---

### 问题 3：LLM 调用超时（AI 功能全部失败）

**症状**：选题生成、文章写作、配图生成全部超时失败。SAE 日志显示连接超时（约 30 秒后报错）。

**原因**：**SAE 容器默认无法主动访问公网**。LLM API（`ark.cn-beijing.volces.com`）和图片 API（`cn-beijing.yuannengai.com`）都需要出网能力。

**解决方案**：配置 NAT 网关 + EIP + SNAT 规则（阶段 2.5），为 SAE 容器提供公网出口。

---

### 问题 4：CLB HTTPS 配置时证书下拉框为空

**症状**：SAE 控制台 → 编辑 CLB → 添加 HTTPS 监听 → SSL 证书下拉框显示「暂无数据」。

**原因**：SAE CLB 使用的是**传统型负载均衡（CLB）的证书管理系统**，与 SSL 证书管理控制台的证书不互通。

**解决方案**：
1. 去 **[传统型负载均衡 CLB 控制台](https://slb.console.aliyun.com/clb)** → **证书管理**
2. 点击 **「创建证书」** → 选择 **「阿里云签发证书」** 一键导入
3. 回到 SAE 的 HTTPS 配置页面点「刷新」即可看到

---

### 问题 5：SAE 连不上 RDS Serverless 数据库

**症状**：后端启动时报错 `connection refused` 或 `connection timed out`。

**排查步骤**：

| 检查项 | 排查方法 |
|--------|---------|
| VPC 是否一致 | SAE 和 RDS Serverless 必须在**同一个 VPC** |
| 白名单是否配置 | RDS 白名单添加 SAE VPC 网段（如 `192.168.0.0/16`） |
| 连接串是否正确 | 使用 RDS **内网地址**（`pgm-xxx.pg.rds.aliyuncs.com`），不要用 `localhost` |
| 数据库是否存在 | 确认已创建 `langgraph_db` 数据库 |
| 密码是否正确 | SAE 环境变量中的密码与 RDS 账号密码一致 |
| 实例是否暂停 | RDS Serverless 长时间无请求可能暂停，首次连接会自动唤醒（~1-3s） |

---

### 问题 6：SNAT 规则配置后出网仍不通

**症状**：已创建 NAT 网关和 SNAT 规则，但 SAE 容器仍无法访问公网。

**原因**：SAE 自动创建的 VPC 有多个交换机，SNAT 规则只绑定了某个交换机，而容器不在该交换机上。

**解决方案**：
删除所有「交换机粒度」的 SNAT 规则，改为 **「VPC 粒度」** 创建一条 SNAT 规则，覆盖该 VPC 下所有交换机。

---

### 问题 7：Docker 镜像推送失败（authorization failed）

**症状**：`docker push` 失败，提示 `push access denied, repository does not exist or may require authorization`。

**解决方案**：

```bash
# 确认登录正确的仓库地址
docker login --username=mood6666 crpi-dxpwwh2xu5fk4t07.cn-hangzhou.personal.cr.aliyuncs.com

# 推送时使用同一个仓库地址
docker push crpi-dxpwwh2xu5fk4t07.cn-hangzhou.personal.cr.aliyuncs.com/graph-xhs/backend:v1.0.1
```

> ⚠️ 注意区分 `registry.cn-hangzhou.aliyuncs.com`（企业版）和 `crpi-xxx.cn-hangzhou.personal.cr.aliyuncs.com`（个人版），两者不通用。

---

### 问题 8：图片生成失败（IMAGE_API_KEY 未配置）

**症状**：工作流执行到配图阶段报错 `IMAGE_API_KEY 未配置` 或图片生成超时。

**解决方案**：
1. 确认 SAE 环境变量中已配置 `IMAGE_API_KEY`
2. 确认 NAT 网关已配置（图片生成需要出网访问 Gemini API）
3. 验证 API Key 有效：
   ```bash
   curl -X POST "${IMAGE_BASE_URL}/v1beta/models/${IMAGE_MODEL}:generateContent" \
     -H "Authorization: Bearer ${IMAGE_API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"一只可爱的猫"}]}],"generationConfig":{"responseModalities":["IMAGE","TEXT"]}}'
   ```

---

### 问题 9：`too many connections` 数据库连接数耗尽

**症状**：多实例扩容后数据库报 `too many connections` 错误。

**原因**：SAE 每个容器实例都会创建独立的连接池。多实例同时运行时，连接数 = 实例数 × 单实例连接池大小。RDS Serverless 的连接数随 ACU 弹性调整（每 ACU ~100 连接）。

**解决方案**：
1. 减小每个实例的连接池大小（如 `pool_size=3`）
2. 控制 SAE 最大实例数
3. 调大 RDS Serverless 最大 ACU 上限（更高 ACU 支持更多连接数）
4. 如流量稳定且连接数需求高，考虑切换到 RDS 常规版（固定规格，连接数更可控）

---

## 费用估算参考

### SAE 后端（1 核 2G，最小 1 实例）

| 项目 | 单价 | 月费用（估算） |
|------|------|---------------|
| 计算资源 | ¥0.056/核·小时 + ¥0.028/GiB·小时 | ~¥81/月 |
| 公网带宽 | 按量（按流量计费） | ~¥10/月 |
| **小计** | | **~¥91/月** |

### NAT 网关 + EIP（出网必需）

| 项目 | 单价 | 月费用（估算） |
|------|------|---------------|
| NAT 网关（小型） | ¥0.5/小时 | ~¥36/月 |
| EIP 流量 | ¥0.8/GB | ~¥5/月（低流量） |
| **小计** | | **~¥41/月** |

### RDS PostgreSQL Serverless

| 项目 | 说明 | 月费用（估算） |
|------|------|---------------|
| 计算（ACU） | 按秒计费，0.5~8 ACU 自动弹性 | ~¥10~60/月（低流量 ~¥10） |
| 存储 | 20G SSD 起步，按量扩容 | ~¥5~15/月 |
| **小计** | | **~¥15~75/月** |

> 💡 **Serverless 计费优势**：低流量时 ACU 自动缩至最低，月费可低至 ~¥10。相比常规 RDS 基础版（固定 ¥50~80/月），个人项目可节省 50%~80% 的数据库费用。

### OSS + CDN 前端

| 项目 | 单价 | 月费用（估算） |
|------|------|---------------|
| OSS 存储 | ¥0.12/GB/月 | < ¥1/月 |
| CDN 流量 | ¥0.24/GB（低流量） | ~¥5/月 |
| **小计** | | **~¥6/月** |

> 总计约 **¥153~213/月**（低流量场景 ~¥153/月）。其中 SAE 计算是主要成本。
>
> 💡 **省钱技巧**：
> - RDS Serverless 低流量时自动缩容，费用远低于固定规格 RDS
> - SAE 最小实例数设为 `0`（允许缩容到零，但会有冷启动延迟）
> - 流量稳定后可评估切换到 RDS 常规版包年，获得更低单价

---

## 项目文件结构

```
graph_xiaohongshu/
├── DEPLOYMENT.md               ← 部署指南（本文档）
├── DEPLOYMENT_ALIYUN.md        ← 其他项目的阿里云部署参考
├── README.md                   ← 项目说明
├── Dockerfile                  ← 后端 Docker 构建文件（SAE 专用）
├── requirements.txt            ← Python 依赖清单
├── scripts/
│   └── init_db.sql             ← 数据库初始化脚本（用户表）
├── app/                        ← 后端业务代码
│   ├── main.py                 ← FastAPI 应用入口
│   ├── core/
│   │   ├── config.py           ← 配置管理（pydantic-settings）
│   │   ├── db.py               ← 数据库连接
│   │   ├── logger.py           ← 结构化日志（structlog）
│   │   ├── middleware.py       ← 请求日志中间件
│   │   ├── security.py         ← 密码哈希
│   │   └── pii_anonymizer.py   ← PII 脱敏
│   ├── api/v1/
│   │   ├── auth.py             ← 认证接口（注册/登录）
│   │   ├── workflow.py         ← 工作流接口（核心）
│   │   └── image.py            ← 图片接口
│   ├── graph/
│   │   ├── workflow.py         ← LangGraph 工作流编排
│   │   ├── state.py            ← 工作流状态定义
│   │   ├── utils.py            ← Checkpointer 工具
│   │   ├── metrics.py          ← 节点性能指标
│   │   ├── nodes/
│   │   │   ├── planner.py      ← 选题规划节点
│   │   │   ├── writer.py       ← 文章撰写节点
│   │   │   └── visualizer.py   ← 配图生成节点
│   │   └── subgraphs/
│   │       └── topic_selection.py  ← 选题子图
│   ├── models/
│   │   └── user.py             ← 用户数据模型
│   ├── services/
│   │   ├── llm_service.py      ← LLM 服务（火山引擎 Doubao）
│   │   └── image_service.py    ← 图片生成服务（Gemini）
│   └── dependencies/
│       └── auth.py             ← JWT 认证依赖
├── frontend/                   ← 前端源码
│   ├── package.json
│   ├── vite.config.js          ← Vite 配置（开发代理）
│   ├── .env.production         ← 生产环境变量
│   ├── index.html
│   ├── src/
│   │   ├── main.js             ← Vue 应用入口
│   │   ├── App.vue             ← 根组件
│   │   ├── api.js              ← API 请求封装（Axios + SSE）
│   │   └── style.css           ← 全局样式
│   └── dist/                   ← 构建产物（上传至 OSS）
├── static/images/generated/    ← AI 生成的配图（开发环境本地存储）
└── logs/                       ← 运行日志（开发环境本地存储）
```

---

## 部署操作总结

| 步骤 | 操作 | 耗时 |
|------|------|------|
| 1 | 创建 RDS Serverless PostgreSQL + 初始化数据库 | 15 分钟 |
| 2 | ACR 创建镜像仓库 + 构建推送镜像 | 10 分钟 |
| 3 | SAE 创建应用 + 注入环境变量 | 15 分钟 |
| 4 | NAT 网关 + EIP + SNAT 出网配置 | 10 分钟 |
| 5 | 前端构建 + OSS + CDN 部署 | 15 分钟 |
| 6 | SSL 证书申请 + CLB/CDN HTTPS 配置 | 15 分钟 |
| 7 | DNS 域名配置 + 验证 | 10 分钟 |
| 8 | 安全加固（CORS / JWT / RDS 白名单） | 5 分钟 |
| 9 | 端到端测试验证 | 5 分钟 |
| **合计** | | **~1.5 小时** |
