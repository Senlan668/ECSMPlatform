# RAG 出题方案 — 10 万条数据场景

## 一、如何拆分 Chunk

### 数据源

数据来自 `knowledge_articles` 表（结构化知识条目），单条记录示例：

```
场景: 客户犹豫价格太贵
客户说: 你们这个太贵了吧
推荐回复: 我理解您的顾虑，其实从性价比来看...
要点: ["先认同", "再比较价值"]
分类: sales
置信度: 0.92
```

### Chunk 策略

**结论：不需要传统"拆分"，数据天然已经是结构化的独立条目。**

| 策略 | 做法 | 适用场景 |
|------|------|----------|
| **一条一 chunk**（推荐） | 每条 `knowledge_article` = 一个向量 | 数据本身是独立场景条目，平均 100-200 字 |
| **合并同场景** | 同 `scene_category` + 相似 `scene` 合并 | 大量重复/相似场景时减少冗余 |
| **拆分长回复** | `recommended_response` 超 500 字时按策略点拆 | 话术回复特别长的情况 |

### 向量化文本拼接方式

```python
embed_text = f"场景:{article.scene}\n客户说:{article.customer_says}\n回复:{article.recommended_response}"
```

为什么这么拼：
- `scene` → 提供语境分类信息
- `customer_says` → 检索时最高频匹配的锚点（用户说"价格异议"，能匹配到"你们太贵了"）
- `recommended_response` → 提供答案上下文，增强语义丰富度

### Chunk 元数据

```python
metadata = {
    "article_id": article.id,
    "scene_category": article.scene_category,   # 用于过滤
    "confidence": article.confidence,            # 用于排序
    "scene": article.scene,                      # 用于去重
}
```

---

## 二、如何存数据

### 存储架构

项目已有 PostgreSQL + pgvector，`knowledge_articles` 表已有 `embedding` 字段（`Vector(1024)`）。

```
┌────────────────────────────────────────────┐
│         PostgreSQL + pgvector              │
├────────────────────────────────────────────┤
│ knowledge_articles 表                      │
│   ├── 结构化字段 (scene, customer_says...) │
│   ├── embedding (Vector(1024))  ← 向量    │
│   ├── scene_category (索引)    ← 过滤条件  │
│   └── confidence (索引)        ← 质量排序  │
├────────────────────────────────────────────┤
│ 索引:                                      │
│   ├── IVFFlat (10万条推荐)                 │
│   └── 或 HNSW (百万级再考虑)              │
└────────────────────────────────────────────┘
```

### 向量索引选择

| 对比 | IVFFlat | HNSW |
|------|---------|------|
| 10 万条检索速度 | ~50ms | ~10ms |
| 内存占用 | 较小 | 较大（约 2-3x） |
| 构建速度 | 快（需先插入数据再建索引） | 慢，但支持增量插入 |
| 精度 | 需要调 `probes` 参数 | 开箱即用精度高 |
| **推荐** | **10 万条用这个** | 百万级以上再考虑 |

### 建索引 SQL

```sql
-- IVFFlat 索引（推荐，10万条时 lists=300 合适）
CREATE INDEX idx_articles_embedding ON knowledge_articles
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 300);

-- 查询时设置 probes（越大精度越高，速度越慢）
SET ivfflat.probes = 20;

-- 辅助索引（加速过滤）
CREATE INDEX idx_articles_category ON knowledge_articles(scene_category);
CREATE INDEX idx_articles_confidence ON knowledge_articles(confidence);
```

### 向量化批处理流程（离线跑一次）

```python
from app.services.embedding import get_embeddings
from app.models.chat import KnowledgeArticle

BATCH_SIZE = 64

def batch_embed_articles(db):
    """批量生成 embedding，支持断点续传"""
    articles = db.query(KnowledgeArticle).filter(
        KnowledgeArticle.embedding == None
    ).all()
    
    total = len(articles)
    print(f"待处理: {total} 条")
    
    for i in range(0, total, BATCH_SIZE):
        batch = articles[i:i+BATCH_SIZE]
        texts = [
            f"场景:{a.scene}\n客户说:{a.customer_says}\n回复:{a.recommended_response}"
            for a in batch
        ]
        
        embeddings = get_embeddings(texts)  # 调用阿里 text-embedding-v3
        
        for article, emb in zip(batch, embeddings):
            article.embedding = emb
        
        db.commit()
        print(f"进度: {min(i+BATCH_SIZE, total)}/{total}")
```

**10 万条处理耗时预估：**
- 阿里 text-embedding-v3：约 500 条/分钟
- 10 万条 ≈ 200 分钟（3.3 小时）
- 建议分批跑 + 断点续传（filter `embedding == None`）

---

## 三、如何语义检索数据

### 场景 A：用户指定主题（"出 10 道价格异议题"）

```python
async def search_materials(query: str, category: str = None, top_k: int = 30):
    """直接语义检索"""
    # 1. 查询向量化
    query_embedding = get_embeddings([query])[0]
    
    # 2. pgvector 相似度检索 + 分类过滤
    sql = """
        SELECT id, scene, customer_says, recommended_response, confidence,
               1 - (embedding <=> :query_vec) AS similarity
        FROM knowledge_articles
        WHERE (:category IS NULL OR scene_category = :category)
        ORDER BY embedding <=> :query_vec
        LIMIT :top_k
    """
    results = db.execute(sql, {
        "query_vec": str(query_embedding),
        "category": category,
        "top_k": top_k,
    })
    return results.fetchall()
```

### 场景 B：用户模糊请求（"帮我出套题"）

```python
async def search_materials_diverse(category: str, count: int = 10):
    """多主题分散检索，保证覆盖面"""
    
    # Phase 1: LLM 规划出题方向
    topics = await llm_plan_topics(category, count)
    # → ["价格异议", "学历门槛", "竞品对比", "犹豫拖延", "首次破冰"]
    
    # Phase 2: 每个方向检索 top-6
    all_results = []
    for topic in topics:
        query_emb = get_embeddings([topic])[0]
        results = pgvector_search(
            embedding=query_emb,
            category=category,
            top_k=6,
        )
        all_results.extend(results)
    
    # Phase 3: MMR 去重 + 多样性选择
    final = mmr_select(all_results, limit=30, diversity=0.7)
    return final
```

### 场景 C：LLM 意图识别 + 跨分类检索

用户说："帮我检索价格引导、大专可以学吗、java可以学吗这几类题"

```python
async def search_by_intent(user_request: str, count: int = 30):
    """LLM 意图识别 → 多意图并行检索"""
    
    # Phase 1: LLM 识别意图，拆解为多个检索 query
    intent_prompt = f"""用户请求: "{user_request}"
    请将用户需求拆解为具体的检索关键词列表。
    输出 JSON: [{{"query": "检索词", "category": "分类或null", "count": 数量}}]"""
    
    intents = await call_llm(intent_prompt)
    # → [
    #     {"query": "价格引导 太贵 优惠", "category": "sales", "count": 10},
    #     {"query": "大专学历 能学吗 学历要求", "category": "course", "count": 10},
    #     {"query": "java 编程 技术方向", "category": "course", "count": 10},
    # ]
    
    # Phase 2: 每个意图独立检索
    all_results = []
    for intent in intents:
        query_emb = get_embeddings([intent["query"]])[0]
        results = pgvector_search(
            embedding=query_emb,
            category=intent.get("category"),
            top_k=intent["count"],
        )
        all_results.extend(results)
    
    # Phase 3: 去重
    seen_ids = set()
    unique_results = []
    for r in all_results:
        if r.id not in seen_ids:
            seen_ids.add(r.id)
            unique_results.append(r)
    
    return unique_results[:count]
```

### MMR 去重算法

```python
import numpy as np

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

def mmr_select(candidates, limit=30, diversity=0.7):
    """最大边际相关性：在相关性和多样性之间取平衡"""
    if len(candidates) <= limit:
        return candidates
    
    selected = [candidates[0]]  # 先选最相关的
    remaining = candidates[1:]
    
    while len(selected) < limit and remaining:
        best_score = -float('inf')
        best_idx = 0
        
        for i, doc in enumerate(remaining):
            relevance = doc.similarity
            
            # 和已选中的文档计算最大相似度（越相似 = 越冗余）
            max_sim = max(
                cosine_similarity(doc.embedding, s.embedding)
                for s in selected
            )
            
            # MMR = λ × 相关性 - (1-λ) × 冗余度
            mmr = diversity * relevance - (1 - diversity) * max_sim
            
            if mmr > best_score:
                best_score = mmr
                best_idx = i
        
        selected.append(remaining.pop(best_idx))
    
    return selected
```

---

## 四、完整调用链路

```
用户点击"出题" (category=sales, count=10)
    │
    ├─ 数据量 < 50 条？ → 全量灌入 Prompt（现有方案不变）
    │
    └─ 数据量 > 50 条？ → RAG 路径：
        │
        ├─ Step 1: LLM 规划 5 个出题子方向
        │     → ["价格异议", "学历顾虑", "竞品对比", "犹豫跟进", "首次破冰"]
        │
        ├─ Step 2: 每个方向 pgvector 检索 top-6（共 30 条）
        │     → SELECT ... ORDER BY embedding <=> query_vec LIMIT 6
        │
        ├─ Step 3: MMR 去重，确保 30 条素材互不重复
        │
        ├─ Step 4: 拼接素材 + 出题 Prompt 给 LLM（和现有逻辑一样）
        │
        └─ Step 5: 返回 10 道题
```

---

## 五、方案一 vs 方案二对比

| 维度 | 方案一：按分类随机抽取 | 方案二：LLM意图识别 + RAG |
|------|----------------------|--------------------------|
| 检索逻辑 | `WHERE category='sales' ORDER BY RANDOM() LIMIT 30` | 先理解意图，再语义向量匹配 |
| 适用场景 | "帮我出套 sales 的题"（单分类、模糊） | "出价格引导、大专能学吗、java方向混合题"（跨分类、精准） |
| 核心差异 | 靠**预设分类标签**机械抽取 | 靠**语义理解**智能检索 |
| 数据量 | 每分类几十到几百条 | 5000+ 条时优势明显 |
| 题目重复率 | 随机，可能重复 | 低，MMR 保证多样性 |
| 跨分类能力 | ❌ 只能单分类 | ✅ 一条指令检索多个方向 |
| 实现复杂度 | 极简，改一行 SQL | 需要 embedding + pgvector + MMR |

**一句话总结：方案一靠"分类标签"，方案二靠"语义理解"。数据少用方案一，数据多/需求复杂用方案二。**

---

## 六、成本和性能预估

| 环节 | 耗时 | 费用 |
|------|------|------|
| 离线向量化（一次性） | ~3 小时 | ~¥15（阿里 embedding API） |
| 建 IVFFlat 索引（一次性） | ~30 秒 | 无 |
| 单次出题-向量检索（5 轮 × top-6） | ~300ms | ~¥0.01 |
| 单次出题-LLM 规划主题 | ~2s | ~¥0.01 |
| 单次出题-LLM 出题 | ~15s | ~¥0.05 |
| **总计单次出题** | **~18s** | **~¥0.07** |

---

## 七、实施步骤

1. **离线向量化**：写一个 `scripts/batch_embed.py`，跑一次把 10 万条全部向量化
2. **建 pgvector 索引**：跑一条 SQL 建 IVFFlat 索引
3. **新增检索服务**：`services/rag_search.py`，实现 `search_materials()` + `mmr_select()`
4. **改造出题服务**：`services/quiz.py` 的 `_load_knowledge_context()` 加一个分支，数据量 > 50 时走 RAG
5. **前端无需改动**：检索逻辑对前端透明，出入参不变
