# 📊 微信数据管理与清洗导出系统架构

> 本文档描述 AiWxChat 系统中微信聊天数据从原始 SQLite 导入、多阶段清洗标注、到最终导出为训练数据/RAG 知识库并上传 TOS 对接客服系统的完整链路。

## 一、系统总览

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          微信数据管理与清洗导出系统                                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌────────────────┐  │
│  │  WeChat DB   │     │  ETL 导入    │     │  数据清洗     │     │  人工标注      │  │
│  │  MSG0-5.db   │────>│  解析+去重   │────>│  过滤+脱敏   │────>│  审核+分类    │  │
│  │  MicroMsg.db │     │  构建会话    │     │  切分对话块   │     │  质量评分     │  │
│  └─────────────┘     └──────────────┘     └──────────────┘     └──────┬─────────┘  │
│                                                                       │             │
│  ┌─────────────────────────────────────────────────────────────────────┼───────────┐│
│  │                          多格式导出引擎                              │           ││
│  │  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌────────▼────────┐  ││
│  │  │ ShareGPT  │ │ Alpaca    │ │ OpenAI    │ │ JSONL     │ │  RAG CSV        │  ││
│  │  │ (LLaMA)   │ │ (LoRA)    │ │ (FT API)  │ │ (通用)    │ │  规则/LLM/蒸馏  │  ││
│  │  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └────────┬────────┘  ││
│  └────────┼─────────────┼─────────────┼─────────────┼─────────────────┼───────────┘│
│           │             │             │             │                 │             │
│           ▼             ▼             ▼             ▼                 ▼             │
│      JSON 下载     JSON 下载     JSONL 下载    JSONL 下载     ┌──────────────┐     │
│                                                              │ TOS 自动上传  │     │
│                                                              │ rag-export/  │     │
│                                                              └──────┬───────┘     │
│                                                                     │              │
│                                                                     ▼              │
│                                                              ┌──────────────┐     │
│                                                              │ 火山引擎客服  │     │
│                                                              │ RAG 知识库   │     │
│                                                              └──────────────┘     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## 二、数据流水线（四阶段）

### 阶段一：ETL 导入（`etl.py`）

```
微信 SQLite 文件                              PostgreSQL / SQLite
┌────────────────────┐                       ┌─────────────────────┐
│ MicroMsg.db        │──── 通讯录解析 ──────>│ contacts 表          │
│  └─ Contact 表     │    wxid → 备注/昵称   │ (wxid, display_name) │
├────────────────────┤                       ├─────────────────────┤
│ ChatRoomUser.db    │──── 群成员映射 ──────>│ (内存 Map)           │
│  └─ ChatRoomUser   │    chatroom → members │                     │
├────────────────────┤                       ├─────────────────────┤
│ Multi/MSG0-5.db    │──── 消息解析 ────────>│ raw_chats 表         │
│  └─ MSG 表 × 6     │    时间过滤(>2025.10) │ (不可修改的原始数据) │
│                    │    群发送者解析       │                     │
│                    │    去重(source_db+id) │                     │
│                    │    语音文件关联       │                     │
├────────────────────┤                       ├─────────────────────┤
│ Voice/*.mp3        │──── 语音补链 ────────>│ raw_chats.voice_path │
└────────────────────┘                       ├─────────────────────┤
                                             │ sessions 表         │
                          会话统计构建 ─────>│ (聚合消息数/最后时间)│
                                             └─────────────────────┘
```

**核心特性**：
- **6 分片并行**：MSG0-MSG5 六个库依次导入，批量 1000 条写入
- **去重机制**：按 `source_db + local_id` 唯一键，支持增量导入
- **时间过滤**：`MIN_TIMESTAMP = 1759248000`（2025-10-01），只处理近期数据
- **群消息解析**：从 `content` 的 `wxid:\n内容` 格式或 `BytesExtra` 字段提取发送者

### 阶段二：数据清洗（`filter.py` + `admin.py`）

```
raw_chats (原始消息)
        │
        ▼
┌─────────────────────────── DataFilter 过滤引擎 ──────────────────────────┐
│                                                                          │
│  ① 内容分类 (classify_content)                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │VALUABLE  │ │CHITCHAT  │ │SENSITIVE │ │  SPAM    │ │ SYSTEM   │      │
│  │有价值内容 │ │闲聊/语气 │ │手机/身份证│ │垃圾广告  │ │系统/XML  │      │
│  │(保留)    │ │(可选保留) │ │(脱敏后保留)│ │(丢弃)   │ │(丢弃)   │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│                                                                          │
│  ② 脱敏处理 (desensitize)                                                │
│  手机号 138****1234 | 身份证 110***1234 | 银行卡 6222****1234             │
│  邮箱 a***@xx.com  | API Key sk-xxxx*** | 密码 ******                    │
│                                                                          │
│  ③ 销售场景优化                                                           │
│  高价值关键词（价格/课程/报名/异议/需求）→ 优先保留                         │
│  垃圾关键词（兼职/日赚/博彩）→ 直接过滤                                    │
└──────────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────── AdminService 预处理 ──────────────────────────┐
│                                                                          │
│  ① 时间窗口切分 (window_seconds=300)                                     │
│     连续5分钟内的消息 → 合并为一个对话块                                    │
│                                                                          │
│  ② 同角色合并                                                             │
│     同一人连续发送的多条消息 → 合并为单条                                    │
│                                                                          │
│  ③ AI 预标注                                                              │
│     auto_category: sales/course/objection/closing/followup/qa/casual      │
│     auto_quality_score: 规则评分(0-10) 或 LLM 评分                        │
│     auto_question / auto_answer: Q&A 自动提取                             │
│                                                                          │
│  ④ 写入暂存区                                                             │
│     staging_conversations 表 (status=PENDING)                             │
└──────────────────────────────────────────────────────────────────────────┘
```

### 阶段三：人工标注（`labeling.py`）

```
staging_conversations (PENDING)
        │
        ▼
┌──────────────────── 标注界面操作 ────────────────────┐
│                                                      │
│  审核人员可执行：                                      │
│  ✅ 批准 (APPROVED) ── 数据进入可导出状态              │
│  ❌ 拒绝 (REJECTED) ── 垃圾数据标记                   │
│  📝 修改分类 ── human_category 覆盖 auto_category     │
│  ✏️ 编辑内容 ── 修正清洗后的对话文本                    │
│  🔀 合并消息 ── 将多条原始消息合并为新对话块            │
│                                                      │
│  可选：发布到生产区 → labeled_conversations 表         │
└──────────────────────────────────────────────────────┘
```

### 阶段四：导出与客服对接（`export.py` + `training_data.py`）

```
staging_conversations (APPROVED) + custom_conversations
                    │
                    ▼
┌─────────────────── 导出清洗流水线 ──────────────────────────────────────┐
│                                                                        │
│  ① 价格脱敏 (_desensitize_price)                                       │
│     3999/4999 → [课程价格] | 原价/优惠价+数字 → [价格详询]              │
│     学费/报名费+金额 → [价格详询] | 支付方式 → "找教务办理"              │
│                                                                        │
│  ② 风格验证 (_validate_and_fix_gpt_response)                           │
│     价格违规关键词 → 替换为标准话术模板                                   │
│     "您"→"你" | 移除禁用标点 | 每行≤15字                                │
│                                                                        │
│  ③ 结构修复 (_clean_conversation_for_training)                          │
│     GPT先开口 → 补"你好" | 末尾human消息 → 移除                         │
│     过短(<4轮)丢弃 | 过长(>40轮)截断                                     │
│                                                                        │
│  ④ 分类system prompt注入                                                │
│     sales → 懂小智销售人设 | objection → 异议化解人设 | ...              │
└────────────────────────────────────────────────────────────────────────┘
                    │
        ┌───────────┼───────────┬───────────┬───────────┐
        ▼           ▼           ▼           ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ ┌────────────┐
   │ShareGPT │ │ Alpaca  │ │ OpenAI  │ │ JSONL  │ │  RAG CSV   │
   │  JSON   │ │  JSON   │ │ JSONL   │ │ Raw    │ │ (3种模式)  │
   └─────────┘ └─────────┘ └─────────┘ └────────┘ └─────┬──────┘
                                                         │
                                               ┌─────────▼─────────┐
                                               │  TOS 自动上传      │
                                               │  rag-export/{env}/ │
                                               └─────────┬─────────┘
                                                         │
                                               ┌─────────▼─────────┐
                                               │  火山引擎智能客服   │
                                               │  RAG 知识库导入    │
                                               └───────────────────┘
```

## 三、数据库模型

### 核心表关系

```
┌──────────────┐      ┌───────────────────────┐      ┌──────────────────────┐
│   contacts   │      │     raw_chats         │      │      sessions        │
│──────────────│      │───────────────────────│      │──────────────────────│
│ wxid (PK)    │<─────│ sender_wxid           │      │ session_id (PK)      │
│ display_name │      │ session_id ───────────┼─────>│ display_name         │
│ nickname     │      │ content               │      │ message_count        │
│ remark       │      │ msg_type              │      │ last_time            │
│ is_chatroom  │      │ is_sender             │      │ is_chatroom          │
└──────────────┘      │ timestamp             │      └──────────────────────┘
                      │ source_db + local_id  │
                      │ voice_path            │               ▲
                      └───────┬───────────────┘               │
                              │ source_message_ids            │
                              ▼                               │
┌─────────────────────────────────────────┐    ┌──────────────┴─────────────┐
│     staging_conversations               │    │   labeled_conversations    │
│─────────────────────────────────────────│    │────────────────────────────│
│ original_text / cleaned_text            │───>│ conversation_text          │
│ conversation_json (结构化对话)           │    │ conversation_json          │
│ session_id                              │    │ human_category / quality   │
│ auto_category / auto_quality_score      │    │ status (APPROVED)          │
│ human_category / human_question/answer  │    │ labeled_by / labeled_at    │
│ status (PENDING/APPROVED/REJECTED)      │    └────────────────────────────┘
│ reviewed_by / reviewed_at               │
└─────────────────────────────────────────┘
                              │
                              ▼
                ┌─────────────────────────┐
                │   knowledge_chunks      │
                │─────────────────────────│
                │ content_block           │
                │ embedding (vector)      │
                │ topic_summary           │
                │ keywords                │
                │ chunk_type (chat/labeled)│
                └─────────────────────────┘
```

### 分类体系 (ContentCategory)

| 分类 | 说明 | 对应 System Prompt |
|------|------|-------------------|
| `sales` | 销售话术 | 懂小智销售人设（极简微信风格） |
| `course` | 课程咨询 | 专业课程咨询师 |
| `objection` | 异议处理 | 同理心化解异议 |
| `closing` | 成交转化 | 把握成交时机 |
| `followup` | 客户跟进 | 贴心客户服务 |
| `qa` | 问答 | 耐心解答顾问 |
| `casual` | 闲聊 | 通常过滤 |
| `junk` | 垃圾 | 丢弃 |

## 四、RAG 导出与客服系统打通

### 4.1 三种 RAG 导出模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `rule` | 规则清洗 + 意图/标签自动补充 | 快速迭代，无需 LLM |
| `llm` | LLM 改写问答对，提升语义质量 | 高质量要求，速度慢 |
| `distill` | 分组聚合 → LLM 知识蒸馏 → 合并手写KB | 最高质量，适合生产 |

### 4.2 RAG 导出流水线

```
approved conversations
        │
        ▼
┌─── filter_rag_entries ───┐     ┌─── rule/llm/distill ───┐
│ 去空值、去重              │────>│ 规则：补充 intent/tags  │
│ 去无意义问答              │     │ LLM：改写为标准问答    │
│ 长度/质量过滤             │     │ 蒸馏：分组聚合+KB合并  │
└──────────────────────────┘     └───────────┬─────────────┘
                                             │
                                             ▼
                                    ┌────────────────┐
                                    │ CSV 生成        │
                                    │ question,answer │
                                    │ intent,tags     │
                                    │ source,conf     │
                                    │ content_type    │
                                    └────────┬───────┘
                                             │
                              ┌──────────────┼──────────────┐
                              ▼              ▼              ▼
                        浏览器下载      TOS 自动上传    火山知识库导入
                        (CSV文件)      rag-export/     (CSV直接导入)
                                       {env}/xxx.csv
```

### 4.3 TOS 上传与客服系统对接

**TOS 存储路径规范**：

```
TOS Bucket
└── rag-export/
    ├── dev/                                    # 开发环境
    │   ├── rag_labeled_training_rule.csv        # 聊天数据(规则清洗)
    │   ├── rag_labeled_training_distill.csv     # 聊天数据(知识蒸馏)
    │   ├── rag_materials_report.csv             # 素材喜报(结构化)
    │   ├── rag_materials_report_volcano.csv     # 素材喜报(火山兼容)
    │   └── rag_structured_knowledge.csv         # 手写知识库
    └── prod/                                   # 生产环境
        └── (同上)
```

**客服系统对接步骤**：

```
Step 1: 数据准备
  ├── ETL 导入微信数据 (python scripts/run_etl.py)
  ├── 后台管理 → "一键清洗" → 生成暂存区对话块
  └── 标注界面 → 审核/分类/批准

Step 2: RAG 导出
  ├── 前端 "导出数据" → 选择 RAG 格式
  ├── 选择模式: rule(快) / llm(准) / distill(最优)
  └── CSV 自动上传 TOS + 浏览器下载

Step 3: 客服知识库导入
  ├── 火山引擎智能客服 → 知识库管理 → 导入 CSV
  ├── 或配置 TOS 路径自动同步
  └── 素材 RAG + 聊天 RAG + 手写 KB 三源合一

Step 4: 验证
  └── 客户提问 → RAG 检索 → 返回匹配的销售话术/案例
```

## 五、知识库构建（向量检索）

```
┌─── 双通道知识库构建 ──────────────────────────────────────────────────┐
│                                                                      │
│  通道一：原始聊天 (build_all_sessions)                                │
│  raw_chats → 时间窗口切分 → 质量评分 → embedding → knowledge_chunks   │
│                                        (chunk_type='chat')           │
│                                                                      │
│  通道二：已标注数据 (build_from_labeled_data)                          │
│  staging(approved) → 清洗文本 → embedding → knowledge_chunks          │
│                                  (chunk_type='labeled', 权重×1.2)     │
│                                                                      │
│  质量评分维度（5维加权）：                                              │
│  ├── 实质内容占比 (0.25) ── 非噪音词消息的比例                         │
│  ├── 发言者数量   (0.15) ── ≥2人=对话交互                             │
│  ├── 平均消息长度 (0.15) ── ≥30字得满分                               │
│  ├── 长消息比例   (0.20) ── >20字的消息占比                           │
│  └── 销售关键词   (0.25) ── 命中领域关键词的比例                       │
│                                                                      │
│  语义搜索：                                                           │
│  ├── pgvector: SQL 原生 <=> 余弦距离 (高效)                           │
│  └── SQLite:   Python numpy 计算余弦 (降级)                           │
└──────────────────────────────────────────────────────────────────────┘
```

## 六、API 接口一览

### ETL 与管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/admin/etl` | 执行 ETL 导入 |
| `POST` | `/api/admin/preprocess` | 批量预处理会话 |
| `POST` | `/api/admin/preprocess/{session_id}` | 单会话预处理 |

### 数据标注

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/labeling/list` | 暂存区列表(分页/状态/分类) |
| `POST` | `/api/labeling/{id}/approve` | 批准 |
| `POST` | `/api/labeling/{id}/reject` | 拒绝 |
| `PUT` | `/api/labeling/{id}` | 编辑(分类/内容/Q&A) |
| `POST` | `/api/labeling/batch/approve` | 批量批准 |

### 导出

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/export/formats` | 支持的导出格式 |
| `POST` | `/api/export/labeled/preview` | 预览导出数据 |
| `POST` | `/api/export/labeled/dataset` | 导出训练数据集 |

### 知识库

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/knowledge/build` | 构建向量知识库 |
| `POST` | `/api/knowledge/build-labeled` | 从标注数据构建 |
| `GET` | `/api/knowledge/search` | 语义搜索 |

## 七、环境配置

```bash
# ─── 数据源 ───
WECHAT_DB_PATH=../Msg/Msg              # 微信数据库目录
VOICE_FILE_PATH=../Msg/Voice            # 语音文件目录

# ─── 数据库 ───
DATABASE_URL=postgresql://user:pass@localhost:5432/aiwxchat

# ─── Embedding（向量化） ───
EMBEDDING_MODEL=paraphrase-multilingual-MiniLM-L12-v2
EMBEDDING_DIM=384

# ─── LLM（AI 评分/RAG 改写/蒸馏） ───
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# ─── TOS（RAG CSV 自动上传） ───
TOS_ACCESS_KEY=your-access-key
TOS_SECRET_KEY=your-secret-key
TOS_ENDPOINT=https://tos-cn-beijing.volces.com
TOS_BUCKET=your-bucket-name

# ─── 环境标识 ───
APP_ENV=prod                            # 影响 TOS 路径: rag-export/{env}/

# ─── 知识库构建参数 ───
CHUNK_TIME_WINDOW_SECONDS=300           # 对话切分窗口(秒)
CHUNK_MIN_MESSAGES=3                    # 最少消息数
CHUNK_MAX_MESSAGES=50                   # 最多消息数
CHUNK_MIN_CONTENT_LENGTH=50             # 最短内容长度
CHUNK_MIN_QUALITY_SCORE=0.3             # 最低质量评分
```

## 八、服务模块依赖图

```
┌────────────────────────────────────────────────────────┐
│                     Routers (API层)                     │
│  admin.py │ labeling.py │ export.py │ knowledge.py     │
└─────┬──────────┬────────────┬───────────┬──────────────┘
      │          │            │           │
      ▼          ▼            ▼           ▼
┌────────────────────────────────────────────────────────┐
│                   Services (业务层)                     │
│  etl.py ─────── ETL 导入 + 通讯录解析                   │
│  admin.py ───── 会话预处理 + 对话块构建                  │
│  filter.py ──── 内容分类 + 脱敏 + 过滤                  │
│  training_data.py ── 训练数据清洗 + 格式转换             │
│  knowledge.py ── 知识库构建 + 向量搜索                   │
│  rag_rewriter.py ── RAG 规则/LLM 改写                   │
│  rag_distiller.py ── 知识蒸馏 + KB 合并                  │
│  quality_scorer.py ── LLM 质量评分                      │
│  tos_service.py ── TOS 上传/下载/预签名                  │
│  embedding.py ── 向量化服务                              │
└────────────────────────────────────────────────────────┘
      │          │            │
      ▼          ▼            ▼
┌────────────────────────────────────────────────────────┐
│                 Infrastructure (基础设施)               │
│  PostgreSQL (pgvector) │ 微信 SQLite │ TOS 对象存储     │
│  DeepSeek/OpenAI LLM   │ sentence-transformers          │
└────────────────────────────────────────────────────────┘
```
