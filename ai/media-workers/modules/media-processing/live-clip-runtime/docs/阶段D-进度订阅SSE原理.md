# 阶段 D：进入详情页订阅进度 —— 四问四答

> 对应代码：
> - 前端：`frontend/src/pages/TaskDetailPage.tsx`（`useEffect` 里的 SSE + 轮询兜底）
> - 后端：`backend/app/api/tasks.py::task_progress_sse`
> - 进度写入方：`backend/app/services/task_progress.py::update_task_progress` + `backend/app/workers/pipeline.py`

> 接口签名：`GET /api/tasks/{task_id}/progress`（`text/event-stream`）
> 后端：每个 SSE 连接一个协程，**每秒查一次 DB；只要查到任务且尚未终态，就无条件 `yield` 一条**（**不做 progress/message/status 的 diff**，内容与上一次重复也会推）。`done/failed` 推最后一次后退出循环。

---

## 问题 1：为什么要用 SSE？用轮询行不行？

**结论先行**：轮询行，本项目实际上也兜底了轮询。但**主路径**用 SSE 有 4 个明显优势，**配合这个项目"后台 Worker 跑几十秒~几分钟"的特征非常合适**。

### 1.1 三种方案对比

| 方案 | 通信模型 | 典型延迟 | 服务器开销 | 实现复杂度 | 适合本项目吗 |
| --- | --- | --- | --- | --- | --- |
| **短轮询**（HTTP setInterval） | 客户端定时主动问 | 等于轮询间隔（如 5 秒）| **每次都建 TCP + HTTP 握手 + JWT/cookie 校验**，N 个用户每 5 秒一次 | ★ 最简单 | 凑合可用，体验差 |
| **长轮询**（HTTP hold） | 客户端发请求，服务器挂起到有数据再返回 | 接近实时 | 每条消息一次完整 HTTP 来回 | ★★ | 协议麻烦，不如 SSE |
| **SSE**（Server-Sent Events） | **一次握手，长连接，服务器单向推** | < 1 秒（推送即到）| 一个 TCP 连接保持，数据走文本流 | ★★ 浏览器原生支持 `EventSource` | ✅ 本项目主选 |
| **WebSocket** | 全双工长连接 | < 1 秒 | 一个 TCP 连接 + 帧协议 | ★★★ 需要 ws:// 协议、心跳、二进制处理 | 杀鸡用牛刀（不需要客户端→服务器实时） |

### 1.2 用轮询会出现的实际问题

假设设 5 秒一次轮询：

```
0s   POST /api/tasks          → 创建
1s   ASR 在跑 (progress=20)   ← 用户看不到
2s   ASR 在跑 (progress=35)   ← 用户看不到
3s   ASR 在跑 (progress=50)   ← 用户看不到
4s   ASR 在跑 (progress=58)   ← 用户看不到
5s   GET /api/tasks/:id       → 用户终于看到 progress=58
...
58s  task 在 56s 就 done 了   ← 用户还以为在跑
60s  GET /api/tasks/:id       → 用户终于看到 done，clips 也一起拿到
```

问题：
1. **延迟最高 5 秒**，进度条一卡一卡跳。
2. **每次都是完整 HTTP**：建 TCP、TLS 握手、走中间件、查 DB、序列化整个 `TaskResponse`（包括所有 clips）。资源浪费。
3. **任务做完了用户还在等下一次轮询**才感知到，"完成提示"延迟。
4. 想要更实时？把轮询调到 1 秒？服务器请求量翻 5 倍，还可能撞中间件限流。

### 1.3 SSE 怎么解决这些痛点

| 痛点 | SSE 解法 |
| --- | --- |
| 延迟 | 后端 **至多每隔 ~1 秒**（sleep + 查询开销）读 DB 并 `yield`，浏览器 `onmessage` 收到新负载。**Pipeline 实际写的间隔可能比 1 秒更长**，但用户至多再等一秒就会在 SSE 里看到上次写入的值。**延迟通常 < 1 秒**（相对于上次 DB 更新而言） |
| 每次都完整 HTTP | **一次 HTTP 握手后保持 TCP 长连接**，后续消息只是普通文本帧 (`data: {...}\n\n`) |
| 序列化整个 TaskResponse 浪费 | **每次只推 3 个字段**：`{progress, message, status}`，几十字节 |
| 跨防火墙/代理 | SSE 走标准 HTTP，**不需要升级协议**（WebSocket 经常被企业代理拦截），Nginx 直接代理就能用 |

### 1.4 那为啥还保留轮询？

**因为 SSE 不是 100% 可靠**：
- 公司代理 / 杀毒软件 可能把长连接掐了
- 手机切到后台、网络切换、CDN 超时
- HTTP/1.1 的连接数限制（同源 6 个并发）

`TaskDetailPage.tsx` 的策略：

```text
进入详情页
   │
   ├─ 优先 new EventSource(...)          (SSE)
   │     ├─ onopen   → 停掉轮询定时器
   │     ├─ onmessage → 更新 task 状态
   │     └─ onerror  → 关闭 SSE，启动 startPolling()
   │
   └─ 轮询兜底: setInterval(5000ms, getTask(taskId))
```

`frontend/src/pages/TaskDetailPage.tsx` 第 174-188 行：

```174:188:frontend/src/pages/TaskDetailPage.tsx
    // 轮询兜底：SSE 断开时每 5 秒拉一次状态
    const startPolling = () => {
      if (pollingTimer) return;
      pollingTimer = setInterval(async () => {
        try {
          const data = await getTask(taskId);
          setTask(data);
          if (['done', 'failed'].includes(data.status)) {
            sendCompletionNotification(data.video_filename, data.status);
            stopPolling();
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 5000);
    };
```

**SSE 主、轮询备**，双保险。

### 1.5 一句话总结

> 任务最长跑几分钟，进度想做"丝滑流动"的效果，又不想每秒钟建一次 HTTP；同时不需要客户端往服务器推任何数据。这就是 **SSE 的天然战场**。轮询能用但体验差，WebSocket 又过于重，SSE 是最贴合的工具。

---

## 问题 2：SSE 的数据推送内容是什么？来几段展示一下

### 2.1 协议层长这样（原始 HTTP 响应）

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

data: {"progress": 0, "message": "正在排队处理...", "status": "downloading"}

data: {"progress": 10, "message": "音频已就绪 (28.5 MB)，跳过视频处理", "status": "transcribing"}

data: {"progress": 15, "message": "正在转录语音...", "status": "transcribing"}

data: {"progress": 35, "message": "Groq 转录中 (chunk 1/2)", "status": "transcribing"}

data: {"progress": 60, "message": "转录完成，共 421 段", "status": "transcribing"}

data: {"progress": 65, "message": "DeepSeek 分析中 (batch 1/3)...", "status": "analyzing"}

data: {"progress": 75, "message": "DeepSeek 分析中 (batch 3/3)...", "status": "analyzing"}

data: {"progress": 80, "message": "切片对齐去重中...", "status": "uploading"}

data: {"progress": 95, "message": "写入数据库...", "status": "uploading"}

data: {"progress": 100, "message": "分析完成！找到 12 个精彩片段时间点", "status": "done"}
```

> SSE 协议规则：每条消息以 `data: ` 开头，**两个换行 `\n\n` 结束**。浏览器原生 `EventSource` 自动按 `\n\n` 切分。

### 2.2 后端生成代码

`backend/app/api/tasks.py` 第 162-181 行：

```162:181:backend/app/api/tasks.py
    async def event_stream():
        while True:
            async with async_session() as db:
                result = await db.execute(select(Task).where(Task.id == task_id))
                task = result.scalar_one_or_none()

                if task:
                    event = {
                        "progress": task.progress,
                        "message": task.progress_message or "",
                        "status": task.status.value
                        if hasattr(task.status, "value")
                        else task.status,
                    }
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

                    # 任务完成或失败时结束 SSE
                    if event["status"] in ("done", "failed"):
                        break

            await asyncio.sleep(1)
```

只推 **3 个字段**：

| 字段 | 类型 | 来源 | 用途 |
| --- | --- | --- | --- |
| `progress` | int 0-100 | `tasks.progress` | 进度条宽度 |
| `message` | string | `tasks.progress_message` | UI 显示"正在转录..." 等人话提示 |
| `status` | string | `tasks.status` | 决定 UI 阶段标签 / 是否关闭 SSE / 是否发完成通知 |

### 2.3 前端 `onmessage` 拿到啥

`frontend/src/pages/TaskDetailPage.tsx` 第 205-238 行：

```205:238:frontend/src/pages/TaskDetailPage.tsx
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.started_at && data.started_at > 0) {
          setStartedAt(data.started_at);
        }
        setTask(prev => {
          if (!prev) return prev;
          
          const updated = {
            ...prev,
            progress: data.progress,
            progress_message: data.message,
            status: data.status,
          };

          if (data.status === 'done' && prev.status !== 'done') {
            getTask(taskId).then(completedData => setTask(completedData));
            sendCompletionNotification(prev.video_filename, 'done');
          }
          if (data.status === 'failed' && prev.status !== 'failed') {
            sendCompletionNotification(prev.video_filename, 'failed');
          }

          return updated;
        });

        if (data.status === 'done' || data.status === 'failed') {
          eventSource.close();
        }
      } catch (err) {
        console.error('SSE Error:', err);
      }
    };
```

**核心动作**：用推送的 3 个字段去 patch 现有的 `task` state（保留 `clips`、`video_filename` 等其它字段不变）。这就是 SSE "增量推送" 的体现。

### 2.4 不会推什么（容易误解）

| 字段 | 为啥不推 |
| --- | --- |
| `clips[]` | 数据量大（含 summary / suggested_caption / viral_titles），且只在 `done` 时一次性有意义。每秒推一个空数组浪费 |
| `transcript_json` | 几百 KB，没必要给前端 |
| `error_message` | 失败时通过 `status='failed'` 触发前端 refetch 详情拿 |
| `created_at / updated_at` | 不变化，没必要重复推 |
| `video_filename / scene_mode` | 不变化 |

> 设计原则：**只推"高频变化、低带宽、UI 直接消费"的字段**。其它全部在 `done` 后让前端 refetch 详情拿。

---

## 问题 3：后台是写了一个定时器，每秒查询一次 DB 然后通过 SSE 推送吗？

**几乎对，但更准确的说法是**：每个 SSE 连接是一个**独立的 async 协程**，在协程内部用 `while True` + `asyncio.sleep(1)` 实现"每秒查 DB 一次"。**不是全局定时器**。

### 3.1 关键区别：每个连接一个独立循环

```
一个用户打开详情页:
   GET /api/tasks/abc/progress
       │
       └─ FastAPI 启动一个 async 协程 event_stream()
              │
              ├─ while True:
              │     ├─ 查一次 DB (task abc)
              │     ├─ yield "data: {...}\n\n"
              │     ├─ if status in (done, failed): break
              │     └─ await asyncio.sleep(1)
              │
              └─ 协程结束 → 连接关闭

100 个用户打开 100 个不同任务的详情页:
   → 100 个独立协程，各自每秒查自己的 task
   → DB 每秒被查 100 次（每个连接 1 次）
```

### 3.2 后端代码（再贴一遍重点）

`backend/app/api/tasks.py` 第 158-191 行：

```158:191:backend/app/api/tasks.py
@router.get("/{task_id}/progress")
async def task_progress_sse(task_id: UUID):
    """SSE 实时进度推送：从数据库读取后台任务写入的进度。"""

    async def event_stream():
        while True:
            async with async_session() as db:
                result = await db.execute(select(Task).where(Task.id == task_id))
                task = result.scalar_one_or_none()

                if task:
                    event = {
                        "progress": task.progress,
                        "message": task.progress_message or "",
                        "status": task.status.value
                        if hasattr(task.status, "value")
                        else task.status,
                    }
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

                    if event["status"] in ("done", "failed"):
                        break

            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
```

逐行解读：

| 行为 | 含义 |
| --- | --- |
| `async def event_stream()` | 异步生成器，每 `yield` 一次 = 浏览器收到一条消息 |
| `while True` | 持续推送 |
| `async with async_session() as db` | **每次循环开一个新的 DB session**（避免连接长占） |
| `select(Task).where(...)` | 查这一个任务的最新状态 |
| `yield f"data: {...}\n\n"` | 按 SSE 协议格式拼一行，FastAPI `StreamingResponse` 把它写到 socket |
| `if status in (done, failed): break` | 终态退出循环 → 协程结束 → 连接自然关闭 |
| `await asyncio.sleep(1)` | 让出事件循环 1 秒，其它请求可以被处理 |
| `StreamingResponse(..., media_type="text/event-stream")` | FastAPI 的关键开关，告诉它**别等生成器跑完再返回，要边产边发** |

### 3.3 后台 Pipeline 是怎么"驱动"这个 SSE 的？

**关键认知：SSE 只读 DB，不直接和 Pipeline 通信。** Pipeline 和 SSE 之间通过 **PostgreSQL 这个"共享黑板"** 解耦。

```
┌──── Worker 进程内的后台协程 (task_runner) ────┐
│                                                │
│  for step in [downloading, transcribing, ...]: │
│      await update_task_progress(db, task, ...) │ ──► UPDATE tasks SET progress=..., status=...
│      ↑↑↑                                       │
│  这里改 DB                                      │
└────────────────────────────────────────────────┘
                  │
                  ▼
           ┌─────────────┐
           │ tasks 表    │  ← 共享黑板
           └─────────────┘
                  ▲
                  │
┌──── SSE 协程 event_stream() ──────────────────┐
│  while True:                                    │
│      task = SELECT * FROM tasks WHERE id=...   │
│      yield "data: ..."                          │
│      sleep(1)                                   │
└────────────────────────────────────────────────┘
```

`backend/app/services/task_progress.py`：

```1:18:backend/app/services/task_progress.py
async def update_task_progress(
    db,
    task,
    progress: int,
    message: str,
    status: str | None = None,
    *,
    persist: bool = True,
) -> None:
    """更新任务进度；PostgreSQL 是唯一状态源。"""
    task.progress = progress
    task.progress_message = message[:200]
    if status:
        task.status = status

    if persist:
        await db.commit()
```

Pipeline 每完成一步就调一次 `update_task_progress`（看 `backend/app/workers/pipeline.py`，比如 0% / 10% / 15% / 60% / 80% / 100% 都有），把进度落进 DB。SSE 协程下一次循环 SELECT 就能看到新值。

### 3.4 一个隐藏代价：DB 查询风暴

如果 100 个用户同时打开各自任务的详情页：
- 100 个 SSE 协程 × 每秒 1 次 SELECT = **每秒 100 次 DB 查询**
- 任务最长跑几分钟，平均一个用户连接 2 分钟 = **持续 12000 次/分钟 SELECT**

PostgreSQL 单点能撑这个量级（小查询），但如果未来上规模：

| 优化 | 效果 |
| --- | --- |
| 把 1 秒拉长到 2-3 秒 | DB 查询量直接除以 2-3 |
| 用 Redis pub/sub 替代 DB 轮询 | Worker 改 progress 时 `PUBLISH`，SSE 协程 `SUBSCRIBE`，**只在有变化时推**。零空查 |
| Worker 和 SSE 在同进程时用 `asyncio.Queue` | 内存队列，最快，但只在单进程部署时可用 |

当前项目"DB 当黑板"实现简单、调试方便，规模小完全够用。

### 3.5 为什么用 `asyncio.sleep` 而不是 `time.sleep`

```python
await asyncio.sleep(1)   # ✅ 协程让出 event loop，其它请求继续跑
time.sleep(1)             # ❌ 阻塞整个 event loop，FastAPI 这一秒停止响应所有请求
```

如果用 `time.sleep`，3 个用户同时订阅 SSE 就把整个后端卡死了。这是 async 编程的核心规则：**所有 IO/等待都必须 `await`**。

### 3.6 补充：是「每秒推一条 SSE」，还是「只有 progress 变了才推」？

**当前代码：每秒查 DB → 只要查到任务行存在且本条推送尚未触发退出条件，就 `yield`，不关心本条是否与上一条完全相同。**  
也就是说：**不是「状态变了才推」，而是「定时无条件推送当前快照」**（在未结束前提下）。

代码里没有类似「对比上一包的 `(progress, message, status)`，相等则跳过」的逻辑，`yield` 紧跟在组装完 `event` 字典之后：

```272:285:backend/app/api/tasks.py
                if task:
                    event = {
                        "progress": task.progress,
                        "message": task.progress_message or "",
                        "status": task.status.value
                        if hasattr(task.status, "value")
                        else task.status,
                    }
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

                    if event["status"] in ("done", "failed"):
                        break

            await asyncio.sleep(1)
```

示意（数值在同一秒内多次被 Worker 改掉也只会在下一轮 SELECT 里「最后一次写入」为准，中间细节 SSE 不一定逐个对齐）：

```text
T=0   查 DB → progress=15  → yield 一条  ✅
T=1   查 DB → progress=15  → yield 一条  ⚠️（DB 没变也会推）
T=2   查 DB → progress=15  → yield 一条  ⚠️
T=3   查 DB → progress=20  → yield 一条  ✅
...
```

#### 两种模型对比

| 维度 | 当前实现：定时无条件推快照 | 若改成「变化才推」（diff） |
| --- | --- | --- |
| 后端复杂度 | 简单，无状态 | 需维护 `last_event`（内存），还要多分支逻辑 |
| 客户端带宽 | 几十字节 × 连接持续时间秒数，单机小规模可忽略 | 只在 Worker `UPDATE` 时推，条数更少 |
| 「心跳」 | **顺带充当心跳**：代理/CDN 不易判空闲掐连接 | 若十几秒 DB 不变且无推送，可能被中间层误判断开，需另发注释心跳帧 |
| 前端负担 | 每秒一次 `onmessage`，payload 相同仍会触发逻辑（可自行 memo） | 仅真有变化时更新 |

本项目在未上万并发、单次任务几分钟量级的前提下，**「每秒无脑推」是可接受的工程权衡**：实现最短 + 自带连接保活。若在极高并发或单次任务极长的场景要减 DB QPS，可再叠加「仅当 event≠last_event，或超过 N 秒强制 heartbeat」这类优化（见上文 3.4）。

---

## 问题 4："SSE 只推 progress/message/status，要等 done 后再拿 clips" 是啥意思？任务都完成了，中间进度怎么展示？

这个问题问到了一个容易混淆的点。**进度和切片数据是两件事**：
- **进度（progress / message / status）**：高频变化、小数据 → **SSE 实时推**
- **切片数据（clips 数组）**：只在任务完成那一刻才有意义、数据量大 → **完成后一次性拿**

### 4.1 时间轴还原

```
时间   后端 DB 状态                          SSE 推送                    前端显示
────  ──────────────────                  ──────────────             ──────────
T=0   首屏 GET /api/tasks/:id             ─                          进度条 0%
       status=pending, clips=[]                                       "等待处理"
                                                                      切片区域: (空)

T=1   ─                                   {0,"排队中","downloading"}  进度条 0%
T=2   pipeline 启动                       {10,"音频已就绪",
                                            "transcribing"}            进度条 10%
T=3   ─                                   {15,"正在转录","transcribing"} 进度条 15%
T=10  Groq 在跑                           {35,"转录中 1/2",          进度条 35%
                                            "transcribing"}             "正在转录..."
T=30  ─                                   {60,"转录完成",            进度条 60%
                                            "transcribing"}
T=40  DeepSeek 在跑                       {70,"分析中","analyzing"}  进度条 70%
T=55  写库                                {95,"写入数据库",          进度条 95%
                                            "uploading"}
T=58  ★ DB 写完 clips ★                   {100,"完成","done"}        进度条 100%
       status=done                                                     ↓
       clips=[12 行] ←─── 数据库里 ─────                              ★ 前端检测到 done ★
                                                                      ↓
T=58.1 ─                                  (SSE 关闭)                   触发 getTask(id) refetch
T=58.5 GET /api/tasks/:id ──────────►                                  拿到 clips=[12 行]
       (含 clips 数组)                                                  ↓
                                                                      切片卡片渲染出来！

T=59  (SSE 断开后用户继续看页面)          ─                          静止显示完成状态
```

**关键时刻是 T=58 → T=58.5 这半秒**。

### 4.2 "done 不是任务完成了吗，那中间进度咋展示？" —— 解开误解

误解出在把"完成"和"开始显示进度"混了。**正确的因果**是：

```
中间所有的进度条 0% → 100%，全是 SSE 在实时推 "progress/message/status" 撑起来的
                       ↑
                       前端用这三个字段更新 task.progress / task.progress_message / task.status
                       UI 进度条直接读 task.progress 渲染

到了 progress=100, status=done 那一刻：
       ↑
       SSE 这条消息把 status 设为 done
       前端用它更新 task.status = 'done'
       ★ 这时进度条已经是 100%、"完成"提示已经显示出来了 ★
       
       但是 task.clips 此时还是 [] (从首屏 GET 来的)
       为了显示 12 个切片卡片，必须再 GET 一次 /api/tasks/:id
```

`TaskDetailPage.tsx` 第 221-224 行就是这个动作：

```221:224:frontend/src/pages/TaskDetailPage.tsx
          if (data.status === 'done' && prev.status !== 'done') {
            getTask(taskId).then(completedData => setTask(completedData));
            sendCompletionNotification(prev.video_filename, 'done');
          }
```

逐行解读：
- `data.status === 'done'`：SSE 这条消息显示任务完成了
- `prev.status !== 'done'`：上一次的 task.status 还不是 done（防止重复触发）
- `getTask(taskId)`：**再发一次 GET，拿一份带 clips 的完整 task**
- `setTask(completedData)`：用新数据替换整个 task，切片卡片就渲染出来了

### 4.3 那为啥 SSE 不直接推 clips？

技术上可以，但**设计上不划算**：

| 推 clips 的话 | 不推 clips 的话（当前设计） |
| --- | --- |
| 每秒推一次，前 99% 时间里 clips 都是空数组 → 浪费带宽 | 只在最后那一次需要 → 单独走 GET |
| 切片完成时一次性推 12 行 × 含 summary/caption/各种字段 ≈ 几 KB | SSE 只推 3 字段（几十字节） |
| SSE 协议是文本流，大 JSON 推送容易触发"已断开"等代理问题 | SSE 永远小数据，稳定 |
| 必须把切片数据再序列化一遍（DB 已经能查到了） | refetch 直接复用 `GET /api/tasks/:id` 接口，零重复代码 |

设计哲学：**SSE 当"通知频道"，REST 当"取数据频道"**。SSE 说"嘿，有变化了！"，前端听到后用 REST 去取新数据。这是大量实时系统的标准范式（Linear、Notion、Slack 都是这套）。

### 4.4 那进度条会不会"卡在 100%"等 clips？

不会，体验是这样的：

```
T=58.0   SSE 推 status=done → 进度条直接动画到 100% + 显示"完成"
         同时前端立刻 fire-and-forget 调 getTask(taskId)
         切片区域显示骨架屏 / Loading...

T=58.3   getTask 返回 → 切片卡片淡入 (clips=[12行])
```

整个过程对用户来说是"进度条一冲到底 → 切片卡片紧接着出现"，体感是**连贯的、瞬间的**。

### 4.5 如果 done 那一瞬间 refetch 失败了怎么办？

`TaskDetailPage.tsx` 第 222 行只是 `getTask(taskId).then(...)` 没接 `.catch`，万一失败：
- 切片卡片不会出现
- 但 SSE 已经关了 → `onerror` 不会再触发
- 进度条停留在 100% + 显示完成

**兜底**：用户刷新页面 → 触发首屏的 `getTask(taskId)` → 拿到完整 clips。

> 这里其实是个小 bug，更稳妥的写法是 `.catch(() => startPolling())` 让轮询接管，但终态后再轮询也只是浪费几次请求。

---

## 一句话回顾阶段 D

> **SSE 是"通知频道"**：浏览器一次握手，后端开个协程**每秒查一次 DB**，在未结束时 **无条件 `yield` 当前 `tasks.progress / progress_message / status` 快照**（哪怕与上一秒相同），前端拿这 3 个字段去 patch 已有的 task state，进度条因此能持续刷新。**任务完成那一刻**，SSE 推送的最后一条消息把 `status` 设为 `done`，前端检测到这个"完成信号"立刻额外 `GET /api/tasks/:id` 拿一份带 `clips` 的完整数据，切片卡片接着渲染出来。SSE 和 Pipeline 之间用 **PostgreSQL 当共享黑板**解耦，Pipeline 改进度只管写 DB，SSE 协程只管读 DB，互不感知。这套组合 = 实时性 + 简单性 + 双保险（断开自动降级轮询）。
