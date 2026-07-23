# AI 考核 — 出题与评分机制详解

## 一、题目是怎么创建的？

### 整体流程

```
前端请求 POST /api/quiz/generate
    ↓
服务层: generate_quiz_questions(db, category, count)
    ├── 1. _load_knowledge_context() — 从 DB 按分类拉取知识素材
    ├── 2. 构造 system_prompt + user_prompt
    ├── 3. 调用 LLM (DeepSeek/OpenAI)
    └── 4. 正则提取 JSON、规范化字段
    ↓
路由层: 创建 Quiz 记录写入数据库
    ↓
返回试卷 JSON 给前端
```

### 数据库原始数据（输入）

出题依赖的原始数据来自两张表，**按优先级取用**：

#### 优先级 1：`knowledge_articles` 表（结构化知识条目）

| 字段 | 说明 | 示例 |
|------|------|------|
| scene_category | 场景分类 | `sales` |
| scene | 场景描述 | 客户犹豫价格太贵 |
| customer_says | 客户原话 | "你们这个太贵了吧" |
| recommended_response | 推荐话术 | "我理解您的顾虑，其实从性价比来看..." |
| confidence | 置信度 | 0.92 |

查询逻辑：按 `scene_category` 筛选 → 按 `confidence` 降序 → 取前 30 条

#### 优先级 2：`knowledge_chunks` 表（通用知识分块，降级方案）

| 字段 | 说明 |
|------|------|
| content_block | 文本分块内容 |

当 `knowledge_articles` 无数据时才使用，直接取前 30 条拼接。

#### 拼接后的素材文本示例

```
场景: 客户犹豫价格太贵
客户说: 你们这个太贵了吧
推荐回复: 我理解您的顾虑，其实从性价比来看...
---
场景: 客户想再考虑考虑
客户说: 我再想想吧
推荐回复: 没问题，您主要是在考虑哪方面呢？是课程内容还是时间安排？
---
```

### 是否用到了 RAG 知识库？

**没有使用 RAG（检索增强生成）。**

- ❌ 没有 embedding 向量化
- ❌ 没有语义相似度匹配
- ❌ 没有向量数据库检索

实际做法是：**简单 SQL 查询 + 文本拼接塞入 Prompt**，本质是「全量知识灌入」模式，而非 RAG 的「按需检索」模式。

### 出题提示词（完整源码）

#### System Prompt（动态生成，以 category=sales, count=10 为例）

```
你是一位资深销售培训考官 负责出题考核销售人员的销售话术能力

请基于以下知识库素材 出10道开放式销售场景题 考察销售人员的实战应对能力

【出题要求】
1. 每道题模拟一个真实客户场景 给出客户的具体说法
2. 题目应覆盖不同难度: 简单(3题) 中等(4题) 困难(3题)
3. 每道题提供参考答案(基于知识库中的推荐话术)
4. 题目要贴近实战 不要太学术化

【输出格式】
严格输出 JSON 数组 不要输出其他内容:
[
  {
    "id": 1,
    "question": "客户说: xxx 你应该如何回复",
    "reference_answer": "推荐的回复话术",
    "difficulty": "easy/medium/hard"
  }
]
```

#### User Prompt

```
以下是知识库中的销售素材:

场景: 客户犹豫价格太贵
客户说: 你们这个太贵了吧
推荐回复: 我理解您的顾虑，其实从性价比来看...
---
场景: 客户想再考虑考虑
客户说: 我再想想吧
推荐回复: 没问题，您主要是在考虑哪方面呢？
---
（...共30条素材...）

请基于以上素材出10道销售话术考核题
```

#### LLM 调用参数

| 参数 | 值 | 说明 |
|------|-----|------|
| model | deepseek-chat / gpt-4o-mini | DeepSeek 优先，OpenAI 降级 |
| temperature | 0.7 | 较高，鼓励出题多样性 |
| max_tokens | 4000 | — |

### 是否使用了结构化输出（Structured Output）？

**没有使用 OpenAI 的 Structured Output / Function Calling / JSON Mode。**

当前做法是"提示词约束 + 正则兜底"：

| 对比维度 | 当前实现 | 真正的结构化输出 |
|----------|----------|------------------|
| 约束方式 | 在 Prompt 里写"严格输出 JSON 数组" | 使用 `response_format={"type": "json_object"}` 或 `tools` 参数 |
| 解析方式 | 正则 `re.search(r'\[.*\]', content)` 提取 JSON | SDK 直接返回解析好的对象 |
| 可靠性 | LLM 可能输出多余文字、格式错误 | 100% 保证符合 schema |
| 容错处理 | 有正则兜底，但 `json.loads` 仍可能失败 | 不需要容错 |

**当前源码的解析逻辑：**

```python
content = response.choices[0].message.content.strip()
# 用正则从返回文本中"挖出" JSON 数组部分
json_match = re.search(r'\[.*\]', content, re.DOTALL)
if json_match:
    content = json_match.group()
questions = json.loads(content)
```

**风险：** 如果 LLM 返回的内容不包含合法 JSON（如格式错乱、多了注释等），`json.loads` 会直接抛异常，接口返回 500 错误。

**改进建议：** 可以使用 OpenAI/DeepSeek 的 JSON Mode 来保证输出格式：

```python
response = client.chat.completions.create(
    model=model,
    messages=[...],
    temperature=0.7,
    max_tokens=4000,
    response_format={"type": "json_object"},  # 强制 JSON 输出
)
```

### 生成的输出数据

LLM 返回的 JSON 经过解析后，最终写入 `quizzes` 表的 `questions_json` 字段：

```json
[
  {
    "id": 1,
    "question": "客户说：你们这个课程太贵了，别家便宜多了。你应该如何回复？",
    "reference_answer": "我理解您关注价格，不过咱们先看看课程能给您带来什么价值...",
    "difficulty": "easy",
    "category": "sales"
  },
  {
    "id": 2,
    "question": "客户说：我再考虑考虑吧。你应该如何应对？",
    "reference_answer": "没问题，您主要是在考虑哪方面呢？我帮您梳理一下...",
    "difficulty": "medium",
    "category": "sales"
  }
]
```

---

## 二、LLM 评分机制

### 评分提示词（完整）

#### System Prompt

```
你是一位资深销售培训评审专家 负责评判销售人员的考核答案

【评判标准】
1. 回复是否贴近实战(不要太书面化)
2. 是否抓住了客户的核心需求/顾虑
3. 是否有正确的销售策略(如: 先了解背景再推方案)
4. 话术是否自然 不像机器人
5. 是否触犯红线(如: 直接报价格 用"亲"等客服用语)

【评分规则】
- 每题 0-10 分
- 8-10: 优秀 可直接使用
- 5-7: 合格 有改进空间
- 0-4: 不合格 需要重新学习

【输出格式】
严格输出 JSON 数组:
[
  {
    "question_id": 1,
    "score": 8,
    "feedback": "具体点评 指出优点和不足",
    "is_reasonable": true
  }
]
```

#### LLM 调用参数

| 参数 | 值 | 说明 |
|------|-----|------|
| model | deepseek-chat / gpt-4o-mini | DeepSeek 优先 |
| temperature | 0.3 | 较低，保证评判稳定性 |
| max_tokens | 4000 | — |

### 输入示意

User Prompt 是将每道题的「题目 + 参考答案 + 学员回答」拼接成文本：

```
题目1: 客户说：你们这个课程太贵了，别家便宜多了。你应该如何回复？
参考答案: 我理解您关注价格，不过咱们先看看课程能给您带来什么价值...
学员回答: 我们的课程性价比很高，别家虽然便宜但质量没保证

题目2: 客户说：我再考虑考虑吧。你应该如何应对？
参考答案: 没问题，您主要是在考虑哪方面呢？我帮您梳理一下...
学员回答: 好的，那您考虑好了联系我

题目3: 客户说：我朋友报了另一家，效果也不错啊。你应该如何回应？
参考答案: 是的，市面上确实有不少选择，您朋友学的是哪方面的课程呢？我帮您对比一下...
学员回答: (未作答)
```

### 输出示意

LLM 返回的评判结果 JSON：

```json
[
  {
    "question_id": 1,
    "score": 6,
    "feedback": "方向正确，提到了性价比，但过于笼统。建议先认同客户感受，再用具体案例说明价值差异，而不是直接否定竞品。",
    "is_reasonable": true
  },
  {
    "question_id": 2,
    "score": 3,
    "feedback": "回复太被动，直接放客户走了。应该用提问挖掘客户犹豫的真实原因，创造进一步沟通的机会。",
    "is_reasonable": false
  },
  {
    "question_id": 3,
    "score": 0,
    "feedback": "未作答，无法评判。",
    "is_reasonable": false
  }
]
```

### 总分计算

```python
scores = [6, 3, 0]
total = round(sum(scores) / len(scores) * 10, 1)
# = round(9 / 3 * 10, 1)
# = round(30.0, 1)
# = 30.0 分（满分100）
```

公式：**平均分 × 10 = 百分制总分**

---

## 三、30 条数据覆盖不全的问题

### 问题分析

**当前策略的缺陷：**

- 按 `confidence` 降序取 top 30 → **永远是同一批高置信度数据被选中**
- 如果某个分类有 200 条知识，170 条永远不会参与出题
- 反复生成试卷 → 题目高度重复，考核效果递减

**为什么限制 30 条？** 因为 LLM 有上下文窗口限制（token 数），塞太多素材会：
- 超出 max context（尤其是较小的模型）
- 素材太多时 LLM "注意力"分散，出题质量反而下降

### 可能的改进方向

| 方案 | 思路 | 优缺点 |
|------|------|------|
| **随机采样** | 每次从知识库随机抽 30 条，而非固定 top-30 | 简单有效，但可能抽到低质量数据 |
| **分层采样** | 按难度/子分类分层，每层随机抽几条 | 保证覆盖面，实现稍复杂 |
| **RAG 检索** | 先生成"本次考核方向"，再用向量检索匹配相关素材 | 最智能，但需要引入 embedding + 向量库 |
| **轮换机制** | 记录已用过的素材 ID，优先选未使用过的 | 避免重复，保证长期覆盖 |
| **增大窗口** | 换用长上下文模型（128K），一次塞更多 | 最省事，但成本高、不一定提升质量 |

### 最务实的改法

如果想快速改善，**随机采样 + 分层**是性价比最高的方案，大概改法：

```python
# 当前：永远取 top-30
articles = articles.order_by(KnowledgeArticle.confidence.desc()).limit(30)

# 改进：按置信度分层随机采样
from sqlalchemy import func

high = articles.filter(KnowledgeArticle.confidence >= 0.8).order_by(func.random()).limit(15)
mid = articles.filter(KnowledgeArticle.confidence.between(0.5, 0.8)).order_by(func.random()).limit(10)
low = articles.filter(KnowledgeArticle.confidence < 0.5).order_by(func.random()).limit(5)
```

这样每次出题素材都不同，同时保证高质量数据占大头。

---

## 四、10 万条数据场景下何时该用 RAG？

### 当前方案为什么不行？

假设知识库膨胀到 10 万条：

| 问题 | 说明 |
|------|------|
| 只能用 30 条 | LLM 上下文窗口撑死塞 30-50 条，10 万条里 99.97% 数据被浪费 |
| 随机采样不靠谱 | 从 10 万条随机抽 30 条，大概率抽不到跟考核主题相关的素材 |
| 全量灌入不可能 | 10 万条 × 平均 100 字 = 1000 万字 ≈ 500 万 token，远超任何模型上下文 |

**结论：数据量大到无法全量塞入 Prompt 时，就是 RAG 的用武之地。**

### RAG 在出题场景中的工作方式

```
用户请求: "出10道关于客户价格异议的考核题"
    ↓
Step 1: 生成检索查询
    LLM 根据出题需求生成检索关键词/向量
    如: "价格贵 优惠 折扣 性价比 预算"
    ↓
Step 2: 向量检索 (RAG 核心)
    用 embedding 模型将查询向量化
    在 pgvector/Milvus 中做相似度检索
    从 10 万条中精准召回 top-30 最相关的素材
    ↓
Step 3: 重排序 (可选)
    用 reranker 模型对召回结果精排
    确保最终 30 条既相关又多样
    ↓
Step 4: 塞入 Prompt 出题
    和现在一样，把筛选后的 30 条素材 + 出题指令给 LLM
    ↓
输出: 10 道高质量、紧扣主题的考核题
```

### 对比：什么时候用什么方案

| 数据规模 | 推荐方案 | 原因 |
|----------|----------|------|
| < 50 条 | 全量灌入 | 数据少，全塞进去效果最好 |
| 50 ~ 500 条 | 分层随机采样 | 数据适中，随机抽样 + 分类保证覆盖 |
| 500 ~ 5000 条 | SQL 筛选 + 关键词匹配 | 用传统数据库的 LIKE/全文检索缩小范围 |
| > 5000 条 | **RAG（向量检索）** | 数据量大，语义检索才能精准定位相关素材 |
| > 10 万条 | **RAG + 重排序 + 去重** | 必须 RAG，且需要多轮检索保证题目多样性 |

### 10 万条数据的 RAG 出题实现思路

```python
async def generate_quiz_with_rag(category: str, count: int = 10):
    # 1. 先让 LLM 规划出题方向（保证覆盖面）
    topics = await plan_quiz_topics(category, count)
    # 例如返回: ["价格异议", "竞品对比", "犹豫拖延", "售后顾虑", ...]

    all_materials = []
    for topic in topics:
        # 2. 每个方向独立做向量检索，各召回 5-8 条
        chunks = await vector_search(
            query=topic,
            collection="knowledge_articles",
            top_k=8,
            filter={"category": category}
        )
        all_materials.extend(chunks)

    # 3. 去重 + 重排序，选出最终 30 条
    final_materials = rerank_and_dedupe(all_materials, limit=30)

    # 4. 和现在一样构造 Prompt 出题
    questions = await call_llm_generate(final_materials, count)
    return questions
```

**关键区别：**
- 现在：`SELECT * FROM knowledge_articles ORDER BY confidence LIMIT 30`（固定 top-30）
- RAG：`embedding_search(query="价格异议", top_k=30)`（语义相关 top-30）

### 引入 RAG 的额外成本

| 项目 | 说明 |
|------|------|
| Embedding 模型 | 需要对 10 万条数据做一次向量化（离线批处理） |
| 向量数据库 | 需要 pgvector / Milvus / Pinecone 存储向量 |
| 检索延迟 | 每次出题多一步向量检索（约 100-500ms） |
| 维护成本 | 新增知识需要同步更新向量索引 |

**总结：当前项目知识库数据量小（百级别），SQL 查询足够用。当数据增长到千级别以上、且需要按主题精准出题时，才有必要引入 RAG。**

### 用户说"帮我出套题"（通用/模糊请求）时，RAG 怎么查？

这是 RAG 最棘手的场景：**用户没给明确主题，你拿什么去向量检索？**

#### 问题本质

| 场景 | 用户输入 | RAG 检索 query | 难度 |
|------|----------|----------------|------|
| 精确 | "出 5 道价格异议处理题" | "价格异议 太贵 优惠" | 简单，直接检索 |
| 模糊 | "帮我出套题" | ？？？ | 没有检索方向 |

向量检索需要一个 query 去匹配，但"帮我出套题"本身不含任何语义方向，和 10 万条数据中的每条都不相关。

#### 解决策略：分阶段检索

```
用户: "帮我出套题"
    ↓
┌─────────────────────────────────────────────────┐
│ Phase 1: 确定出题范围（不需要 RAG）              │
│                                                   │
│ 方案 A: 让 LLM 规划主题                          │
│   → LLM 自行生成 5-8 个子主题作为检索 query       │
│   → "价格异议" "竞品对比" "拖延决策" "售后疑虑"... │
│                                                   │
│ 方案 B: 按知识库分类随机抽样                      │
│   → 从已有分类中随机选 5 个方向                    │
│   → sales×2, objection×3, closing×2, ...         │
│                                                   │
│ 方案 C: 按用户历史薄弱项出题                      │
│   → 查用户历史低分题的 category/topic             │
│   → 针对薄弱环节检索素材                          │
└─────────────────────────────────────────────────┘
    ↓ 得到多个检索 query
┌─────────────────────────────────────────────────┐
│ Phase 2: 多轮向量检索（RAG 核心）                │
│                                                   │
│ for topic in ["价格异议", "竞品对比", ...]:       │
│     results += vector_search(topic, top_k=5)     │
│                                                   │
│ 最终得到 30-40 条覆盖多个方向的素材               │
└─────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────┐
│ Phase 3: 去重 + 多样性保证                       │
│                                                   │
│ - 按 MMR(最大边际相关) 去掉过于相似的素材         │
│ - 确保每个方向至少保留 3 条                       │
│ - 最终选出 30 条喂给 LLM                         │
└─────────────────────────────────────────────────┘
    ↓
Phase 4: 正常出题（和现在一样）
```

#### 具体代码示意

```python
async def generate_quiz_rag(user_request: str, count: int = 10):
    """支持模糊请求的 RAG 出题"""

    # Phase 1: LLM 规划出题方向
    planning_prompt = f"""用户请求: "{user_request}"
    请规划 {count} 道销售考核题应覆盖的主题方向。
    输出 JSON: ["主题1", "主题2", ...]"""

    topics = await call_llm(planning_prompt)
    # 例: ["价格异议处理", "竞品对比应对", "客户犹豫跟进",
    #       "首次破冰话术", "售后投诉安抚"]

    # Phase 2: 每个主题独立检索
    all_chunks = []
    for topic in topics:
        chunks = await vector_db.similarity_search(
            query=topic,
            k=6,
            filter={"category": "sales"}
        )
        all_chunks.extend(chunks)

    # Phase 3: MMR 去重，保证多样性
    final_chunks = mmr_rerank(all_chunks, diversity=0.7, limit=30)

    # Phase 4: 拼接素材，正常出题
    context = format_chunks(final_chunks)
    questions = await call_llm_generate(context, count)
    return questions
```

#### 核心思路总结

| 用户请求类型 | RAG 检索策略 |
|-------------|-------------|
| 精确主题："出价格异议题" | 直接用主题作为 query 检索 |
| 模糊请求："帮我出套题" | **先让 LLM 规划主题 → 再多轮检索** |
| 个性化："针对我的弱项出题" | 查历史记录找薄弱项 → 用薄弱项作为 query 检索 |

**本质：当用户请求模糊时，RAG 不是第一步，而是第二步。第一步永远是"把模糊变具体"——要么让 LLM 规划，要么用业务规则（分类/历史）来决定检索什么。**

---

## 五、总结对比

| 维度 | 出题 | 评分 |
|------|------|------|
| 触发 API | `POST /api/quiz/generate` | `POST /api/quiz/attempt/{id}/ai-grade` |
| 输入来源 | knowledge_articles / knowledge_chunks 表 | questions_json + user_answers_json |
| 是否用 RAG | ❌ 否，简单 SQL 查询拼接 | ❌ 否 |
| LLM 角色 | 资深销售培训考官 | 资深销售培训评审专家 |
| temperature | 0.7（高创造性） | 0.3（低，保稳定） |
| 输出格式 | JSON 题目数组 | JSON 评判数组 |
| 写入位置 | `quizzes.questions_json` | `quiz_attempts.ai_evaluation_json` + `ai_total_score` |
