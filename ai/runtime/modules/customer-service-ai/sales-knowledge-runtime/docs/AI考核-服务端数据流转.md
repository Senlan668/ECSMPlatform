# AI 考核 - 服务端数据流转说明

## 整体架构

```
前端 /quiz 页面
    ↓ HTTP API
后端 FastAPI (routers/quiz.py)
    ↓ 业务调用
服务层 (services/quiz.py)
    ↓ 读取知识库 + 调用 LLM
数据库 (Quiz / QuizAttempt 表)
```

**涉及文件：**
| 文件 | 职责 |
|------|------|
| `backend/app/routers/quiz.py` | API 路由层，处理请求/响应、状态校验、数据库读写 |
| `backend/app/services/quiz.py` | 核心业务层，知识库加载、LLM 出题、LLM 评判 |
| `backend/app/models/chat.py` | 数据模型：`Quiz`、`QuizAttempt`、`KnowledgeArticle`、`KnowledgeChunk` |

---

## 数据库表结构

### Quiz（试卷表 `quizzes`）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 试卷 ID |
| title | String(200) | 试卷标题，如"销售话术考核 #3" |
| category | String(50) | 考核分类：sales/objection/closing/course/followup |
| questions_json | JSON | 题目数组 `[{id, question, reference_answer, difficulty, category}]` |
| question_count | Integer | 题目数量 |
| status | String(20) | 状态：`generated` |
| created_at | DateTime | 创建时间 |

### QuizAttempt（作答记录表 `quiz_attempts`）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | 作答记录 ID |
| quiz_id | Integer FK | 关联试卷 ID |
| user_answers_json | JSON | 用户答案 `[{question_id, answer}]` |
| ai_evaluation_json | JSON | AI 评判结果 `[{question_id, score, feedback, is_reasonable}]` |
| ai_total_score | Float | AI 评分总分（0-100） |
| human_score | Float | 人工评分（0-100） |
| human_feedback | Text | 人工评语 |
| status | String(20) | 状态流转：`answering → submitted → ai_graded → human_reviewed` |
| created_at | DateTime | 开始答题时间 |
| submitted_at | DateTime | 提交答案时间 |
| graded_at | DateTime | AI 评判完成时间 |

---

## 一、出题数据流转

### 流程总览

```
POST /api/quiz/generate
    ↓
router: generate_quiz()
    ↓
service: generate_quiz_questions(db, category, count)
    ├── 1. _load_knowledge_context()  ← 从 DB 加载知识素材
    ├── 2. 构造 system_prompt + user_prompt
    ├── 3. LLM API 调用 (DeepSeek/OpenAI)
    └── 4. 解析 JSON 返回题目列表
    ↓
router: 创建 Quiz 记录写入 DB
    ↓
返回 JSON 给前端
```

### 详细步骤

#### 步骤 1：前端发起出题请求

```
POST /api/quiz/generate
Body: {
    "category": "sales",     // 考核分类
    "count": 10,             // 题目数量（1-20）
    "title": "可选标题"       // 不传则自动生成
}
```

#### 步骤 2：加载知识库素材 `_load_knowledge_context()`

> **注意：此步骤不涉及 RAG（向量检索增强生成）。** 没有 embedding 向量化，没有语义相似度匹配，仅通过 SQL 按分类+置信度排序拉取数据，拼接成文本塞进 Prompt。

服务层从数据库加载参考素材，有两个优先级：

**优先级 1 — `knowledge_articles` 表（结构化知识条目）：**
- 按 `scene_category` 筛选对应分类
- 按 `confidence` 置信度降序排列，取前 30 条
- 拼接每条的 `scene`（场景）、`customer_says`（客户说法）、`recommended_response`（推荐话术）

```
场景: 客户犹豫价格太贵
客户说: 你们这个太贵了吧
推荐回复: 我理解您的顾虑，其实从性价比来看...
---
```

**优先级 2 — `knowledge_chunks` 表（通用知识分块）：**
- 当 `knowledge_articles` 无数据时的降级方案
- 直接取前 30 条的 `content_block` 拼接

**无数据时：** 返回空字符串，LLM 将完全依赖自身能力出题。

#### 步骤 3：构造 Prompt 调用 LLM

**LLM 客户端选择逻辑：**
1. 优先使用 DeepSeek（`deepseek_api_key` + `deepseek_base_url`），模型 `deepseek-chat`
2. 降级使用 OpenAI（`openai_api_key` + `openai_base_url`），模型 `gpt-4o-mini`
3. 都没配置则抛出异常

**System Prompt 关键指令：**
- 角色：资深销售培训考官
- 任务：基于知识库素材出 N 道开放式销售场景题
- 难度分布：简单 3 题 + 中等 4 题 + 困难 3 题（10 题为例）
- 要求：模拟真实客户场景，每题提供参考答案
- 输出格式：严格 JSON 数组

**User Prompt：** 将知识库素材原文 + 出题指令拼接

**LLM 参数：** `temperature=0.7`（较高创造性），`max_tokens=4000`

#### 步骤 4：解析 LLM 返回

```python
# 用正则从 LLM 返回中提取 JSON 数组
json_match = re.search(r'\[.*\]', content, re.DOTALL)
questions = json.loads(content)
# 规范化：确保每题有 id、category、difficulty
for i, q in enumerate(questions):
    q["id"] = i + 1
    q["category"] = category
```

最终得到题目列表：
```json
[
  {
    "id": 1,
    "question": "客户说：你们这个课程太贵了，别家便宜多了。你应该如何回复？",
    "reference_answer": "我理解您关注价格，不过咱们先看看课程能给您带来什么...",
    "difficulty": "easy",
    "category": "sales"
  }
]
```

#### 步骤 5：写入数据库

Router 层创建 `Quiz` 记录：
- `title`：用户指定 或 自动生成（如"销售话术考核 #3"）
- `category`：考核分类
- `questions_json`：完整题目数组
- `question_count`：实际题目数
- `status`：`"generated"`

#### 步骤 6：返回前端

```json
{
    "id": 1,
    "title": "销售话术考核 #3",
    "category": "sales",
    "question_count": 10,
    "questions": [...]
}
```

---

## 二、答题数据流转

答题分为 **4 个阶段**，每个阶段对应独立的 API 调用：

```
开始答题 → 提交答案 → AI评判 → 人工评测(可选)
```

### 流程总览

```
POST /api/quiz/{quiz_id}/start          ← 创建作答记录
    ↓ status = "answering"
POST /api/quiz/attempt/{id}/submit      ← 提交答案
    ↓ status = "submitted"
POST /api/quiz/attempt/{id}/ai-grade    ← AI 评判
    ↓ status = "ai_graded"
PUT  /api/quiz/attempt/{id}/human-review ← 人工评测（可选）
    ↓ status = "human_reviewed"
```

### 阶段 1：开始答题

```
POST /api/quiz/{quiz_id}/start
```

**服务端逻辑：**
1. 校验试卷 `quiz_id` 是否存在
2. 创建 `QuizAttempt` 记录，`status = "answering"`
3. 返回 `attempt_id`

**数据库写入：**
```
quiz_attempts 表新增一行:
  quiz_id = 传入的试卷ID
  status = "answering"
  created_at = 当前时间
```

### 阶段 2：提交答案

```
POST /api/quiz/attempt/{attempt_id}/submit
Body: {
    "answers": [
        {"question_id": 1, "answer": "用户的回答内容..."},
        {"question_id": 2, "answer": "用户的回答内容..."}
    ]
}
```

**服务端逻辑：**
1. 校验 `attempt_id` 存在 且 `status == "answering"`
2. 将答案数组存入 `user_answers_json`
3. 更新 `status = "submitted"`，记录 `submitted_at` 时间

**数据库更新：**
```
quiz_attempts 表更新:
  user_answers_json = [{question_id, answer}, ...]
  status = "submitted"
  submitted_at = 当前UTC时间
```

### 阶段 3：AI 评判

```
POST /api/quiz/attempt/{attempt_id}/ai-grade
```

**服务端逻辑：**

1. **校验状态**：`attempt.status` 必须是 `"submitted"`
2. **加载数据**：从 DB 取出试卷的 `questions_json` 和作答的 `user_answers_json`
3. **调用 `ai_grade_answers()`：**

**构建评判素材：**
将每道题的题目、参考答案、用户答案拼接成文本：
```
题目1: 客户说：太贵了。你应该如何回复？
参考答案: 我理解您关注价格...
学员回答: 我觉得我们的课程性价比很高...

题目2: ...
```

**System Prompt 关键指令：**
- 角色：资深销售培训评审专家
- 评判维度：实战性、需求把握、销售策略、话术自然度、红线检查
- 评分标准：0-10 分（8-10 优秀 / 5-7 合格 / 0-4 不合格）
- 输出格式：严格 JSON 数组

**LLM 参数：** `temperature=0.3`（较低，保证评判稳定性），`max_tokens=4000`

4. **解析评判结果：**

```json
[
  {
    "question_id": 1,
    "score": 8,
    "feedback": "回复贴近实战，抓住了客户的价格顾虑，但可以更进一步挖掘客户的具体需求...",
    "is_reasonable": true
  }
]
```

5. **计算总分：**

```python
scores = [e.get("score", 0) for e in evaluations]
total = round(sum(scores) / len(scores) * 10, 1)  # 平均分 × 10，映射到 0-100
```

例如 10 道题平均 7.5 分 → 总分 75.0

6. **写入数据库：**

```
quiz_attempts 表更新:
  ai_evaluation_json = [{question_id, score, feedback, is_reasonable}, ...]
  ai_total_score = 75.0
  status = "ai_graded"
  graded_at = 当前UTC时间
```

### 阶段 4：人工评测（可选）

```
PUT /api/quiz/attempt/{attempt_id}/human-review
Body: {
    "human_score": 80.0,
    "human_feedback": "整体表现不错，第3题话术可以更自然..."
}
```

**服务端逻辑：**
1. 更新 `human_score` 和 `human_feedback`
2. 更新 `status = "human_reviewed"`

---

## 状态机总览

```
QuizAttempt 状态流转:

answering ──提交答案──→ submitted ──AI评判──→ ai_graded ──人工评测──→ human_reviewed
```

每个状态转换都有前置校验：
- `submit`：必须处于 `answering`
- `ai-grade`：必须处于 `submitted`
- `human-review`：无严格前置限制

---

## 辅助 API

| API | 方法 | 说明 |
|-----|------|------|
| `/api/quiz/list` | GET | 获取试卷列表，支持按 category 筛选、分页 |
| `/api/quiz/{quiz_id}` | GET | 获取试卷详情（含题目） |
| `/api/quiz/{quiz_id}` | DELETE | 删除试卷及其所有作答记录（级联删除） |
| `/api/quiz/attempt/{attempt_id}` | GET | 获取作答详情（题目+答案+评判） |
| `/api/quiz/attempts/list` | GET | 获取作答记录列表，支持按 quiz_id/status 筛选 |

---

## 数据依赖关系

```
knowledge_articles 表 ─┐
                       ├──→ services/quiz.py: _load_knowledge_context()
knowledge_chunks 表  ──┘           ↓
                          generate_quiz_questions()
                                   ↓
                          LLM (DeepSeek / OpenAI)
                                   ↓
                            quizzes 表 (试卷)
                                   ↓
                         quiz_attempts 表 (作答)
                                   ↓
                          ai_grade_answers()
                                   ↓
                          LLM (DeepSeek / OpenAI)
                                   ↓
                         quiz_attempts 表 (评判结果)
```

知识库数据质量直接决定出题质量。如果 `knowledge_articles` 和 `knowledge_chunks` 都为空，LLM 将无素材可参考，出题完全依赖模型自身能力。
