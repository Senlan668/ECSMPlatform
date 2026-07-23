# 面试技术方案 - LLM 性能优化系统性方案

> 本文档针对当前直播切片项目，给出一套**可面试讲述**的 LLM 性能优化系统性方案。
> 项目现状：FastAPI + DeepSeek（`deepseek-chat`）+ 三个 LLM 服务：
> - `analyzer.py` —— **核心**，对 transcript 分批分析出 clip plans
> - `editing_guide_generator.py` —— 为每个 clip 生成剪辑指导
> - `viral_title_generator.py` —— 为每个 clip 生成爆款标题
>
> 重点结论：**最大瓶颈是 `analyzer.py` 第 223 行的串行 for 循环**。优化这一点能带来 60-80% 的延迟下降。

---

## 0. 先说"性能优化"是什么？（讲方法论）

谈 LLM 性能，**别上来就说"加缓存"**。面试时先讲方法论：

### 性能的 4 个维度

| 维度 | 含义 | 用户视角 |
|---|---|---|
| **延迟 (Latency)** | 单次请求多久返回 | 进度条转多久 |
| **吞吐 (Throughput)** | 单位时间能处理多少任务 | 同时几百人来用卡不卡 |
| **成本 (Cost)** | 每个任务花多少钱 | API 月账单 |
| **质量 (Quality)** | 准确率、JSON 解析成功率 | 失败了要重试，间接拖慢 |

> 这 4 个维度**互相耦合**：质量差 → 重试 → 延迟变高 + 成本变高。优化要看整体。

### 标准的"性能优化 4 步法"

```
① 定基线（measure）         先量出 p50/p95/p99 延迟、token 消耗、成功率
       ↓
② 找瓶颈（profile）         哪一步最慢？哪一步最贵？画火焰图
       ↓
③ 改改改（optimize）        按瓶颈贡献度排序，挨个攻
       ↓
④ 验收（verify）            上线前 A/B 对比，看核心指标确实降了
```

面试时按这个套路讲，逻辑就稳了。

---

## 1. 当前项目的 LLM 瓶颈诊断

打开 `backend/app/services/analyzer.py`，逐条挑问题：

### 问题 1：分批后**串行**调用 LLM（最大瓶颈）

```python
# analyzer.py:223
for i, batch in enumerate(batches):
    batch_clips = await self._analyze_batch_with_retry(i, len(batches), batch)
```

- 2H 视频 → transcript 大约 5-8 个 batch（`MAX_TOKENS_PER_BATCH = 6000`）。
- 每个 batch 调一次 DeepSeek，平均 8-15 秒。
- **串行跑 = 单批延迟 × 批数**，5 个 batch 就要 60 秒以上。
- **DeepSeek 自己 QPS 限制并不低**（默认 100+），这里完全没并发起来，浪费了。

### 问题 2：每次都把 Prompt 全文重发

```python
# analyzer.py:266
prompt = self.scene.prompt_template.format(transcript=formatted)
```

- 场景 prompt 模板（直播/面试/课程）的开头几百字**每个 batch 都一样**。
- 现在每个 batch 都重新发一遍这几百字。
- DeepSeek 支持 **Context Cache（KV Cache 复用）**，命中后这部分 token **价格只算 1/10**，且推理更快。
- 我们没用上。

### 问题 3：没用 `response_format=json_object`

```python
# analyzer.py:277
response = await self.client.chat.completions.create(
    model=self.model,
    messages=[{"role": "user", "content": prompt}],
    temperature=0.3,
    timeout=120,
)
```

- 没指定输出格式 → LLM 可能输出 ```json ... ``` 包裹、可能加解释 → 要靠 `_parse_response` 用正则手抠。
- 抠失败就重试，**重试就是 100% 的延迟和成本浪费**。

### 问题 4：每个 Clip 串行生成 editing_guide 和 viral_title

虽然不在 analyzer 里，但 `editing_guide_generator.py` 和 `viral_title_generator.py` 是按 clip 一个个调的。10 个 clip = 20 次串行调用 = 又是几十秒。

### 问题 5：没有任何缓存

- 同一个用户重复处理同一个视频 → 完全重跑。
- 转录文本只是稍微不同 → 也完全重跑。
- 完全可以做精确缓存（哈希命中）+ Prompt Cache（DeepSeek 原生）。

### 问题 6：没有可观测性

- 不知道 p95 延迟是多少。
- 不知道哪一次调用最贵。
- 不知道哪个场景准确率最低。
- → 没有数据就没法做 #4 步「验收」。

---

## 2. 五大优化方向（按收益排序）

### 方向一：并发化（最大收益，⭐⭐⭐⭐⭐）

#### 1.1 Batch 级并发 - 改 `analyzer.py`

```python
# 改前（串行）
for i, batch in enumerate(batches):
    batch_clips = await self._analyze_batch_with_retry(i, len(batches), batch)

# 改后（并发 + 信号量限流）
async def analyze(self, transcript):
    batches = self._split_transcript(transcript)

    # 控制并发，避免一次性打满 QPS
    sem = asyncio.Semaphore(settings.llm_max_concurrency)  # 例如 5

    async def run_one(idx, batch):
        async with sem:
            return await self._analyze_batch_with_retry(idx, len(batches), batch)

    results = await asyncio.gather(
        *(run_one(i, b) for i, b in enumerate(batches)),
        return_exceptions=True,
    )
    # 失败和成功的分开处理（参考 transcriber.py 的并发改造方案）
```

**效果**：5 个 batch 串行 60s → 并发 5 个 ≈ 12s。**延迟降 80%**。

#### 1.2 Clip 级并发 - editing_guide & viral_title

```python
# 现状：clip 一个个串行
for clip in clips:
    guide = await generator.generate(clip)
    titles = await title_gen.generate(clip)

# 改进：一次性并发所有 clip × 两个任务
tasks = []
for clip in clips:
    tasks.append(guide_generator.generate(clip))
    tasks.append(title_generator.generate(clip))

results = await asyncio.gather(*tasks)
```

**效果**：10 个 clip × 2 个 LLM 调用 × 5s = 100s → 并发后 ≈ 6-8s。

#### 1.3 并发的"安全网"——信号量 + 限流

并发不是越多越好，要注意：

- **服务端层面**：用 `asyncio.Semaphore(N)` 限制本进程并发，防止打爆 DeepSeek QPS 触发 429。
- **集群层面**：如果上线多机部署，配合第 3 节讲的 **Redis 全局信号量**做集群级并发控制。

```python
# 全集群最多 20 个并发 DeepSeek 调用（多机协作）
async def acquire_llm_quota():
    while True:
        current = await redis.incr("semaphore:deepseek")
        if current <= 20:
            return
        await redis.decr("semaphore:deepseek")
        await asyncio.sleep(0.5)
```

---

### 方向二：Prompt / 上下文优化（⭐⭐⭐⭐）

#### 2.1 利用 DeepSeek Context Cache（白送的优化）

DeepSeek 官方支持 **自动 KV Cache 命中**：**前缀完全相同**的两次请求，前缀部分的 token 价格降到 1/10，推理速度也更快。

**怎么用？** 把固定不变的部分（场景 Prompt 模板的"切片标准 + 切片要求 + 输出格式"）放在 messages 的**最前面**，把变化的 transcript 放在**最后面**：

```python
# 现在的写法（变化的部分塞在中间，cache 命中率低）
prompt = self.scene.prompt_template.format(transcript=formatted)
messages = [{"role": "user", "content": prompt}]

# 优化后（固定的 system 在前，变化的 user 在后 → cache 命中率高）
messages = [
    {"role": "system", "content": FIXED_PROMPT_TEMPLATE},   # ← 这部分被 cache
    {"role": "user", "content": f"## 转录文本\n{formatted}"},  # ← 每次变
]
```

**效果**：
- 前缀 1500 token × 5 个 batch × $0.27/1M = 节省约 90% 前缀成本。
- 单次调用延迟下降 20-30%（cache 命中后跳过前缀的重新计算）。

#### 2.2 转录文本压缩 / 裁剪

转录里有大量低信息密度的内容（"嗯"、"啊"、口水话、重复内容）。在送给 LLM 前预处理：

```python
def compress_transcript(segments):
    # 1. 过滤过短 segment（< 1秒 或 < 5 字）
    segments = [s for s in segments if s["end"] - s["start"] > 1 and len(s["text"]) > 5]

    # 2. 合并相邻同义重复（用 difflib 或 simhash）
    segments = merge_duplicates(segments)

    # 3. 移除口头禅停顿词
    for s in segments:
        s["text"] = re.sub(r"(嗯+|啊+|那个|然后然后)", "", s["text"])

    return segments
```

**效果**：transcript token 数下降 20-40%，单 batch 可以塞更多内容，**batch 数减少 30%**。

#### 2.3 动态 Batch Size

现在 `MAX_TOKENS_PER_BATCH = 6000` 是写死的，应该按模型 + 任务类型动态调：

- **deepseek-chat**：上下文 64K，输入 6000 token 太保守了，可以放到 20K（响应快、效果好）。
- **任务越复杂，batch 越小**（让 LLM 一次只处理一段）。
- **平衡点**：太小 batch 多 → 调用次数多（慢）；太大 batch 大 → 单次延迟高、漏切片可能性大。
- **经验值**：6K-15K token 是 sweet spot。

---

### 方向三：输出优化（⭐⭐⭐⭐）

#### 3.1 强制 JSON 输出（必做）

```python
response = await self.client.chat.completions.create(
    model=self.model,
    messages=[...],
    temperature=0.3,
    timeout=120,
    response_format={"type": "json_object"},  # ← 加这一行
)
```

**效果**：
- LLM 100% 输出合法 JSON，**省掉 `_parse_response` 里的正则修补**。
- 减少 JSON 解析失败的重试（节省一次完整调用）。

#### 3.2 Structured Outputs（更高级）

OpenAI 和部分国产模型支持传入 JSON Schema，**强制输出符合 schema 的结构**：

```python
schema = {
    "type": "array",
    "items": {
        "type": "object",
        "required": ["clip_id", "title", "start_time", "end_time", "virality_score"],
        "properties": {
            "clip_id": {"type": "integer"},
            "title": {"type": "string", "maxLength": 50},
            "start_time": {"type": "number"},
            "end_time": {"type": "number"},
            "virality_score": {"type": "integer", "minimum": 1, "maximum": 10},
        }
    }
}

response = await client.chat.completions.create(
    ...,
    response_format={"type": "json_schema", "json_schema": {"name": "clips", "schema": schema}},
)
```

**效果**：
- 字段类型 100% 正确（不会出现 `virality_score: "8"` 这种字符串）。
- 解析逻辑直接 `json.loads`，不需要校验。
- 减少 LLM "胡说八道"的概率。

> 💡 注：我们这个场景下**不做流式输出**——业务上只关心最终的 clips 列表（一个完整 JSON 数组），前端不需要"逐字打字机"效果。流式只会增加解析复杂度，没有用户价值。

---

### 方向四：缓存层（⭐⭐⭐）

#### 4.1 精确缓存（Exact Match）

```python
async def analyze_with_cache(transcript):
    cache_key = f"clips:{hashlib.sha256(json.dumps(transcript).encode()).hexdigest()}"

    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    clips = await self._analyze_uncached(transcript)
    await redis.setex(cache_key, 86400, json.dumps(clips))  # 缓存 1 天
    return clips
```

**适用场景**：
- 用户对同一个视频"重新分析"（场景模式没变）→ 直接命中。
- 测试环境调试 → 命中率 100%，省钱省时间。

#### 4.2 语义缓存（Semantic Cache）

转录文本通常**95% 重复 + 5% 不同**（比如插了一句广告）。精确缓存命中不了，但语义上几乎一样：

```python
# 1. 把 transcript 文本算 embedding
emb = await embedding_client.embed(transcript_text)

# 2. 在向量库里查最相似的
hits = await vector_db.search(emb, top_k=1, threshold=0.95)
if hits:
    return hits[0].cached_clips
```

**效果**：命中率从 5% 提升到 30%+（重复利用率高）。
**成本**：embedding 调用约 $0.02/M token，比 LLM 便宜 100 倍，值得。

#### 4.3 LLM Prompt Cache（DeepSeek 原生）

见 2.1，**白送的优化**，必须用。

---

### 方向五：模型分级 / 路由（⭐⭐⭐）

不是每个调用都要用同一个模型。按"任务复杂度"分级：

```
[Tier 1 - 便宜 + 快]      deepseek-chat / qwen-turbo / gpt-4o-mini
   ↑
[Tier 2 - 中等]           deepseek-chat（默认）
   ↑
[Tier 3 - 强 + 贵]        deepseek-reasoner / gpt-4o / claude-3.5-sonnet
```

#### 5.1 在本项目的应用

| 任务 | 复杂度 | 推荐模型 |
|---|---|---|
| 转录文本压缩 / 去口水话 | 低 | qwen-turbo（贼便宜） |
| **切片分析（核心）** | 中 | deepseek-chat（默认） |
| 爆款标题生成 | 低-中 | deepseek-chat 或 qwen-plus |
| 剪辑指导生成 | 中 | deepseek-chat |
| 复杂场景的精细切片（比如医疗、法律内容） | 高 | deepseek-reasoner |

#### 5.2 两阶段筛选（提质降本）

```
Step 1: 用便宜模型粗筛
  qwen-turbo 把 transcript 分成"高能段 / 普通段"
       ↓
Step 2: 只对"高能段"用 deepseek-chat 精细切片
```

**效果**：
- 总 token 量降 50%。
- 总成本降 60%（便宜模型贡献了大部分廉价 token）。
- 总延迟降 20%（粗筛模型快，精筛模型只跑一小部分）。

---

## 3. 稳定性优化（间接影响性能）

### 3.1 多厂商兜底 + 熔断

> 详见《面试技术方案-完整版.md》第 8 节。核心：DeepSeek 挂了能秒切 qwen / OpenAI，避免任务全失败重跑。

### 3.2 超时分级

```python
# 现在所有 LLM 调用都 timeout=120
# 改成按 batch 大小分级
def calc_timeout(batch_token_count):
    if batch_token_count < 2000:
        return 30
    elif batch_token_count < 8000:
        return 60
    else:
        return 120
```

**好处**：小 batch 不需要等 120s 才知道挂了，快速失败 + 快速重试。

### 3.3 重试退避策略

```python
# 现在：固定 2-3s 退避
await asyncio.sleep(2 * attempt)

# 改进：指数 + jitter
await asyncio.sleep(min(2 ** attempt + random.random(), 30))
```

**作用**：jitter（随机抖动）避免"重试风暴"——所有失败请求同时重试又同时失败。

---

## 4. 可观测性（性能优化的眼睛）

**没有数据就没有优化**。必须建立 LLM 调用的指标体系。

### 4.1 必须采集的指标（埋点）

```python
@track_llm_call
async def chat_completion(...):
    start = time.time()

    resp = await client.chat.completions.create(...)

    end = time.time()

    metrics.record({
        "provider": "deepseek",
        "model": "deepseek-chat",
        "purpose": "clip_analyze",
        "input_tokens": resp.usage.prompt_tokens,
        "output_tokens": resp.usage.completion_tokens,
        "cached_tokens": resp.usage.prompt_cache_hit_tokens,   # ← cache 命中率
        "total_latency_ms": (end - start) * 1000,
        "cost_micro_yuan": calc_cost(...),
        "success": True,
        "json_parse_success": True,
        "retry_count": 0,
    })
```

### 4.2 必须监控的核心指标

| 指标 | 含义 | 目标 |
|---|---|---|
| **Total Latency p95/p99** | 端到端调用延迟 | < 15s |
| **Task End-to-End Latency** | 单个任务总耗时（含所有 batch 并发） | < 30s |
| **JSON 解析成功率** | 输出可被直接解析的比例 | > 99% |
| **重试率** | 调用失败后重试的比例 | < 5% |
| **Cache 命中率** | 前缀缓存命中比例 | > 50% |
| **Token / 任务** | 单任务平均消耗 token | 持续下降 |
| **成本 / 任务** | 单任务平均花费 | 持续下降 |

### 4.3 报警规则示例

```yaml
- alert: LLM_HighLatency
  expr: histogram_quantile(0.95, llm_latency_ms) > 30000
  duration: 5m
  action: 钉钉告警 + 自动切换备用厂商

- alert: LLM_HighFailureRate
  expr: rate(llm_call_failed[5m]) / rate(llm_call_total[5m]) > 0.1
  action: 触发熔断 + 通知

- alert: LLM_CostSpike
  expr: increase(llm_cost_micro_yuan[1h]) > 50000000  # 1 小时超 50 元
  action: 检查是否被刷
```

---

## 5. 优化收益预估

把上面的优化做完，对一个 2H 视频的处理任务：

| 优化项 | 延迟降幅 | 成本降幅 | 实施难度 |
|---|---|---|---|
| ① Batch 并发（asyncio.gather） | -70% | 0 | ⭐ 低 |
| ② Clip 并发（guide + title） | -85% | 0 | ⭐ 低 |
| ③ Context Cache（DeepSeek 原生） | -20~30% | -40% | ⭐ 低 |
| ④ Transcript 压缩 | -25% | -25% | ⭐⭐ 中 |
| ⑤ response_format=json_object | -10% | -5% | ⭐ 低 |
| ⑥ 精确缓存 | 重复请求 0 延迟 | -100% | ⭐ 低 |
| ⑦ 模型分级 | -20% | -50% | ⭐⭐⭐ 高 |
| ⑧ 监控埋点 | 0 | 间接 | ⭐⭐ 中 |
| ⑨ 多厂商熔断 | 失败时间断崖式降 | 0 | ⭐⭐ 中 |

**综合预估**：
- LLM 总延迟：60s → **10-15s**（降 75-80%）
- 平均成本：0.05 元 → **0.018 元**（降 60-65%）
- JSON 解析成功率：~95% → **99%+**（减少无效重试）

---

## 6. 优化的优先级落地路线图

不要一上来全做。**按性价比排序**：

### Phase 1（一周内，0 风险）
- ✅ analyzer.py 串行 → 并发（最大收益，10 行改动）
- ✅ response_format=json_object
- ✅ Context Cache（调整 messages 顺序）
- ✅ 加监控埋点（structlog + Prometheus）

### Phase 2（两周内）
- ✅ Clip 并发（editing_guide + viral_title）
- ✅ Transcript 压缩 / 预处理（去口水话）
- ✅ 精确缓存（同 transcript 命中直接返回）

### Phase 3（一个月内）
- ✅ 多厂商兜底 + 熔断
- ✅ 语义缓存
- ✅ 模型分级路由

### Phase 4（长期）
- ✅ A/B 测试不同 prompt 的效果
- ✅ 微调小模型（如果数据够多，把粗筛任务交给微调过的开源模型）
- ✅ 自建推理服务（如果调用量 > 1M/天，自部署 + 量化 + 批推理可降本 80%）

---

## 7. 面试时怎么讲（话术模板）

### 开场（30 秒，定调子）

> "项目里 LLM 是核心调用。我做性能优化是按 4 步法：**先量、再找瓶颈、再改、最后验证**。重点优化 4 个维度：延迟、吞吐、成本、质量。"

### 切入瓶颈（1 分钟，秀肌肉）

> "我看 `analyzer.py` 第 223 行，发现一个明显的瓶颈：transcript 被切成 5-8 个 batch，但代码是 for 循环**串行**调 DeepSeek。一个 batch 平均 10 秒，跑完 5 个就是 50 秒。这是最大的延迟来源。"

### 给方案（2-3 分钟，分层讲）

> "我的优化方案分 5 个方向，按收益排序：
> 1. **并发化**：把 for 循环改成 `asyncio.gather` + 信号量限流，立刻降 70% 延迟。
> 2. **Prompt 优化**：DeepSeek 自带 Context Cache，把固定 prompt 放前面，变化的 transcript 放后面，cache 命中后这部分 token 降到 1/10 价格。
> 3. **输出优化**：加上 `response_format=json_object` 100% 保证合法 JSON，省掉正则修补 + 重试浪费。
> 4. **缓存**：精确缓存（哈希）+ 语义缓存（embedding 相似度），重复任务直接返回。
> 5. **模型分级**：粗筛用 qwen-turbo，精筛用 deepseek-chat，复杂任务才上 deepseek-reasoner。"

> 💡 注意点（讲完之后可以补一句体现思考深度）：
> "我们这个场景**不需要流式输出**——业务上看的是最终的 clip 列表，不是逐字打字机效果，加 streaming 反而增加增量 JSON 解析的复杂度，没有收益。"

### 落地（30 秒，显示工程能力）

> "我会按 Phase 1-4 分期落地。第一周先做并发化和 response_format，零风险高收益。然后逐步上缓存、模型路由、监控大盘。每一步上线前都用 LLM 指标看板对比 p95 延迟和单任务成本。"

### 收尾（讲收益，加分项）

> "整体预估：LLM 总延迟从 60s 降到 12s（-75%），单任务成本从 5 分降到 2 分（-60%），JSON 解析成功率从 95% 升到 99%+（减少无效重试）。"

---

## 8. 面试官可能追问 + 答案

**Q：为什么并发不会拖垮 DeepSeek？**
> A：DeepSeek 默认 RPM 600+，我们单进程并发 5、集群并发 20，远低于上限。再加上 Redis 全局信号量做集群级限流，触发 429 也会自动退避重试。

**Q：为什么不上流式输出（streaming）？**
> A：我们业务场景是分析完整 transcript 给出 clip 列表，前端只关心最终的完整 JSON 数组，不是逐字打字机式的对话。流式带来的"边吐边显示"对用户无价值，反而增加增量 JSON 解析的复杂度和 bug 风险。**业务驱动技术选型**——没必要为了流式而流式。如果换成"AI 写文案"这种用户期待逐字看到的场景，再上 streaming。

**Q：语义缓存的相似度阈值怎么定？**
> A：先离线收集 1000 对正负样本，画 ROC 曲线找最优点，一般 cosine 相似度 0.92-0.95 之间。上线后通过命中后人工抽检准确率持续校准。

**Q：Context Cache 命中率怎么衡量？**
> A：DeepSeek 在 response.usage 里直接返回 `prompt_cache_hit_tokens`，除以 `prompt_tokens` 就是命中率。打到监控大盘看趋势。

**Q：模型分级会不会让效果不稳定？**
> A：会有边缘 case，所以要做：① 路由规则要可灰度（按 % 流量切）；② 关键场景留出 fallback（小模型失败自动升级到大模型）；③ 离线评估每个模型在每个场景的准确率，保证选择合理。

**Q：如果 DeepSeek 不支持 response_format 怎么办？**
> A：DeepSeek 已经支持。即使不支持，也可以用 Function Calling / Tool Use 强制结构化输出，效果差不多。最差用正则 + JSON Schema 校验 + 解析失败重试。

**Q：你们什么时候考虑自建模型？**
> A：当调用量超过 1M token/天，或者数据隐私要求高时。可以用 vLLM / TGI 部署量化版 Qwen2-7B / DeepSeek-V2-Lite，单卡 4090 就能跑，TPS 是云 API 的 3 倍，成本降 80%。

---

## 9. 一图总结：LLM 性能优化全景

```
┌────────────────────────────────────────────────────────────┐
│            LLM 性能优化系统性方案                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ① 定基线 ── 监控埋点（p95 延迟 / Token / Cost / Cache Hit）  │
│       ↓                                                    │
│  ② 找瓶颈 ── 当前: analyzer 串行调用 + 无 cache + 无 JSON 模式 │
│       ↓                                                    │
│  ③ 分层优化                                                  │
│                                                            │
│   延迟优化              成本优化              质量优化         │
│   ─────────             ─────────             ─────────     │
│   ✓ 并发(gather)        ✓ Context Cache       ✓ JSON Schema │
│   ✓ Prompt 压缩         ✓ 精确缓存            ✓ 强制 JSON     │
│   ✓ Context Cache       ✓ 语义缓存            ✓ 重试 + 退避   │
│   ✓ 模型分级            ✓ 模型分级            ✓ 多厂商兜底    │
│   ✓ Transcript 裁剪     ✓ Prompt 压缩         ✓ 熔断器       │
│                                                            │
│       ↓                                                    │
│  ④ 验收 ── A/B 对比 p95、单任务成本、JSON 解析成功率           │
│       ↓                                                    │
│  ⑤ 持续 ── 每月复盘指标趋势，迭代优化                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 附录：关键代码改造示例汇总

### A. analyzer.py 并发改造（核心 30 行）

```python
import asyncio

class ClipAnalyzer:
    LLM_MAX_CONCURRENCY = 5

    async def analyze(self, transcript: list[dict]) -> list[dict]:
        batches = self._split_transcript(transcript)
        logger.info(f"Analyzing {len(batches)} batches concurrently")

        sem = asyncio.Semaphore(self.LLM_MAX_CONCURRENCY)

        async def run_one(idx, batch):
            async with sem:
                return await self._analyze_batch_with_retry(idx, len(batches), batch)

        results = await asyncio.gather(
            *(run_one(i, b) for i, b in enumerate(batches)),
            return_exceptions=True,
        )

        all_clips, failed_batches = [], []
        clip_id_counter = 1
        for i, r in enumerate(results):
            if isinstance(r, Exception) or r is None:
                failed_batches.append(i + 1)
                continue
            for clip in r:
                clip["clip_id"] = clip_id_counter
                clip_id_counter += 1
            all_clips.extend(r)

        all_clips = self._align_to_transcript(all_clips, transcript)
        all_clips.sort(key=lambda x: x.get("virality_score", 0), reverse=True)
        all_clips = self._deduplicate(all_clips)
        return all_clips
```

### B. 强制 JSON + Cache 友好的 messages 结构

```python
# 把 prompt 拆成 system（固定）+ user（变化）
SYSTEM_PROMPT = """你是一个直播切片剪辑专家...
（场景的所有规则、要求、输出格式说明）"""

USER_TEMPLATE = "## 转录文本（带时间轴，单位：秒）\n{transcript}"

response = await self.client.chat.completions.create(
    model=self.model,
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT},   # ← cache 命中
        {"role": "user", "content": USER_TEMPLATE.format(transcript=formatted)},
    ],
    response_format={"type": "json_object"},
    temperature=0.3,
    timeout=60,
)
# 直接 json.loads，不再需要正则修补
clips = json.loads(response.choices[0].message.content)["clips"]
```

### C. Clip 级并发（editing_guide + viral_title）

```python
async def enrich_clips_concurrent(clips):
    """对所有 clip 并发跑剪辑指导 + 爆款标题"""
    guide_gen = EditingGuideGenerator()
    title_gen = ViralTitleGenerator()

    async def enrich_one(clip):
        guide_task = guide_gen.generate(clip)
        title_task = title_gen.generate(clip)
        guide, titles = await asyncio.gather(guide_task, title_task)
        clip["editing_guide"] = guide
        clip["viral_titles"] = titles
        return clip

    sem = asyncio.Semaphore(10)   # 控制总并发
    async def with_limit(clip):
        async with sem:
            return await enrich_one(clip)

    return await asyncio.gather(*(with_limit(c) for c in clips))
```

**效果**：10 个 clip × 2 个 LLM 串行 = 100s → 并发后 ≈ 6-8s。
