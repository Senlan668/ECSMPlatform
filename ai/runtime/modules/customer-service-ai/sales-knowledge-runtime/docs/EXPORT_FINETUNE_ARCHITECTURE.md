# AiWxChat 导出数据微调架构文档

> 本文档详细描述从已标注/自定义数据到可用微调训练数据集的完整架构设计。

---

## 一、整体数据流

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         数据源（3 类并行输入）                           │
│                                                                         │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────────────────┐  │
│  │ staging_     │  │ custom_           │  │ raw_chats               │  │
│  │ conversations│  │ conversations     │  │ (原始微信消息)           │  │
│  │ status=      │  │ is_active=True    │  │ 仅 legacy 通道使用       │  │
│  │ 'approved'   │  │ (手动/AI生成)     │  │                          │  │
│  └──────┬───────┘  └────────┬──────────┘  └───────────┬──────────────┘  │
└─────────┼──────────────────┼──────────────────────────┼─────────────────┘
          │                  │                          │
          ▼                  ▼                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    导出清洗 Pipeline（7 阶段）                           │
│                                                                         │
│  1. 结构化解析 → 2. 角色前缀清洗 → 3. 价格脱敏 → 4. 风格验证修复       │
│  → 5. 对话完整性修复 → 6. 长度过滤/截断 → 7. 残留占位符清理             │
│                                                                         │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     格式转换 & 增强（5 种格式）                          │
│                                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │ ShareGPT │ │ Alpaca   │ │ OpenAI   │ │ JSONL    │ │ RAG 知识库    │  │
│  │ .json    │ │ .json    │ │ .jsonl   │ │ .jsonl   │ │ .csv          │  │
│  │ 多轮对话  │ │ 指令微调  │ │ OAI FT  │ │ 通用     │ │ Q&A 问答对    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────┬───────┘  │
└─────────────────────────────────────────────────────────────┼──────────┘
                                                              │
                               ┌──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    RAG 专属增强通道（3 种模式）                           │
│                                                                         │
│  ┌─────────────┐  ┌─────────────────┐  ┌────────────────────────────┐  │
│  │ 📏 规则清洗  │  │ ✨ LLM 逐条改写  │  │ 🧪 知识蒸馏                │  │
│  │ rule        │  │ llm             │  │ distill                    │  │
│  │ 去重+过滤   │  │ DeepSeek 并发   │  │ 按 intent 分组 → LLM 蒸馏  │  │
│  │ +补元数据   │  │ 15 线程异步     │  │ → 合并手写知识库            │  │
│  └─────────────┘  └─────────────────┘  └────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          输出 & 分发                                     │
│                                                                         │
│  📥 浏览器下载（JSON/JSONL/CSV）                                         │
│  ☁️ 火山引擎 TOS 自动上传（RAG 格式专属）                                │
│  📊 统计报告（总数/分类/质量/RAG 质量分桶）                               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 二、清洗 Pipeline 详解（7 阶段）

### 阶段 1：结构化解析

从数据源提取标准 Messages 列表，按优先级使用三种策略：

| 策略 | 数据源字段 | 质量 | 说明 |
|------|-----------|------|------|
| A | `conversation_json` | ★★★ | 完整多轮结构化 JSON，最高质量 |
| B | `human_question` + `human_answer` | ★★☆ | 单轮 Q&A 对，次优 |
| C | `cleaned_text` / `original_text` | ★☆☆ | 原始文本 fallback，最低质量 |

### 阶段 2：角色前缀清洗 (`_clean_content_for_export`)

- 移除角色前缀（如 `"张三:"`, `"徒弟-🎉Jason🎉:"`）
- Assistant 内容中移除混入的他人消息行
- 移除重复的上文（检测头部重叠）

### 阶段 3：价格脱敏 (`_desensitize_price`)

**脱敏对象**（保护商业信息）：
- 常见课程价格：`3999/4999/5999` 等 → `[课程价格]`
- 价格语境：`原价xxx/优惠价xxx` → `[价格详询]`
- 报名费用：`学费/定金/尾款` + 金额 → `[价格详询]`
- 直接报价：`都是xxxx来的/给你xxxx` → 标准回复替换
- 支付方式：`微信还是支付宝` → `付款方式私聊教务`

**保留对象**：
- 薪资信息：`10k/20k/25k` → 保留（训练需要）

### 阶段 4：风格验证修复 (`_validate_and_fix_gpt_response`)

仅对 GPT/Assistant 回复生效：

| 规则 | 处理 | 优先级 |
|------|------|--------|
| 价格违规关键词 | 整体替换为标准价格回复模板 | 最高 |
| 禁词 `"您"` | → `"你"` | 高 |
| 禁词 `"亲"` | 移除 | 高 |
| 禁用中文标点 | 移除 `。，！？、；：` | 中 |
| 超长行 (>15字) | 智能拆分换行 | 中 |

### 阶段 5：对话完整性修复

- GPT 先开口 → 前面补 `{"from": "human", "value": "你好"}`
- 对话以 human 结尾 → 移除末尾 human 消息
- 确保 human → gpt 交替结构

### 阶段 6：长度过滤与截断

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `min_turns` | 4 条消息 | 至少 2 轮对话（human+gpt×2） |
| `max_turns` | 40 条消息 | 超过则截取前 40 条 |

### 阶段 7：残留占位符清理

- 清理 `[课程价格]`, `[优惠价]`, `[金额]` 等残留占位符
- 保留微信表情 `[捂脸]`, `[呲牙]` 等
- 清理 `[资料链接]` 占位符
- 移除多余空行和空格

---

## 三、5 种导出格式

### 3.1 ShareGPT（推荐，多轮对话微调）

**适用**：LLaMA-Factory / FastChat

```json
{
  "id": "abc123",
  "conversations": [
    {"from": "system", "value": "我是懂王Ai的懂小智..."},
    {"from": "human", "value": "这个课程要学多久"},
    {"from": "gpt", "value": "正常3个月左右\n有基础的快一点"}
  ],
  "category": "course",
  "quality": "high"
}
```

### 3.2 Alpaca（指令微调）

**适用**：Stanford Alpaca / LoRA

```json
{
  "instruction": "这个课程要学多久",
  "input": "",
  "output": "正常3个月左右\n有基础的快一点",
  "category": "course"
}
```

### 3.3 OpenAI Chat（OpenAI 微调 API）

```jsonl
{"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

### 3.4 JSONL（通用格式）

保留完整元数据（id、category、quality、session_id、metadata）。

### 3.5 RAG 知识库（火山引擎等平台）

**输出格式**：CSV（带 BOM 头），8 列

```
question, answer, category, intent, tags, source, confidence, content_type
```

---

## 四、RAG 专属增强通道（3 种模式）

### 4.1 规则清洗模式 (`rule`)

```
输入 Q&A 对
    │
    ├─ Step 1: filter_rag_entries() — 基础过滤
    │   · 去空/去重/去无意义问题
    │   · 答案 < 10 字丢弃
    │   · 价格模板去重（仅保留 1 条）
    │   · 答案完全去重（MD5）
    │
    ├─ Step 2: rule_based_rewrite() — 规则改写
    │   · 补充 intent（关键词匹配 12 种意图）
    │   · 补充 tags（自动提取 3-5 个标签）
    │   · 推断 source（15 种来源规则）
    │   · 分类 content_type（knowledge/script/noise）
    │   · 计算 confidence（4 维度 0-1 评分）
    │
    └─ Step 3: 过滤 noise 类数据
```

**Content Type 分类逻辑**：

| 类型 | 判定规则 | 去向 |
|------|---------|------|
| `knowledge` | 包含事实信息（课程/技术栈/就业数据） | 入知识库 |
| `script` | 销售话术/情绪化表达/直播引流 | 入话术库 |
| `noise` | 纯追问/打招呼/无信息量 | 丢弃 |

**Confidence 多维度评分（0-1）**：

| 维度 | 权重 | 评分依据 |
|------|------|---------|
| 内容形态 | 0.30 | knowledge=0.30, script=0.15, noise=0 |
| 答案质量 | 0.30 | 长度 + 无追问 + 问题清晰度 |
| 答案稳定性 | 0.20 | 无时效性 + 无个人称呼 + 无脏话 |
| 信息完整度 | 0.20 | 事实数据 + 结构 + 来源 + 问答关联 |

### 4.2 LLM 改写模式 (`llm`)

```
输入 Q&A 对
    │
    ├─ Step 1: filter_rag_entries() — 基础过滤
    │
    ├─ Step 2: RagRewriter.batch_rewrite() — LLM 并发改写
    │   · 15 线程并发调用 DeepSeek API
    │   · 每条：清理问题 + 删噪声合碎片 + 分类标注
    │   · 输出：标准化 Q&A + intent/tags/source/confidence/content_type
    │   · 后处理：postprocess_answer() 规则兜底清理
    │
    ├─ Step 3: 置信度过滤（min_confidence=0.4）
    │
    └─ Step 4: 过滤 noise 类数据
```

**后台异步任务模式**：
- `POST /api/export/rag-llm/start` → 启动后台任务
- `GET /api/export/rag-llm/status/{task_id}` → 轮询进度
- `GET /api/export/rag-llm/download/{task_id}` → 下载结果
- 前端 2 秒间隔轮询，实时显示进度条和 ETA

### 4.3 知识蒸馏模式 (`distill`)（推荐）

```
输入 Q&A 对
    │
    ├─ Step 1: filter_rag_entries() — 基础过滤
    │
    ├─ Step 2: group_by_intent() — 按意图分组聚合
    │   · 12 种意图分类（课程内容/学习周期/价格/就业...）
    │   · 每组按 answer 长度降序，取前 10 条
    │   · 小于 min_group_size（默认 2）的组跳过
    │
    ├─ Step 3: RagDistiller.batch_distill() — LLM 并发蒸馏
    │   · 5 线程并发，每组取 8 段对话
    │   · LLM 从多段对话中提炼 1 条标准知识
    │   · 输出：标准化 Q + 结构化 A + variants（3-5 个问法变体）
    │   · LLM 不可用时自动 rule_fallback（选最长 answer）
    │
    ├─ Step 4: merge_with_knowledge_base() — 合并手写知识库
    │   · 手写知识库全量保留（confidence=1.0）
    │   · 蒸馏结果中 intent 已被手写覆盖的 → 跳过
    │   · 未覆盖的蒸馏结果 → 追加
    │
    └─ Step 5: flatten_for_volcano() — 展开变体
        · 每个 variant 独立一行，answer 复用
        · 火山引擎知识库兼容格式
```

---

## 五、System Prompt 分类映射

每种分类注入不同的角色设定：

| 分类 | 角色定位 | 核心规则 |
|------|---------|---------|
| `sales` | 懂小智·职业导师 | 极简微信风格 / 每行≤15字 / 严禁报价 / 高姿态筛选 |
| `course` | 懂小智·课程咨询 | Python→AI应用开发 / 录播+直播 / 3个月 / 3年有效期 |
| `objection` | 懂小智·异议处理 | 7 种常见异议应对策略 / 投资回报逻辑 |
| `closing` | 懂小智·成交引导 | 成交4步流程 / 要电话开课 |
| `followup` | 懂小智·售后服务 | 学习进度/设备绑定/发票/退款/简历 |
| `qa` | 懂小智·问答 | 最简洁方式回答 / 朋友聊天风格 |
| `knowledge` | 懂小智·知识分享 | 通俗解释 / 结合行业趋势 / 引导课程兴趣 |

**所有分类共享的硬性红线**：
- 严禁说出具体价格数字
- 严禁中文标点符号
- 严禁使用 `"您"` 和 `"亲"`

---

## 六、API 端点汇总

### 已标注数据导出（推荐通道）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/export/formats` | GET | 获取支持的格式/质量/分类列表 |
| `/api/export/labeled/preview` | POST | 预览已标注数据（含统计） |
| `/api/export/labeled/dataset` | POST | 导出已标注训练数据集 |

### RAG LLM 异步通道

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/export/rag-llm/start` | POST | 启动 LLM 改写后台任务 |
| `/api/export/rag-llm/status/{id}` | GET | 查询任务进度 |
| `/api/export/rag-llm/download/{id}` | GET | 下载改写结果 CSV |

### 原始数据导出（Legacy）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/export/preview` | POST | 预览原始数据导出 |
| `/api/export/dataset` | POST | 导出原始训练数据集 |

---

## 七、核心代码模块关系

```
routers/export.py                    ← API 层（2300+ 行）
    │
    ├── _clean_conversation_for_training()   ← 7 阶段清洗 Pipeline
    ├── _desensitize_price()                 ← 价格脱敏引擎
    ├── _validate_and_fix_gpt_response()     ← 风格验证修复
    ├── _format_staging_item()               ← 已标注数据格式化
    ├── _format_custom_item()                ← 自定义数据格式化
    ├── _get_system_prompt_for_category()     ← 7 套 System Prompt
    │
    ├── services/training_data.py            ← 训练数据生成服务
    │   ├── DataCleaner                      ← 数据清洗器（拒绝/脱敏）
    │   ├── ConversationBuilder              ← 对话重构器（切片/合并）
    │   ├── QualityEvaluator                 ← 质量评估器（4因素打分）
    │   ├── TrainingDataExporter              ← 5 格式导出器
    │   └── TrainingDataPipeline             ← 主处理流程编排
    │
    ├── services/rag_rewriter.py             ← RAG 改写服务
    │   ├── filter_rag_entries()             ← 基础过滤
    │   ├── rule_based_rewrite()             ← 规则改写
    │   ├── classify_content_type()          ← 内容形态分类
    │   ├── compute_confidence()             ← 多维度置信度
    │   ├── RagRewriter                      ← LLM 改写器（并发）
    │   └── postprocess_answer()             ← LLM 输出后处理
    │
    └── services/rag_distiller.py            ← RAG 蒸馏服务
        ├── group_by_intent()                ← 意图分组聚合
        ├── load_knowledge_base()            ← 加载手写知识库
        ├── merge_with_knowledge_base()      ← 合并策略
        ├── RagDistiller                     ← LLM 蒸馏器（并发）
        └── flatten_for_volcano()            ← 火山引擎格式展开
```

---

## 八、前端交互流程

```
ExportView.tsx
    │
    ├── Step 1: 选择数据来源
    │   · 全部数据（标注 + 自定义）
    │   · 仅 AI 生成
    │
    ├── Step 2: 选择导出格式
    │   · ShareGPT / Alpaca / OpenAI / JSONL / RAG
    │   · RAG 格式额外选择清洗模式（rule/llm/distill/raw）
    │
    ├── Step 3: 配置筛选条件
    │   · 质量等级（high/medium/low）
    │   · 8 种分类标签（可多选）
    │   · 高级设置（时间窗口/最大轮次/System Prompt）
    │   · AI 增强（LLM 评分/智能去重/包含自定义数据）
    │
    ├── Step 4: 预览数据
    │   · POST /labeled/preview → 返回样本 + 统计
    │   · 展示：总数、分类分布、RAG 质量分桶
    │
    └── Step 5: 导出
        · 常规格式 → 直接下载
        · RAG + LLM → 后台异步任务 → 2秒轮询 → 完成后下载
        · RAG → 自动上传 TOS 云存储
```

---

## 九、质量保障体系

### 多层过滤机制

| 层级 | 位置 | 规则 |
|------|------|------|
| L1 数据源 | staging_conversations | 仅 status=approved（人工审核通过） |
| L2 价格过滤 | export router | 含价格关键词的条目整体跳过（可选） |
| L3 结构化清洗 | Pipeline 阶段 1-7 | 角色清洗/脱敏/风格修复/完整性 |
| L4 长度过滤 | Pipeline 阶段 6 | min_turns=4, max_turns=40 |
| L5 质量评分 | QualityEvaluator | 4 因素加权评分（轮次/长度/QA结构/关键词） |
| L6 LLM 评分 | quality_scorer（可选） | DeepSeek 精准评估 0-10 分 |
| L7 RAG 过滤 | rag_rewriter | content_type 分类 + confidence 阈值 |

### 数据安全红线

- **价格信息**：多层脱敏 + 违规检测 + 标准回复替换
- **个人信息**：手机号/身份证/银行卡/邮箱/验证码自动脱敏
- **敏感词**：支付方式/账号信息替换为标准话术
- **URL 清理**：所有链接直接移除（不留占位符）
