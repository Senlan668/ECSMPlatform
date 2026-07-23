# pgvector 入门指南

> 基于本项目（ai-sale-course）实际用法整理，帮你快速了解 pgvector 全貌。

---

## 一、pgvector 是什么

pgvector 是 PostgreSQL 的**向量搜索扩展**，让你直接在 SQL 里存储和检索高维向量，不需要额外部署 Milvus、Pinecone 等独立向量数据库。

**一句话总结：把向量数据库的能力塞进了 PostgreSQL。**

核心价值：
- 关系数据和向量数据**同库同表**，一条 SQL 搞定联合查询
- 运维零成本，不多一个组件
- 支持精确搜索和 ANN（近似最近邻）索引

---

## 二、安装与启用

### 2.1 Docker（本项目用法）

本项目直接使用官方镜像 `pgvector/pgvector:pg17`，自带扩展，开箱即用：

```yaml
# docker-compose.db.yml
services:
  db:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: 123456
      POSTGRES_DB: aiwxchat
    ports:
      - "5432:5432"
```

### 2.2 启用扩展

连上数据库后执行一次即可（本项目放在 `docker/initdb/00-extensions.sql`）：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 三、核心数据类型：vector

pgvector 提供了 `vector` 类型，用于存储固定维度的浮点向量。

### 3.1 建表

```sql
-- 本项目实际表结构（知识分块表）
CREATE TABLE knowledge_chunks (
    id serial PRIMARY KEY,
    topic_summary text,
    content_block text NOT NULL,
    embedding vector(1024),    -- 1024维向量
    session_id varchar(100),
    keywords jsonb,
    created_at timestamp
);

-- 本项目实际表结构（知识条目表）
CREATE TABLE knowledge_articles (
    id serial PRIMARY KEY,
    scene text NOT NULL,
    customer_says text,
    recommended_response text,
    embedding vector(1024),    -- 同样1024维
    confidence float,
    is_verified boolean,
    created_at timestamp
);
```

**维度说明**：`vector(1024)` 表示 1024 维。维度由你的 Embedding 模型决定——本项目用 DashScope `text-embedding-v3`，输出 1024 维。OpenAI `text-embedding-3-small` 是 1536 维，那就写 `vector(1536)`。

### 3.2 插入向量

```sql
-- 直接写字面量
INSERT INTO knowledge_chunks (content_block, embedding)
VALUES ('客户问价格怎么回答', '[0.1, 0.2, ..., 0.05]');

-- 在 Python 里拼字符串也行
vec_str = '[' + ','.join(str(v) for v in embedding_list) + ']'
```

### 3.3 Python/SQLAlchemy 集成

本项目用 `pgvector-python` 包提供 SQLAlchemy 类型映射：

```python
# pip install pgvector
from pgvector.sqlalchemy import Vector

class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    id = Column(Integer, primary_key=True)
    embedding = Column(Vector(1024))  # 直接映射 vector(1024)
```

---

## 四、距离计算（最核心）

pgvector 支持三种距离运算符：

| 运算符 | 含义 | 适用场景 |
|--------|------|---------|
| `<->` | **L2 距离**（欧氏距离） | 通用，值越小越相似 |
| `<=>` | **余弦距离** | 文本语义搜索首选，归一化后等价于 L2 |
| `<#>` | **内积距离**（负内积） | 向量已归一化时可用 |

### 4.1 本项目实际查询

```sql
-- 余弦相似度搜索（本项目 rag.py 中的核心查询）
SELECT id, scene, customer_says, recommended_response,
       1 - (embedding <=> CAST(:vec AS vector)) AS similarity
FROM knowledge_articles
WHERE embedding IS NOT NULL
ORDER BY embedding <=> CAST(:vec AS vector)
LIMIT 15;
```

**关键理解**：
- `<=>` 返回的是**余弦距离**（0~2），不是相似度
- `1 - 余弦距离 = 余弦相似度`（-1~1），所以用 `1 - (embedding <=> vec)` 得到相似度
- `ORDER BY ... <=>` 就是按最相似排序

### 4.2 更多示例

```sql
-- 找最相似的5条（L2距离）
SELECT * FROM knowledge_chunks
ORDER BY embedding <-> '[0.1, 0.2, ...]'
LIMIT 5;

-- 余弦相似度 > 0.8 的记录
SELECT *, 1 - (embedding <=> '[...]') AS sim
FROM knowledge_chunks
WHERE 1 - (embedding <=> '[...]') > 0.8
ORDER BY sim DESC;

-- 联合业务字段过滤 + 向量搜索
SELECT * FROM knowledge_articles
WHERE scene_category = 'objection' AND is_verified = true
ORDER BY embedding <=> '[...]'
LIMIT 10;
```

---

## 五、索引（性能关键）

### 5.1 不建索引时

默认做**精确搜索（全表扫描）**，100% 召回率，数据量小（<10万行）时够用。本项目目前就是这种模式。

### 5.2 HNSW 索引（推荐）

```sql
-- 余弦距离的 HNSW 索引
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
USING hnsw (embedding vector_cosine_ops);

-- 可调参数
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

| 参数 | 含义 | 默认值 | 建议 |
|------|------|--------|------|
| `m` | 每个节点的连接数 | 16 | 越大越精确，建索引越慢 |
| `ef_construction` | 建索引时的搜索宽度 | 64 | 越大越精确，建索引越慢 |

查询时可调搜索精度：

```sql
SET hnsw.ef_search = 100;  -- 默认40，越大越精确但越慢
```

**HNSW 特点**：建索引慢，查询快，内存占用较大，支持增量插入。

### 5.3 IVFFlat 索引

```sql
-- 先有数据，再建索引（需要足够数据来聚类）
CREATE INDEX idx_articles_embedding ON knowledge_articles
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

| 参数 | 含义 | 建议 |
|------|------|------|
| `lists` | 聚类数 | 行数/1000 到 sqrt(行数) 之间 |

查询时：

```sql
SET ivfflat.probes = 10;  -- 默认1，越大越精确
```

**IVFFlat 特点**：建索引快，但新数据需要重建索引才能保证质量。

### 5.4 距离函数与 ops 类对照

| 运算符 | 索引 ops 类 |
|--------|-------------|
| `<->` (L2) | `vector_l2_ops` |
| `<=>` (余弦) | `vector_cosine_ops` |
| `<#>` (内积) | `vector_ip_ops` |

---

## 六、PostgreSQL 17 + pgvector 有什么特别

本项目用的 `pgvector/pgvector:pg17` 就是 PG17 + pgvector 0.8.x：

### 6.1 PG17 带来的增强

| 特性 | 说明 |
|------|------|
| **增量排序优化** | `ORDER BY embedding <=> ...` 在有复合过滤条件时更快 |
| **并行查询增强** | 大表向量扫描可用更多 worker 并行 |
| **内存管理改进** | `maintenance_work_mem` 对大索引构建更友好 |
| **JSON 增强** | `JSON_TABLE()` 函数，配合 pgvector 做元数据提取更方便 |
| **逻辑复制增强** | 向量列支持逻辑复制，方便主从同步 |

### 6.2 pgvector 0.7+ 新能力（PG17 镜像自带）

| 特性 | 说明 |
|------|------|
| **HNSW 并行构建** | 建索引速度提升数倍 |
| **halfvec 类型** | 半精度向量，内存减半（`halfvec(1024)` = 2KB vs `vector(1024)` = 4KB） |
| **sparsevec 类型** | 稀疏向量，适合 BM25/TF-IDF 等场景 |
| **bit 向量** | 二值向量，用于极快的粗筛 |
| **量化索引** | 自动标量/二值量化，进一步压缩索引体积 |

### 6.3 实际影响

对本项目而言，PG17 最大的好处是**稳定性和性能的全面提升**。在数据量增长到万级以上时，建议：

```sql
-- 为知识条目表创建 HNSW 索引
CREATE INDEX idx_ka_embedding_hnsw ON knowledge_articles
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 100);

-- 为知识分块表创建 HNSW 索引
CREATE INDEX idx_kc_embedding_hnsw ON knowledge_chunks
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 100);
```

---

## 七、本项目的 pgvector 使用全景

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ DashScope   │     │   Python 后端     │     │  PostgreSQL 17      │
│ Embedding   │────▶│   embedding.py   │────▶│  + pgvector         │
│ API         │     │                  │     │                     │
│ (1024维)    │     │   knowledge.py   │     │  knowledge_chunks   │
└─────────────┘     │   rag.py         │     │    embedding vector(1024)
                    └──────────────────┘     │  knowledge_articles │
                           │                 │    embedding vector(1024)
                           │  SQL:           └─────────────────────┘
                           │  ORDER BY embedding <=> :vec
                           │  LIMIT N
                           ▼
                    ┌──────────────────┐
                    │  RAG 回答生成     │
                    │  articles 优先    │
                    │  chunks 补充      │
                    └──────────────────┘
```

**数据流**：
1. `embedding.py`：调用 DashScope API 把文本变成 1024 维向量
2. `knowledge.py`：切片对话，生成 embedding，写入 `knowledge_chunks` 表
3. `rag.py`：用户提问 → 生成 query embedding → `<=>` 余弦距离排序 → 取 top-K → 送 LLM 生成回答

---

## 八、常用运维命令

```sql
-- 查看扩展版本
SELECT extversion FROM pg_extension WHERE extname = 'vector';

-- 查看向量列维度
SELECT column_name, udt_name 
FROM information_schema.columns 
WHERE table_name = 'knowledge_chunks' AND udt_name = 'vector';

-- 统计有向量的行数
SELECT count(*) FROM knowledge_chunks WHERE embedding IS NOT NULL;

-- 查看索引
SELECT indexname, indexdef FROM pg_indexes 
WHERE tablename = 'knowledge_chunks';

-- 查看向量占用空间
SELECT pg_size_pretty(pg_total_relation_size('knowledge_chunks'));
```

---

## 九、速查表

```
┌─────────────────────────────────────────────────────────────┐
│                    pgvector 速查                             │
├──────────────┬──────────────────────────────────────────────┤
│ 启用扩展      │ CREATE EXTENSION vector;                     │
│ 向量列        │ embedding vector(1024)                       │
│ L2 距离       │ embedding <-> '[...]'                        │
│ 余弦距离      │ embedding <=> '[...]'                        │
│ 内积距离      │ embedding <#> '[...]'                        │
│ 余弦相似度    │ 1 - (embedding <=> '[...]')                  │
│ HNSW 索引     │ USING hnsw (col vector_cosine_ops)           │
│ IVFFlat 索引  │ USING ivfflat (col vector_cosine_ops)        │
│ Python 包     │ pip install pgvector                         │
│ Docker 镜像   │ pgvector/pgvector:pg17                       │
└──────────────┴──────────────────────────────────────────────┘
```
