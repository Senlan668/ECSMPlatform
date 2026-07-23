# 阶段 E：MP3 → ASR → LLM → Clips 数据流详解

> 本文聚焦后端 Pipeline（阶段 E）这一段：服务端拿到 MP3 之后，怎么把它变成数据库里的一堆 `Clip` 记录。
>
> 涉及代码：
> - `backend/app/services/transcriber.py` — Groq Whisper ASR 转录
> - `backend/app/services/analyzer.py` — DeepSeek LLM 切片分析
> - `backend/app/workers/pipeline.py` — 串起整条流水线
> - `backend/app/models/database.py` — `tasks` / `clips` 表结构

---

## 1. MP3 → ASR 转换出的结果是啥

**调用方**：`backend/app/services/transcriber.py::GroqASRTranscriber._transcribe_single()`（第 112-168 行）

### 1.1 发给 Groq 的请求（HTTP 层）

```
POST https://api.groq.com/openai/v1/audio/transcriptions
Authorization: Bearer <GROQ_API_KEY>
Content-Type: multipart/form-data

file:                          <MP3 二进制>
model:                         whisper-large-v3 (或配置中的型号)
response_format:               verbose_json
timestamp_granularities[]:     segment
```

### 1.2 Groq 原生返回

```json
{
  "task": "transcribe",
  "language": "chinese",
  "duration": 7200.0,
  "text": "今天我们来聊聊...第一个问题是...",
  "segments": [
    { "id": 0, "start": 0.0,  "end": 5.4,  "text": "大家好欢迎来到直播间", "...": "..." },
    { "id": 1, "start": 5.4,  "end": 12.1, "text": "今天我们来聊聊行业内幕", "...": "..." },
    { "id": 2, "start": 12.1, "end": 18.7, "text": "其实这件事我憋了很久了", "...": "..." }
  ]
}
```

#### 1.2.1 顶层 `text` vs `segments`：到底哪个才是"完整文案"

**结论**：两者内容等价，但项目里**只用 `segments`，顶层 `text` 直接被丢弃**。

- **顶层 `text`**：Whisper 把整段音频识别出来的一整坨文字，**没有时间戳、没有换行**。20 分钟直播音频对应的 `text` 约 **15000–18000 字**（中文直播语速约 750–900 字/分钟）。
- **`segments[].text` 拼起来 ≈ 顶层 `text`**：Whisper 保证 segments 按时间顺序首尾相接（`segments[i].end ≈ segments[i+1].start`），所以 `" ".join(seg.text for seg in segments)` 几乎等于顶层 `text`，差别只在标点/空格归一化。
- **为什么项目只用 segments？** 切片要给 LLM 的是"哪一秒说了什么"，没有时间戳的 `text` 没法回答这个问题。看 `transcriber.py` 第 152-165 行的代码，只读了 `payload["segments"]`，根本没碰顶层 `text`。
- **长音频切块的坑**：大于 25 分钟的音频会被切成多块分别调 Groq，每块各自返回一份顶层 `text`，这些 `text` 不会拼接回来（也用不到）。完整文案是靠 segments 拼出来的，所以这个"丢弃"是无所谓的。

### 1.3 经过后端清洗后落库的结构

`transcriber.py` 第 154-165 行只保留 3 个字段：

```json
[
  { "start": 0.0,  "end": 5.4,  "text": "大家好欢迎来到直播间" },
  { "start": 5.4,  "end": 12.1, "text": "今天我们来聊聊行业内幕" },
  { "start": 12.1, "end": 18.7, "text": "其实这件事我憋了很久了" }
]
```

> 这个列表直接赋值到 `task.transcript_json`（`pipeline.py` 第 84 行），存进 PostgreSQL 的 JSON 列。

#### 1.3.1 为什么要清洗？清洗了什么？

**动机一句话**：Groq 给的字段太多，但 LLM 切片只需要"什么时候说了什么"，其它全是噪声 + 占存储。

**Groq 原生 segment 实际字段（被精简前）**：

```json
{
  "id": 0,
  "seek": 0,
  "start": 0.0,
  "end": 5.4,
  "text": "大家好欢迎来到直播间",
  "tokens": [50364, 12378, 8848, ...],   // Whisper 内部 BPE token id，数组很长
  "temperature": 0.0,
  "avg_logprob": -0.234,                  // 平均 log 概率（置信度）
  "compression_ratio": 1.45,              // 压缩比（检测重复幻觉用）
  "no_speech_prob": 0.012                 // 这段是不是静音的概率
}
```

**清洗做的 5 件事**：

| 操作 | 代码位置 | 原因 |
|---|---|---|
| ① 丢弃 `id`/`seek`/`tokens`/`temperature`/`avg_logprob`/`compression_ratio`/`no_speech_prob` | `transcriber.py` 154-165 | Whisper 内部调试字段，LLM 用不到；`tokens` 数组尤其大，2 小时音频能把 JSON 撑到 5 MB+，存进 DB 浪费空间 |
| ② 空文本 segment 丢弃 | 第 156-158 行 `if not text: continue` | Whisper 偶尔会吐出 `text=""` 的"静音段"，对 LLM 是垃圾输入 |
| ③ 首尾 `.strip()` | 第 156 行 | Whisper 经常在 text 前面加空格（如 `" 大家好"`），去掉避免 LLM 提示词渲染歪 |
| ④ 强制 `float()` 类型转换 | 第 161-162 行 | 防止 Groq 偶尔返回 `int` 时间戳（如 `0`、`5`），后续 `_align_to_transcript` 用浮点比较，类型不统一会埋雷 |
| ⑤ 多块拼接 + 偏移修正 + 排序 | 第 188-197 行 | 长音频切块后每块时间都从 0 开始，必须加 `offset` 才能对齐到原始音频时间轴 |

**最直观的收益**：JSON 体积从约 **5 MB 砍到 300–600 KB**（约 1/10），DB 的 `tasks.transcript_json` 列才放得下。

### 1.4 关键细节

- **长音频自动切块**：大于 25 分钟（`groq_asr_chunk_minutes`）的 MP3，先用 ffmpeg `-c copy` 切块（`transcriber.py::_split_audio`，第 34-82 行），再**逐块调用** Groq，每块返回后把 segment 的 `start/end` 加回该块的 offset（第 184-192 行），最后合并按 start 排序。
- **OBS 偏移修正**：如果 `task.video_start_offset > 1.0`（OBS 分段录制场景），`pipeline.py` 第 87-96 行会再把每个 segment 的时间加上视频 PTS 偏移，让 segment 的时间与原视频时间对齐。

---

## 2. ASR 结果 → LLM 的过程

调用链：`pipeline.py::run_video_pipeline()` 第 122-123 行 → `ClipAnalyzer.analyze()` → `_analyze_batch_with_retry()` → DeepSeek API。

### 2.1 分批（防止超 token）

`analyzer.py::_split_transcript()`（第 328-344 行）：

- 用 `len(text) / 1.5` 估算每段 token 数（中文经验值）
- 单批上限 `MAX_TOKENS_PER_BATCH = 6000`（第 201 行）
- 累计到上限就开新批

> 直观感受：一批大约能装 **9000 字左右** 转录，差不多覆盖 30–60 分钟语音。

**分批 ≠ 单次塞满**：不要把"分批"误解为"全部塞进一次请求"。每一批都是**独立的一次 DeepSeek 调用**，所有批次串行执行（`analyzer.py` 第 223 行 `for i, batch in enumerate(batches)`），每批各自返回一组候选 clips，最后再合并/去重。

**不同时长音频的分批数量**：

| 音频时长 | 估算字数 | 估算 tokens | 分批数量 |
|---|---|---|---|
| 20 分钟 | 15000–18000 字 | 10000–12000 | **2 批** |
| 30 分钟 | 22500 字 | 15000 | 2–3 批 |
| 60 分钟 | 45000 字 | 30000 | 5 批 |
| 120 分钟 | 90000 字 | 60000 | **约 10 批** |

> 所以**20 分钟音频不是"一次性全塞 LLM"**，而是被切成大约 2 批分别调用。

### 2.2 拼 Prompt

`analyzer.py::_format_transcript()`（第 346-351 行）把当前批次的 segments 拼成：

```text
[0.0s → 5.4s] 大家好欢迎来到直播间
[5.4s → 12.1s] 今天我们来聊聊行业内幕
[12.1s → 18.7s] 其实这件事我憋了很久了
...
```

然后用 `scene.prompt_template.format(transcript=formatted)` 套到场景模板。

#### 2.2.1 送给 LLM 的不是顶层 `text`，是带时间戳的 segments

很多人会以为"反正都是文字，发顶层 `text` 不就行了？"——**不行**。LLM 的任务是"挑出哪几段精彩 + **给出精确的 start/end 秒数**"，如果只发一坨没时间戳的文字，LLM 根本不知道某句话在第几秒，只能瞎编时间。所以每行都要带 `[Xs → Ys]` 前缀，让 LLM **直接抄上面的时间数字**，提示词里还会强制要求"禁止四舍五入或编造时间点"（见 2.3 节的"时间精度要求"）。

#### 2.2.2 关于语气词与口语原文

送给 LLM 的文本是**带语气词的口语原文**，没有任何清稿：

- Whisper 转录本身就带语气词："嗯"、"啊"、"那个"、"就是说"、"哎"、"哈哈"…… 都会被识别成文字
- 项目代码**没做任何文本过滤/正则替换/去语气词**，只在 segment 层做了首尾 `.strip()`（见 1.3.1 操作③）
- 所以 LLM 看到的就是带语气词的原始口语流

**为什么不去？**

1. **时间戳会错位**：每个 segment 的 `start/end` 对应原始口播位置，删了"嗯"就让句子边界乱套，LLM 复用秒数时会对不齐音频
2. **LLM 不在乎**：DeepSeek 完全能在带语气词的口语里识别"金句"和"高能时刻"，反而语气词有助于它判断情绪（"哈哈哈"通常意味着搞笑片段）
3. **没必要**：切片的产出是"时间段元数据"，不是"清稿文案"，原始口语保留就行

### 2.3 LLM 提示词（以直播场景为例）

完整模板在 `analyzer.py::_LIVESTREAM_PROMPT`（第 33-70 行），核心结构：

```text
你是一个直播切片剪辑专家。分析以下直播转录文本，找出适合制作短视频切片的精彩片段。

## 转录文本（带时间轴，单位：秒）
[0.0s → 5.4s] 大家好欢迎来到直播间
[5.4s → 12.1s] ...

## 切片标准
1. 高能时刻：情绪爆发、搞笑片段、争议讨论
2. 干货知识：有价值的观点、教程、经验分享
3. 互动精彩：与观众的精彩互动
4. 金句名言：可传播的经典语句
5. 带货亮点：产品展示、砍价、用户反馈

## 切片要求
- 每个切片 30秒 ~ 3分钟
- 完整起承转合，不能话说一半就切
- 开头要有"钩子"，结尾要有"价值感"

## 时间精度要求
- start_time 和 end_time 必须直接使用上方转录文本中出现的秒数值
- 禁止四舍五入或编造时间点
- 各切片之间不能有时间重叠

## 输出格式
请严格输出 JSON 数组，不要包含其他文本：
[
  {
    "clip_id": 1,
    "title": "...",
    "start_time": 510.2,
    "end_time": 604.7,
    "duration": 94.5,
    "type": "高能时刻",
    "summary": "...",
    "virality_score": 8,
    "suggested_caption": "..."
  }
]
```

> 面试场景（`_INTERVIEW_PROMPT`）要求 3-5 分钟、按"一问一答"切；课程场景（`_LECTURE_PROMPT`）要求 5-10 分钟、按"知识点"切。三个模板都强制 LLM 复用转录里出现过的秒数，禁止编时间。

### 2.4 请求参数

`analyzer.py` 第 277-282 行：

```python
response = await self.client.chat.completions.create(
    model=self.model,                # deepseek-chat
    messages=[{"role": "user", "content": prompt}],
    temperature=0.3,                 # 低温度，求稳定
    timeout=120,
)
```

- 单批失败重试最多 3 次，指数退避（`3 * attempt` 秒）
- 走 OpenAI SDK 兼容协议，`base_url = api.deepseek.com`

### 2.5 LLM 原生返回

LLM 回的就是一个 JSON 数组字符串，可能被 \`\`\`json … \`\`\` 包裹（`_parse_response` 第 353-390 行做两层兜底：先 `json.loads` 整段，再 regex 抓 `\[.*\]`）。解析后是：

```json
[
  {
    "clip_id": 1,
    "title": "炸场金句：千万别这样做",
    "start_time": 312.5,
    "end_time": 398.2,
    "duration": 85.7,
    "type": "高能时刻",
    "summary": "主播激情吐槽行业乱象...",
    "virality_score": 9,
    "suggested_caption": "看完直接泪目..."
  }
]
```

### 2.6 后处理（关键，决定最终质量）

`analyzer.py::analyze()` 拿到所有批次的 clips 后，依次做四件事：

| 步骤 | 代码位置 | 干啥 |
|---|---|---|
| ① 重新连续编号 | 第 231-234 行 | 多批 LLM 各自从 `clip_id=1` 开始，合并后重排为 1, 2, 3, … |
| ② 对齐到转录边界 | `_align_to_transcript` 第 421-495 行 | LLM 给的时间是浮点，强制 snap 到最近的 transcript segment 起止点，防止编时间；同时砍掉时长 < `min_duration`、把时长 > `max_duration` 的截断 |
| ③ 按分数排序 | 第 251 行 | `virality_score` 降序 |
| ④ 去重 | `_deduplicate` 第 392-419 行 | 双向重叠率 > `dedup_overlap_ratio`（直播 0.3 / 面试 0.2 / 讲座 0.2）就丢分数低的 |

走完这四步得到的 `clip_plans` 列表，就是要往数据库写的最终内容。

---

## 3. 输出到 Clips 表的结果

`pipeline.py` 第 156-175 行，把上一步的每个 `clip_plan` 转成 `Clip` ORM 对象并 INSERT：

```python
clip_record = Clip(
    task_id=task.id,
    clip_index=clip_plan["clip_id"],        # 1, 2, 3, ...
    title=clip_plan.get("title", ...),
    summary=clip_plan.get("summary", ""),
    clip_type=clip_plan.get("type", "未分类"),
    start_time=clip_plan["start_time"],
    end_time=clip_plan["end_time"],
    duration=clip_plan.get("duration", end - start),
    virality_score=clip_plan.get("virality_score", 5),
    suggested_caption=clip_plan.get("suggested_caption", ""),
    file_key=None,                          # 永远为 None，没有切好的视频文件
)
```

对应 `clips` 表一行数据，schema 在 `backend/app/models/database.py` 第 51-76 行：

```text
id                 UUID            主键
task_id            UUID            外键 → tasks.id
clip_index         int             人类可读的序号 1,2,3...
title              varchar(200)    "炸场金句：千万别这样做"
summary            text            "主播激情吐槽行业乱象..."
clip_type          varchar(50)     "高能时刻"
start_time         float           312.5     ← 单位：秒，相对音频起点（已加 video_start_offset）
end_time           float           398.2
duration           float           85.7
virality_score     int             9         ← 1-10
suggested_caption  text            "看完直接泪目..."
file_key           varchar(500)    NULL      ← 关键：永远为 NULL
viral_titles       JSON            NULL      ← 阶段 H 才会被填
editing_guide      JSON            NULL      ← 阶段 H 才会被填
created_at         timestamp
```

> 关键认知：**Clip 表里没有视频文件，只有"在哪一段时间，讲的什么内容，多炸"**。`file_key = NULL` 直接决定了前端阶段 F 的按钮显示为"一键复制时间，去剪映中裁切"，而不是"下载切片"。

---

## 4. MP3 → Clips 完整数据流（一张图看完）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ storage/uploads/1715680000000_xxx.mp3        ← 阶段 B 落地的音频              │
│ (16kHz mono 64kbps, ~30MB for 2h)                                            │
└──────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │  transcriber.py::_split_audio()
                                  │  按 25 分钟切块 (ffmpeg -c copy)
                                  ▼
              [chunk0.mp3 offset=0,    chunk1.mp3 offset=1500,
               chunk2.mp3 offset=3000, chunk3.mp3 offset=4500, ...]
                                  │
                                  │  逐块 POST groq /audio/transcriptions
                                  │  multipart: file + verbose_json + segment
                                  ▼
              ┌────────────────────────────────────────────────┐
              │ Groq 原生返回 (每块):                          │
              │ { segments: [{start, end, text}, ...] }       │
              └────────────────────────────────────────────────┘
                                  │
                                  │  每段 start/end += offset
                                  │  合并按 start 排序
                                  ▼
                  transcript: list[dict]   ← 内存中的列表
                  [
                    {start: 0.0,   end: 5.4,  text: "大家好..."},
                    {start: 5.4,   end: 12.1, text: "今天..."},
                    ...                                              (可能上千条)
                  ]
                                  │
                                  ├──► task.transcript_json (DB 持久化点 ①)
                                  │    PostgreSQL: tasks.transcript_json (JSON)
                                  │
                                  │  pipeline.py: 如果 video_start_offset > 1.0
                                  │  每段 start/end 再 += video_start_offset
                                  ▼
                  transcript (时间已对齐到原视频)
                                  │
                                  │  analyzer.py::_split_transcript()
                                  │  按 6000 token/批 切分
                                  ▼
              [batch0, batch1, batch2, ...]   ← 2h 内容大约切成 2-4 批
                                  │
                                  │  每批: _format_transcript() 拼成
                                  │  "[0.0s → 5.4s] 大家好...\n[5.4s → 12.1s]..."
                                  │  套进 _LIVESTREAM_PROMPT / _INTERVIEW_PROMPT / _LECTURE_PROMPT
                                  │
                                  │  POST api.deepseek.com /chat/completions
                                  │  model=deepseek-chat, temperature=0.3, timeout=120s
                                  │  失败重试 3 次 (退避 3s/6s/9s)
                                  ▼
              ┌────────────────────────────────────────────────┐
              │ DeepSeek 返回 (每批):                          │
              │ "```json\n[{clip_id, title, start_time,...}]```│
              └────────────────────────────────────────────────┘
                                  │
                                  │  _parse_response() 去 markdown 围栏 + json.loads
                                  ▼
              所有批次的 clips merge 成一个大数组
                                  │
                                  │  ① 重新连续编号 clip_id
                                  │  ② _align_to_transcript()
                                  │       - 砍掉 start_time 缺失/异常的
                                  │       - 把 start/end snap 到最近 segment 边界
                                  │       - 时长 < min_duration 丢弃
                                  │       - 时长 > max_duration 截断
                                  │  ③ 按 virality_score 降序
                                  │  ④ _deduplicate() 双向重叠 > 阈值丢低分
                                  ▼
                  clip_plans: list[dict]   ← analyzer 最终输出
                  [
                    {clip_id, title, start_time, end_time, duration,
                     type, summary, virality_score, suggested_caption},
                    ...
                  ]
                                  │
                                  │  pipeline.py 第 156-174 行
                                  │  for clip_plan in clip_plans:
                                  │      db.add(Clip(..., file_key=None))
                                  │  await db.commit()
                                  ▼
              ┌────────────────────────────────────────────────┐
              │ PostgreSQL: clips 表 (DB 持久化点 ②)           │
              │ 每个切片一行，file_key 永远为 NULL              │
              └────────────────────────────────────────────────┘
                                  │
                                  ▼
                  task.status = 'done', progress = 100
                  SSE 推一条 status='done' 给前端
                  前端 GET /api/tasks/:id → 渲染 ClipCard 列表
```

### 进度条对应关系

| Pipeline 步骤 | progress | status |
|---|---|---|
| 音频就绪 | 15% | `transcribing` |
| Groq 转录中 | 15→60% | `transcribing` |
| DeepSeek 分析中 | 60→90% | `analyzing` |
| 写入 clips 表 | 95% | `uploading` |
| 完成 | 100% | `done` |

---

## 5. 2 小时 MP3 实际数据流转

按经验值估算（实际看内容密度和场景，会有 ±50% 波动）：

### 5.1 输入

- `storage/uploads/xxx.mp3`：约 **57 MB**（16kHz mono 64kbps × 7200 秒 ÷ 8）

### 5.2 第①步：ASR 切块

- 切成 **5 块**：0-1500s / 1500-3000s / 3000-4500s / 4500-6000s / 6000-7200s
- 每块约 12 MB，确保单文件 < Groq 25 MB 上传上限

### 5.3 第②步：Groq 调用 5 次

- 当前实现是**串行**（`transcriber.py` 第 184 行 `for index, (chunk_path, offset) in enumerate(chunks)`）
- 每块约耗时 30-90 秒（Groq Whisper-large-v3 在 25 分钟音频上的典型速度）
- 合计耗时 **3-8 分钟**
- 返回总 segments 数量：约 **1500-3000 条**（直播语速，平均一段 3-5 秒）
- `transcript_json` 大小：约 **300-600 KB**

### 5.4 第③步：写入 transcript_json

- INSERT/UPDATE `tasks.transcript_json`，**1 次 DB 写**

### 5.5 第④步：分批送 DeepSeek

- 总 token 约 **6 万**（按 2 小时直播大概 9 万字 ÷ 1.5）
- 拆成 **10 批**（每批 6000 tokens）
- 每批 DeepSeek 响应约 30-60 秒
- 串行调用合计 **5-10 分钟**
- 每批返回 5-15 个 clip → 总计约 **50-150 个原始 clips**

### 5.6 第⑤步：后处理

- ✂ 对齐到 transcript 边界：可能砍掉 5-10 个时间越界的
- 🧹 去重：直播场景 0.3 阈值，砍掉约 20-30%（直播内容相似度高）
- 📊 排序：按 virality_score 降序
- 最终保留 **30-80 个 clips**

### 5.7 第⑥步：写入 clips 表

- 一次性 `db.add()` 30-80 行，**1 次事务 commit**

### 5.8 第⑦步：状态收尾

- `tasks.status = 'done'`, `progress = 100`
- SSE 推送，前端关闭长连接后再 `GET /api/tasks/:id` 拉取完整 clips

### 5.9 总耗时 & 总成本估算

| 项 | 估算 |
|---|---|
| 整体耗时 | **10-20 分钟**（Groq 3-8 分钟 + DeepSeek 5-10 分钟 + 数据库 < 1 秒） |
| Groq 费用 | $0.04/小时 × 2 = **~$0.08**（Whisper-large-v3） |
| DeepSeek 费用 | 输入 6 万 token + 输出 2 万 token ≈ **¥0.1-0.3** |
| 服务器磁盘占用 | 57 MB（音频）+ 600 KB（transcript_json）+ 几 KB（clips 表） |
| 服务器流量 | 上传 Groq 57 MB + 下载 Groq < 1 MB + DeepSeek < 1 MB |
| 数据库写入 | 4 次（创建 task + 写 transcript + 写 clips + 状态终态） |
| SSE 推送 | 每秒 1 条，整轮约 **600-1200 条**消息 |

### 5.10 用户视角的体感

```
00:00  浏览器抽音频 + 上传                 ████░░░░░░░░░░░░░░░░  20%
01:30  音频上传完成，任务创建              █████░░░░░░░░░░░░░░░  25%
01:35  status=transcribing 进度 15%        █████░░░░░░░░░░░░░░░
05:00  转录中... 进度 40%                  ████████░░░░░░░░░░░░
08:30  转录完成，进度 60%                  ████████████░░░░░░░░
08:31  status=analyzing 进度 60%
12:00  分析中... 进度 75%                  ███████████████░░░░░
17:00  status=uploading 进度 95%           ███████████████████░
17:05  status=done 进度 100% (30-80 个切片) ████████████████████  100%
17:05  前端弹出 ClipCard 列表
       ↓ 用户点 "✂️ 一键切片"
       ↓ 重新拖入 2.5GB 原视频
17:30  浏览器 FFmpeg.wasm 切片完成 → ZIP 下载
```

### 5.11 两个关键瓶颈

1. **ASR 串行切块**：当前 `for index in enumerate(chunks)` 是串行（`transcriber.py` 第 184 行），5 块 × 1 分钟 = 5 分钟。如果改成 `asyncio.gather`，理论上能压到 1 分钟。
2. **DeepSeek 串行批次**：`analyzer.py` 第 223 行 `for i, batch in enumerate(batches)` 也是串行，10 批 × 40s = 6-7 分钟。同理可并行化。

> 这两块的并行化方案在 `docs/阶段E2-并发改造方案.md` 里已经梳理过，是阶段 E 的下一步优化点。

---

## 6. 边界切断问题：2 小时音频跨边界的内容怎么办？

> 2 小时的视频会经过两次"硬切"：① ASR 阶段按 25 分钟切 MP3，② LLM 阶段按 6000 token 切 transcript。这两次切割都**没有重叠、没有缝合逻辑**，本节解释项目实际是怎么处理（或者说，怎么"不处理"）跨边界内容的。

### 6.1 ASR 阶段：刚好在 25 min 切断了一句完整的话，segments 怎么还原？

**结论：项目不做"还原"，靠 Whisper 自身鲁棒性兜底，接受边界处的少量识别误差。**

代码事实（`transcriber.py::_split_audio` 第 34-82 行）：

```text
ffmpeg -ss 1500 -to 3000 -i input.mp3 -c copy chunk1.mp3
ffmpeg -ss 3000 -to 4500 -i input.mp3 -c copy chunk2.mp3
...
```

- **硬切**：直接按秒数切，**没有静音检测**、**没有 overlap**（块之间是首尾相接的，不重叠）
- `-c copy` 是流拷贝，按音频帧（不是按样本）对齐到最近的帧边界，不会切出半个字节，但**会切在一个字、一个音节、甚至一句话的中间**
- 每块**各自独立**发给 Groq，Whisper 处理 chunk1 时**看不到** chunk0 的尾部，处理 chunk2 时也**看不到** chunk1 的尾部

**那句被切两半的话，最终长什么样？**

假设在 1500.0s 那一刻，主播正说到"……这件事**我憋**了很久了……"，"我憋"两个字横跨切点：

```text
chunk0 (0~1500s) 的最后一个 segment:
{ "start": 1497.2, "end": 1500.0, "text": "这件事我" }    ← Whisper 看到的就是被截断的音频

chunk1 (1500~3000s) 的第一个 segment（加 offset 后）:
{ "start": 1500.0, "end": 1503.4, "text": "憋了很久了" }   ← Whisper 看到的开头是半截音节
```

合并后（`transcriber.py` 第 197 行排序，**直接首尾相接，不做任何缝合**）：

```json
[
  ...,
  { "start": 1497.2, "end": 1500.0, "text": "这件事我" },
  { "start": 1500.0, "end": 1503.4, "text": "憋了很久了" },
  ...
]
```

**实际识别误差的三种典型形态**：

| 形态 | 概率 | 影响 |
|---|---|---|
| ① 干净分裂（如上例） | 较高 | 一句话被记为两个 segment，文本没丢字 |
| ② 边界字错认 | 中等 | "憋"→"别"，因 chunk1 开头听到的是半截音节 |
| ③ Whisper 幻觉重复 | 偶发 | chunk1 开头额外幻觉出"……这件事"，造成内容重复 |

**为什么项目敢这么干（不做缝合）？**

1. **影响小**：1500 秒里只有 1 个切点出问题，2 小时 5 次切块也只有 4 个边界，误差占比 < 0.5%
2. **LLM 容忍度高**：DeepSeek 读到 "这件事我 / 憋了很久了" 这种被拆开的内容时，仍然能理解上下文（segment 是相邻的，文本会一起进 prompt）
3. **`_align_to_transcript` 兜底**：即使 LLM 在边界附近选了 clip，也会被 snap 到现有 segment 边界，不会切出"半句开头"的视频

**这能改进吗？** 可以，行业常见方案是切块时加 5-10s overlap（如 `chunk1 = 1495~3005s`），然后在合并阶段检测重叠区域的 segment 文本相似度做去重缝合。**当前项目没做**，是个已知技术债。

---

### 6.2 LLM 阶段：6000 token 切断一段对话怎么办？怎么保证不丢上下文？

**结论：项目也不做上下文传递，但 6000 token 足够大 + 后处理去重，让这个问题不至于致命，但确实有"跨批长对话"漏检的风险。**

代码事实（`analyzer.py::_split_transcript` 第 328-344 行）：

```python
for seg in transcript:
    seg_tokens = len(seg["text"]) / 1.5
    if current_tokens + seg_tokens > self.MAX_TOKENS_PER_BATCH and current_batch:
        batches.append(current_batch)
        current_batch, current_tokens = [], 0   # ← 新批从零开始，无 overlap
    current_batch.append(seg)
    current_tokens += seg_tokens
```

- **硬切**：累计到 6000 token 就开新批，**没有 overlap**
- **无上下文传递**：每批是独立的一次 DeepSeek 调用，prompt 里只有"当前批次的 transcript"，**不带上一批的末尾几条 segment，也不带上一批挑出的 clips 摘要**

**假设刚好切到一段精彩对话的中间**：

```text
batch0 末尾（约 segment #800 处）:
[1798.2s → 1802.1s] 主播：那我问你，你觉得这个行业最大的坑是什么？
[1802.1s → 1808.5s] 嘉宾：我跟你讲，最大的坑就是……
              ↑↑↑ batch0/batch1 边界

batch1 开头（约 segment #801 处）:
[1808.5s → 1815.3s] 嘉宾：……所有人都以为是技术，其实是人心。
[1815.3s → 1823.0s] 主播：哇，这话说得太对了！这段必须剪出来！
```

**两批 LLM 各看到一半，会发生什么？**

| LLM 输出 | 概率 | 结果 |
|---|---|---|
| batch0 看到"问题 + 嘉宾起头"，觉得"没说完"，**不输出 clip** | 较高 | 漏检前半 |
| batch1 看到"嘉宾结论 + 主播感叹"，觉得"开头突兀"，**不输出 clip** | 较高 | 漏检后半 |
| 两批各自挑了对应一半，输出 2 个 clip | 中等 | `_deduplicate` 因时间不重叠 **不会去重**，前端会显示两个不完整的切片 |
| batch1 大胆把 start_time 写到 1798.2s（batch0 范围内）| 低 | `_align_to_transcript` 兜底，不会因越界而崩，但 batch1 的 LLM 看不到 1798.2s 的文字，纯属猜，概率极低 |

**项目当前的"缓解机制"（被动）**：

1. **6000 token 单批容量大**：9000 字 ≈ 30-60 分钟内容，**绝大多数对话/金句/段子都在单批内**完成，跨批的概率 < 10%
2. **`_deduplicate`** 第 392-419 行：跨批选了同一段相邻 clip 会去重（**但前提是时间段有重叠**，对上面那种"前半+后半"的场景**没用**）
3. **`_align_to_transcript`** 第 421-495 行：兜住"LLM 编时间"的情况，clip 时间必定落在合法 transcript 范围内
4. **直播场景 `min_duration=30s`**：过短的"半截 clip"会被直接丢弃

**真实风险**：一段横跨批边界的**长对话**（如 4 分钟的连续问答恰好横跨 batch0→batch1），**两边 LLM 都可能觉得"不完整"而双双跳过**，这是当前项目最大的漏检场景。

**怎么彻底解决？** 行业方案：分批时让相邻批次重叠 N 条 segment（如最后 50 条 = ~500 token），然后在合并阶段把重叠区内的 clip 用时间相似度去重。**当前项目没做**，同样是已知技术债（与 6.1 的 ASR overlap 是同一类问题）。

> ⚠️ 重要认知：**项目的"分批"只是为了塞进 token 限制，而不是为了精细化分析**。它假设"金句通常较短，单批内能装下"，对跨批长内容选择放弃。这是一个工程上的权衡（quality vs simplicity），不是 bug，但要清楚它的边界在哪里。

---

### 6.3 输出 clips 的数据结构示意

`clips` 表一行对应一个切片建议，**`file_key` 永远是 `NULL`**（项目不切视频文件，前端用 ffmpeg.wasm 自己切）。

```json
{
  "id": "9b8c3a14-7e3d-4f12-9c2a-3b5d8e1f0a77",
  "task_id": "1a2b3c4d-5e6f-7890-abcd-ef1234567890",

  "clip_index": 1,
  "title": "炸场金句：千万别这样做",
  "summary": "主播激情吐槽行业乱象，3 个真实案例炸出大量共鸣弹幕",
  "clip_type": "高能时刻",

  "start_time": 312.5,
  "end_time": 398.2,
  "duration": 85.7,

  "virality_score": 9,
  "suggested_caption": "看完直接泪目，原来我们都被坑过…",

  "file_key": null,

  "viral_titles": null,
  "editing_guide": null,

  "created_at": "2026-05-20T10:23:45.123Z"
}
```

**字段分组**：

| 分组 | 字段 | 谁填的 | 用途 |
|---|---|---|---|
| **身份** | `id`, `task_id` | 后端自动 | 主键 + 关联回 task |
| **展示** | `clip_index`, `title`, `summary`, `clip_type` | LLM 填，后端重排 `clip_index` | 前端 ClipCard 卡片展示 |
| **时间** | `start_time`, `end_time`, `duration` | LLM 给浮点 → 后端 `_align_to_transcript` snap 到 segment 边界 | 用户复制时间戳到剪映、或喂给 ffmpeg.wasm |
| **评分** | `virality_score` | LLM 填（1-10） | 前端列表按这个排序，分高的在前 |
| **文案** | `suggested_caption` | LLM 填 | 用户发布短视频时直接复制 |
| **文件** | `file_key` | 永远 `null` | 留给"将来后端真的切了视频"的扩展位 |
| **二次加工** | `viral_titles`, `editing_guide` | 阶段 H 的二次 LLM 调用才会填 | 一键生成多个爆款标题、剪辑指引（剪映分镜建议） |
| **时间戳** | `created_at` | 后端自动 | 审计/排序 |

**前端拿到的数组就长这样**（GET `/api/tasks/:id` 返回里的 `clips` 字段）：

```json
[
  {
    "id": "9b8c...",
    "clip_index": 1,
    "title": "炸场金句：千万别这样做",
    "clip_type": "高能时刻",
    "start_time": 312.5,
    "end_time": 398.2,
    "duration": 85.7,
    "virality_score": 9,
    "summary": "主播激情吐槽行业乱象...",
    "suggested_caption": "看完直接泪目...",
    "file_key": null,
    "viral_titles": null,
    "editing_guide": null
  },
  {
    "id": "ac4f...",
    "clip_index": 2,
    "title": "干货分享：3 个避坑指南",
    "clip_type": "干货知识",
    "start_time": 1245.0,
    "end_time": 1389.7,
    "duration": 144.7,
    "virality_score": 8,
    "...": "..."
  }
]
```

> 前端在拿到这个数组后，调用 `ClipCard` 组件渲染每一项，按钮文案根据 `file_key === null` 决定显示"✂️ 一键切片（浏览器内切）"还是"⬇️ 下载切片"。

---

## 7. 一句话总结

> 服务端拿到 MP3 之后，**先用 Groq 把声音转成带时间戳的文字（落 `transcript_json`），再用 DeepSeek 把文字读懂、挑出哪几段精彩并打分排序，最后把这些"时间段 + 元数据"作为多条记录写进 `clips` 表**。整条流水线从头到尾，服务端只见过音频和文字，没碰过一帧视频画面。
