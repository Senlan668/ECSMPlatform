# 阶段 B：上传 MP3 到服务器 —— 五问五答

> 对应代码：
> - 前端：`frontend/src/services/api.ts::uploadAudio()`
> - 后端：`backend/app/api/upload.py::upload_audio()`
> - ASR 消费方：`backend/app/services/transcriber.py::GroqASRTranscriber`

> 接口签名：`POST /api/upload/audio`（`multipart/form-data`）
> 后端返回：`{ audio_path, original_filename, size_bytes }`

---

## 问题 1：后端的 MP3 文件是存到服务器的本地吗？

**是的，存在运行 FastAPI 那台机器的本地磁盘**，没有走任何对象存储 / 云盘。

看实际代码 `backend/app/api/upload.py` 第 16 行：

```16:17:backend/app/api/upload.py
UPLOAD_DIR = os.path.join(settings.storage_dir, "uploads")
```

接收到上传后，文件名被加上时间戳前缀避免冲突：

```75:90:backend/app/api/upload.py
    timestamp = int(time.time() * 1000)
    stored_name = f"{timestamp}_{safe_name}"
    stored_path = os.path.join(UPLOAD_DIR, stored_name)

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # 流式写入
    total_bytes = 0
    try:
        with open(stored_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                await run_in_threadpool(f.write, chunk)
                total_bytes += len(chunk)
```

落地后的真实路径形如：

```
D:\dw_ai_project\ai-slice-course\backend\storage\uploads\1715680000000_demo.mp3
```

**关键含义**：
- 这是**服务器进程所在主机的本地文件系统**。
- 文件的"地址"就是后端返回的 `audio_path` 字段，纯本地绝对路径，前端拿到这串字符串没有任何意义（用户根本访问不到 `D:\` 盘），它只是**给后端自己的下一步 (创建 Task / Worker / ASR) 用的引用 key**。
- 如果后端是单机部署，所有任务都依赖这台机器的磁盘；如果以后想做多机 Worker，这个本地路径就行不通了，要换成 OSS / S3。

---

## 问题 2：后面使用 ASR 服务的时候，给 ASR 的什么东西？是 MP3 的本地路径还是云端路径？

**给的是"二进制内容本身"，不是路径**。云端 ASR 服务 (Groq Whisper) 根本看不到你服务器的磁盘。

看 `backend/app/services/transcriber.py` 第 123-141 行：

```123:141:backend/app/services/transcriber.py
        with open(audio_path, "rb") as file_obj:
            audio_data = file_obj.read()

        data = {
            "model": self.model,
            "response_format": "verbose_json",
            "timestamp_granularities[]": "segment",
        }
        headers = {"Authorization": f"Bearer {api_key}"}

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(60.0, read=600.0, write=600.0)
        ) as client:
            response = await client.post(
                self.TRANSCRIPTION_URL,
                data=data,
                files={"file": (os.path.basename(audio_path), audio_data, "audio/mpeg")},
                headers=headers,
            )
```

**整个流转链是**：

```
1. 后端从本地磁盘 open(audio_path, "rb").read() 拿到 30MB 的字节
2. 用 multipart/form-data 把这 30MB 直接 POST 到 Groq
       ─ files={"file": ("xxx.mp3", audio_data, "audio/mpeg")}
3. Groq 在自家服务器上跑 Whisper 模型，返回 JSON segments
```

**Groq 那边收到的就是一个完整 MP3 文件，不是 URL 也不是路径**。换句话说，这 30MB 走了两次网络：

| 跳 | 流向 | 体积 | 谁的带宽 |
| --- | --- | --- | --- |
| ① | 浏览器 → 你的后端 | ~30MB | 你的服务器入口带宽 |
| ② | 你的后端 → Groq | ~30MB | 你的服务器出口带宽 |

> 这就是为什么 ASR 服务必须由后端 (而不是浏览器直接) 去调：Groq API Key 不能塞前端泄漏。
>
> **如果改成 OSS**：阶段 2 仍然要把 MP3 内容拼到 multipart 里 POST 给 Groq，**没法只给一个 URL 让 Groq 自己去拉**（Whisper 接口不接受 URL，只接受 file 字段）。所以即使前端直传 OSS，后端依然要先从 OSS 下载，再转手发给 Groq。

如果音频 > 25 分钟，`_split_audio()` 会用 `ffmpeg -c copy` 在服务器本地切成小块，**对每一块**都重复 "读取本地文件 → POST 给 Groq" 的动作（同一段函数 `_transcribe_single` 被循环调用）。

---

## 问题 3：1MB 分块流式落盘，落盘的不是完整的 MP3 吗？为啥要分块？

**最终落盘的是完整 MP3**，"1MB 分块"指的是**接收数据并写入磁盘的过程**，不是文件本身被切碎。这是两件事：

```
完整文件: ████████████████████████████████ (30 MB)
        ↑ 落盘后磁盘上是一个完整、可播放的 .mp3

接收过程: ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ▓ ... (1MB + 1MB + 1MB + ...)
        ↑ HTTP 流来一段就 append 写一段
```

代码层面就是这个 while 循环：

```84:90:backend/app/api/upload.py
        with open(stored_path, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB chunks
                if not chunk:
                    break
                await run_in_threadpool(f.write, chunk)
                total_bytes += len(chunk)
```

`file.read(1024 * 1024)` 是从 **HTTP 请求体里读 1MB 就立即写盘**，并不是要做"分片上传协议"。

### 为啥不一口气 `file.read()` 一次性读完？

对比两种写法：

| 写法 | 内存峰值 | 风险 |
| --- | --- | --- |
| `data = await file.read(); f.write(data)` | **等于文件大小** (30MB × 并发数) | 用户上传 2GB 视频（fallback 通道）瞬间撑爆服务器内存 |
| 1MB 循环 | **恒定 1MB × 并发数** | 几乎不受文件大小影响 |

虽然这条路径专为 MP3 (~30MB) 设计，看似不会爆，但同一段代码也复用在 `/api/upload/video`（GB 级原视频上传，fallback 通道）里。**所以这是"防御性写法"，让上传逻辑天然不怕大文件**。

### 另一个隐藏好处：协作式调度

```python
chunk = await file.read(...)
await run_in_threadpool(f.write, chunk)
```

每次 `await` 都给 FastAPI 的 event loop 让出执行权：
- 同一进程里别的请求 (创建任务 / SSE 推送 / 拉详情) 不会被卡住。
- 磁盘写盘是阻塞 IO，丢到 `run_in_threadpool` 不会阻塞事件循环。

如果一次性 `read()` 30MB 再一次性 `write()`，event loop 整段时间是凉的。

> **一句话**：1MB 是"接收-落盘窗口"的大小，不是文件结构上的分片。最后磁盘上还是一整个标准 `.mp3`。

---

## 问题 4：`{ audio_path, original_filename, size_bytes }` 给一个实际数据结构示意

后端返回 (Windows 路径，反斜杠在 JSON 里要转义)：

```json
{
  "audio_path": "D:\\dw_ai_project\\ai-slice-course\\backend\\storage\\uploads\\1715680000000_demo_live_replay.mp3",
  "original_filename": "demo_live_replay.mp4",
  "size_bytes": 31415926
}
```

Linux 服务器上长这样：

```json
{
  "audio_path": "/data/ai-slice/backend/storage/uploads/1715680000000_demo_live_replay.mp3",
  "original_filename": "demo_live_replay.mp4",
  "size_bytes": 31415926
}
```

### 三个字段拆解

| 字段 | 类型 | 含义 | 谁会用 |
| --- | --- | --- | --- |
| `audio_path` | string | 服务器本地绝对路径，文件名前加了 13 位毫秒时间戳 (`1715680000000_`) 防止重名覆盖 | **后端自己**：阶段 C 创建 Task 时塞到 `tasks.source_path` 字段；阶段 E2 给 Groq 喂数据时用它 open 文件 |
| `original_filename` | string | 用户上传时的原始文件名（含原扩展名 `.mp4`，因为是浏览器拼的"原视频名"，没改成 .mp3） | 前端用来在任务详情页展示"视频名" |
| `size_bytes` | int | 实际落盘字节数 | 调试 / 日志 / 前端可选展示 |

### 前端怎么消费

`frontend/src/services/api.ts::uploadAudio()` 拿到这个对象后，立刻在 `UploadPage.handleUploadSuccess` 转手塞进 `POST /api/tasks`：

```jsonc
// 前端发的下一个请求 (阶段 C)
{
  "video_path": "D:\\dw_ai_project\\...\\1715680000000_demo_live_replay.mp3",  // ← 上一步的 audio_path
  "video_filename": "demo_live_replay.mp4",                                     // ← 上一步的 original_filename
  "video_start_offset": 0.0,                                                    // ← 阶段 A 算出来的
  "video_duration": 7200.0,                                                     // ← 阶段 A 算出来的
  "scene_mode": "livestream"
}
```

> 历史坑：字段叫 `video_path` 但塞的其实是音频路径。这是早期"视频直传"模式留下的命名遗留，后端 `Task.source_path` 统一接收，不影响功能但容易迷惑新人。

### `audio_path` 的命名规则

```
1715680000000_demo_live_replay.mp3
└────────────┘ └────────────────┘
   时间戳前缀     安全化的原文件名
   (毫秒)         (去掉非 [A-Za-z0-9_-. ] 字符)
```

安全化逻辑：

```72:74:backend/app/api/upload.py
    safe_name = "".join(
        c for c in file.filename if c.isalnum() or c in ("_", "-", ".", " ")
    ).strip()
```

中文文件名会被**几乎全部剥掉**只剩 `.mp3`，所以你看到磁盘上有时是 `1715680000000_.mp3` 这种孤魂野鬼（命名 bug，但功能可用，因为 `audio_path` 唯一性靠时间戳保证）。

---

## 问题 5：MP3 上传走的是服务器流量吗？换成 OSS 直传能扛 100 并发吗？

### 5.1 现在的链路：流量全压在你的服务器上

```
                            ┌──── 你的服务器 ────┐
浏览器 ──30MB POST──►  Nginx / FastAPI  ──30MB POST──►  Groq
                            └────────────────────┘

入口带宽: 30MB × N (N=同时上传的人)
出口带宽: 30MB × N (后端转发给 Groq)
磁盘写入: 30MB × N (流式落盘)
```

**100 个用户同时上传会发生什么**：

| 资源 | 单次 | 100 并发瞬时压力 | 卡点 |
| --- | --- | --- | --- |
| 入口带宽 | 30MB | **3GB** 同时灌进来 | 假设服务器带宽 100Mbps ≈ 12.5MB/s，要把 3GB 收完得 **~4 分钟**，期间所有人都在转圈 |
| FastAPI 并发数 | 1 个 worker 协程 | 100 个协程同时 await | event loop 还撑得住，但 IO 排队明显 |
| 磁盘 IO | 顺序写 30MB | **3GB 并发随机写** | 普通 SSD ~500MB/s，机械盘直接跪 |
| 内存峰值 | 1MB × 100 = 100MB | 不会爆，归功于分块流式 | ✅ 唯一不慌的 |
| 后续 Groq 转发 | 30MB 出 | 又一次 3GB 出 | 出口带宽再扛一次 |

**结论**：100 并发上传，瓶颈是**带宽 + 磁盘 IO**，不是 CPU、不是内存。如果服务器带宽不够，用户体验就是"上传卡在 70%-95% 死活不动"。

### 5.2 OSS 直传方案：把流量从你的服务器旁路掉

改造思路（典型的"前端直传 + 后端只签名"模式）：

```
                            ┌──── 你的服务器 ────┐
浏览器 ──签名请求──────►  FastAPI 签 STS Token ───┐
                            └───────────┬────────┘
                                        │ 只返回 OSS PUT URL + signature
浏览器 ◄────────────────────────────────┘
   │
   │ 30MB PUT 直接打到 OSS
   ▼
 ┌──────┐
 │ OSS  │ (阿里云 / S3 / COS / R2)
 └──┬───┘
    │ 浏览器 PUT 完后，再调一次 POST /api/tasks
    │ 把 oss_key 提交给后端
    ▼
 你的服务器只需要保存 oss_key (一个字符串)
```

### 5.3 流量对比表

| 维度 | 当前方案 (走自家服务器) | OSS 直传方案 |
| --- | --- | --- |
| 100 并发上传时，服务器入口流量 | **3GB** | ~几 KB (只是签名请求) |
| 服务器磁盘写入 | 3GB | 0 |
| 服务器是否成上传瓶颈 | **是** | 否，OSS 横向扩展无上限 |
| 后端发 Groq 时还要不要流量 | 30MB × N | **仍然要 30MB × N**（Groq Whisper API 不接受 URL，必须 file 字段） |
| 实现复杂度 | 一个 multipart 接口搞定 | 要签名 + CORS + 回调 / 校验，多两次请求 |
| API Key 泄漏风险 | 0 | 用 STS 临时凭证或预签名 URL，控制权限范围即可避免 |

### 5.4 那 ASR 那一段呢？真的没救吗？

有两个进阶招（看是否值得做）：

1. **后端用 OSS 内网下载**：服务器和 OSS 在同一个云厂商内网时，下载是免费且 10Gbps 起步，"中转"几乎不消耗公网带宽。
2. **换成支持 URL 的 ASR 服务**：例如 AssemblyAI / 阿里云语音识别支持 `audio_url`，可以让 ASR 服务自己去拉 OSS，那这一跳后端就彻底不参与了。Groq Whisper 当前不支持。

### 5.5 100 并发到底该怎么扛 —— 实操优先级

> 不一定非要上 OSS，按规模渐进升级最划算：

| 阶段 | 用户量级 | 改造方案 |
| --- | --- | --- |
| 0 | < 10 并发 | 当前实现就够，分块流式 + 单机磁盘 |
| 1 | 10–50 并发 | 加 Nginx 反代 / 限流 / 上传队列；多开 uvicorn worker；磁盘换 NVMe |
| 2 | 50–500 并发 | **上 OSS 直传**，服务器解耦掉上传 IO；同时 Worker 拆成独立机器从 OSS 拉文件做 ASR |
| 3 | 500+ 并发 / 多地域 | OSS + CDN 加速上传节点；ASR 改成内网拉取或换支持 URL 的服务 |

**对当前项目的直接建议**：
- 短期：把 `await file.read(1024 * 1024)` 的 chunk 大小保留，**别一次性 read 完**，已经是对的。
- 中期：如果用户真上量，把 `POST /api/upload/audio` 改成 `POST /api/upload/audio/sign` 返回一个 OSS 预签名 URL，前端 PUT 完拿到 `oss_key`，再调 `POST /api/tasks` 把 `oss_key` 当作 `video_path` 提交。后端 Worker 在跑 ASR 前从 OSS 下载到临时目录即可，主链路代码改动很小。
- 长期：Worker 节点和 OSS 同 region 内网，ASR 中转流量"虚化"到内网。

---

## 一句话回顾阶段 B

> 浏览器把 30MB MP3 用 `multipart/form-data` POST 到 `/api/upload/audio`；后端用 **1MB 流式 chunk** 把它原样落到 `storage/uploads/{timestamp}_{name}.mp3`（本机磁盘）；返回一个**只有后端自己看得懂的本地绝对路径** `audio_path`。这条路径会被阶段 C 写进 `tasks.source_path`，阶段 E 的 Worker 用它 `open()` 读出二进制再 POST 给 Groq。**全程都在你的服务器带宽里走两遍**，所以高并发时第一优化点就是把上传旁路到 OSS。
