# 阶段 E：后台 Worker 并发池 —— 大白话版

> 对应代码：
> - 主循环 & 协程池：`backend/app/services/task_runner.py::_task_runner_loop`
> - 抢任务（带锁）：`backend/app/services/task_runner.py::_claim_next_pending_task`
> - 排队位置查询：`backend/app/services/task_progress.py::get_queue_position`
> - SSE 推送排队位置：`backend/app/api/tasks.py::task_progress_sse`
> - 启动钩子：FastAPI 启动时调用 `start_task_runner()`
> - 流水线本体：`backend/app/workers/pipeline.py::run_video_pipeline`
> - 并发度配置：`settings.worker_concurrency`（环境变量 `WORKER_CONCURRENCY`，默认 5）

---

## 一句话总览

**整个后端进程里跑 5 个 Worker 协程（数量可配），它们一起从数据库里抢 pending 任务并行处理。**
就像便利店开了 5 个收银台，**柜台前排队的还是那一队人（`tasks` 表）**，但**同时能处理 5 个客户**。

抢同一行任务时会有"先到先得"的竞争？没问题——一把 `asyncio.Lock` 让大家排好队抢，**绝对不会两个收银台叫到同一个客户**。

> 设计原则：**数据库本身就是队列**，零新中间件（无 Redis / Celery）。

---

## 问题 1：Worker 主循环到底干啥？

### 1.1 程序启动那一刻发生了什么

FastAPI 进程启动 → 触发 `start_task_runner()`，它做三件事：

1. **打扫现场**：扫一遍数据库，把所有"上次还没跑完"的任务（`downloading / transcribing / analyzing / clipping / uploading` 这 5 个中间状态）**全部改回 `pending`**。
   - 为啥要做这步？因为上次进程可能是被强杀 / 崩溃的，那些"正在跑"的任务其实没人管了，再不重置就永远卡在中间状态。
2. **拉一把全局锁**：`_claim_lock = asyncio.Lock()`，专门用来保护"抢任务"那一步。
3. **拉起 N 个长跑协程**：根据 `WORKER_CONCURRENCY`（默认 5）创建 N 个 `_task_runner_loop`。
   - 每个协程都是平等的，没有主从关系，只有日志里编号区分（Worker #0 ~ #4）。

### 1.2 每个 Worker 协程在干啥

每个 worker 都是同一段死循环 `while not stop_event.is_set()`，**每一轮做下面这几件事**：

```
┌────────────────────────────────────────────────────────────────┐
│ 单个 Worker 协程每一轮（伪流程）                                  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ① 排队等抢任务锁（_claim_lock）                                 │
│         │                                                      │
│         ▼                                                      │
│  ② 问数据库："最早的 pending 任务给我"                           │
│         │                                                      │
│         ├── 没有 ──► 释放锁，睡 1 秒，回到 ①                    │
│         │                                                      │
│         └── 有 ──► 把它 status 改成 `downloading`，commit       │
│                   释放锁（其他 worker 立刻可以来抢下一个）       │
│                       │                                        │
│                       ▼                                        │
│                   ③ 调 run_video_pipeline(task_id)              │
│                       走完整条流水线（30 秒 ~ 几分钟）            │
│                       这段时间 **不持有锁，不阻塞其他 worker**    │
│                       │                                        │
│                       ├── 正常跑完 ──► pipeline 内部把状态写成   │
│                       │               `done`，本轮结束          │
│                       │                                        │
│                       └── 抛异常   ──► pipeline 内部把状态写成   │
│                                       `failed`，外面 except     │
│                                       打一条日志，本轮也结束    │
│                                                                │
│  ④ continue 回 ①                                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

**关键认知**：锁只在"抢任务"这 50 毫秒里持有，**真正干活的几十秒~几分钟完全不持有锁**。所以 5 个 worker 真的能并行跑 5 个 pipeline。

### 1.3 为啥需要 `asyncio.Lock`？

想象没锁的情况：

```
T=0.000  Worker #0 → SELECT pending LIMIT 1 → 拿到 task-A
T=0.001  Worker #1 → SELECT pending LIMIT 1 → 也拿到 task-A（!!! 还没改状态）
T=0.002  Worker #0 → UPDATE task-A SET status='downloading' → COMMIT
T=0.003  Worker #1 → UPDATE task-A SET status='downloading' → COMMIT（重复！）
T=0.004  两个 worker 同时跑 task-A，浪费资源 + 数据库切片表会重复写入
```

**用锁的情况**：

```
T=0.000  Worker #0 拿到锁
T=0.001  Worker #0 → SELECT → 拿到 task-A
T=0.001  Worker #1 想拿锁 → 在这里挂起等待
T=0.002  Worker #0 → UPDATE task-A → COMMIT → 释放锁
T=0.003  Worker #1 拿到锁
T=0.004  Worker #1 → SELECT → 拿到 task-B（task-A 已经不是 pending 了）
T=0.005  Worker #1 → UPDATE task-B → COMMIT → 释放锁
✅ 干净，每个 worker 各抢各的
```

> ⚠️ 一定要知道的限制：这把锁**只在同一个进程内有效**。
> 如果你以后用 `uvicorn --workers 4` 开多进程，4 个进程的锁互相不认识，又会回到上面那个竞态。
> 那时需要升级到 PostgreSQL 行锁 `SELECT ... FOR UPDATE SKIP LOCKED`。
> 目前单进程部署，`asyncio.Lock` 是最简洁安全的选择。

### 1.4 pipeline 干完一单要多久？

| Step | 占进度 | 干啥 | 资源 | 单任务耗时 |
| --- | --- | --- | --- | --- |
| 1 | 0→10 | 读本地视频 / 获取时长 | 磁盘 I/O | < 1s |
| 2 | 10→15 | FFmpeg 提取音频 | **CPU** | 5~30s |
| 3 | 15→60 | Groq ASR 转录 | **网络 I/O**（第三方）| **30s~3min（最慢）** |
| 4 | 60→80 | DeepSeek LLM 分析 | **网络 I/O**（第三方）| 10~30s |
| 5 | 80→90 | FFmpeg 批量切片 | **CPU** | 5~30s |
| 6 | 90→100 | 拷贝 + 写 DB | 磁盘 I/O | < 2s |

**80%+ 时间在等第三方 API**——也正是因为这个，5 个 worker 同时跑 95% 的时间都是"挂在网络响应上"，本机 CPU 完全扛得住。

---

## 问题 2：10 个用户同时点"创建任务"会咋样？

### 2.1 一句话答案

**前端立刻 10 个全部返回成功；后台 5 个 Worker 并行抢任务，前 5 个用户立刻开跑，后 5 个排队等任何一个 Worker 空出来。**

最差等待时间从串行的 **10 分钟降到 2 分钟**（按单任务 1 分钟估算）。

### 2.2 拆开看

#### 阶段 A：创建任务（API 这边——并发的）

跟以前完全一样：

```
T=0.0s   10 个用户同时点提交
T=0.1s   FastAPI 并发处理 10 个 POST → 10 行 INSERT 到 tasks 表
T=0.2s   10 个前端：全部跳转到详情页，开始 SSE 订阅进度
```

此时 `tasks` 表里 10 行 `status='pending'`，5 个 worker 这一刻在睡觉（上次扫完没活儿）。

#### 阶段 B：5 个 Worker 同时抢活儿

最多 1 秒后所有 worker 醒过来，**轮流**走 `_claim_lock`：

```
T≈1.0s   Worker #0 抢到 task-A（用户 1）→ 开始跑 pipeline
T≈1.001s Worker #1 抢到 task-B（用户 2）→ 开始跑 pipeline
T≈1.002s Worker #2 抢到 task-C（用户 3）→ 开始跑 pipeline
T≈1.003s Worker #3 抢到 task-D（用户 4）→ 开始跑 pipeline
T≈1.004s Worker #4 抢到 task-E（用户 5）→ 开始跑 pipeline
         ↑ 这一刻 5 个 pipeline 在同时跑，全在等 Groq ASR 响应

         task-F ~ task-J 5 个任务还在表里，status=pending
         它们的 SSE 推送会带 queue_position：
           task-F → queue_position=0（你是下一个）
           task-G → queue_position=1（前面还有 1 个）
           task-H → queue_position=2
           task-I → queue_position=3
           task-J → queue_position=4

T≈61s    Worker #0 跑完 task-A → 立刻 continue 回去抢
         → 抢到 task-F（已经是最早的 pending）→ 开跑

T≈62s    Worker #1 跑完 task-B → 抢到 task-G → 开跑
T≈63s    Worker #2 跑完 task-C → 抢到 task-H → 开跑
T≈64s    Worker #3 跑完 task-D → 抢到 task-I → 开跑
T≈65s    Worker #4 跑完 task-E → 抢到 task-J → 开跑

T≈125s   全部跑完
```

#### 用户视角时间线（并发度=5 vs 串行）

| 用户 | 串行（之前）| 并发 5（现在）|
| --- | --- | --- |
| 用户 1 | 0:00 ~ 1:00 ✅ | **0:00 ~ 1:00** ✅ |
| 用户 2 | 1:00 ~ 2:00 | **0:00 ~ 1:00** ✅ |
| 用户 3 | 2:00 ~ 3:00 | **0:00 ~ 1:00** ✅ |
| 用户 4 | 3:00 ~ 4:00 | **0:00 ~ 1:00** ✅ |
| 用户 5 | 4:00 ~ 5:00 | **0:00 ~ 1:00** ✅ |
| 用户 6 | 5:00 ~ 6:00 | 1:00 ~ 2:00 ✅ |
| 用户 7 | 6:00 ~ 7:00 | 1:00 ~ 2:00 ✅ |
| 用户 8 | 7:00 ~ 8:00 | 1:00 ~ 2:00 ✅ |
| 用户 9 | 8:00 ~ 9:00 | 1:00 ~ 2:00 ✅ |
| 用户 10 | 9:00 ~ 10:00 | 1:00 ~ 2:00 ✅ |
| **最差等待** | **10 分钟** | **2 分钟** ⚡ |

### 2.3 排队位置怎么知道的？

`SSE` 每秒推一条进度时，多查了一句 SQL：

```sql
SELECT COUNT(*) FROM tasks
WHERE status='pending'
  AND created_at < {本任务的 created_at}
```

这个值就是 `queue_position`——**前面比我早的、还没人接走的 pending 任务数**。

- `queue_position=0`：下一个 worker 空出来就轮到我
- `queue_position=3`：前面还有 3 个人排队
- `queue_position=null`：我已经在跑了/跑完了/失败了，不需要排队信息

前端拿到这个字段，就可以显示「**排队中（前面还有 3 个）**」之类的提示，体验明显比"正在排队处理..."要好。

### 2.4 为啥并发度选 5？

| 并发度 | 适合场景 | 风险 |
| --- | --- | --- |
| 3 | 保守起步、机器配置一般 | 高峰仍有排队 |
| **5（当前默认值）** | 10 用户日常使用 | 平衡的甜点 |
| 8 | 机器 8 核+、API 配额充足 | 注意 Groq/DeepSeek 速率限制 |
| 10+ | 用户量上来后 | 大概率撞第三方 API 限流 |

**调整方式**：改 `.env` 里的 `WORKER_CONCURRENCY` 然后重启进程，**零代码改动**。

---

## 易混淆的点（一图看清）

```
┌──────────────────────────────────────────────────────────────────┐
│  整个后端进程（单 uvicorn）                                         │
│                                                                  │
│  ┌──────────────────┐         ┌───────────────────────────────┐  │
│  │ FastAPI 协程池    │         │  Worker 协程池（5 个）          │  │
│  │ （处理 HTTP 请求） │         │  Worker #0 _task_runner_loop  │  │
│  │                  │         │  Worker #1 _task_runner_loop  │  │
│  │  10 个 POST 进来  │         │  Worker #2 _task_runner_loop  │  │
│  │  → 10 行 INSERT  │         │  Worker #3 _task_runner_loop  │  │
│  │  → 立刻返回 200   │         │  Worker #4 _task_runner_loop  │  │
│  └──────────┬───────┘         │      │                        │  │
│             │                 │      ▼                        │  │
│             │ 写              │   抢任务前 → asyncio.Lock      │  │
│             ▼                 │   抢到后 → 跑 pipeline（无锁）  │  │
│      ┌─────────────────────────────────────┐                     │
│      │           tasks 表 (PostgreSQL)      │                     │
│      │  status: pending / downloading /     │                     │
│      │   transcribing / ... / done / failed │                     │
│      └─────────────────────────────────────┘                     │
│             ▲                  ▲                                 │
│             │ 读               │ 改                              │
│             │                  │                                 │
│     ┌───────┴──────────┐       │                                 │
│     │  SSE 推送协程     │       │                                 │
│     │ （每个用户一个）   │       │                                 │
│     │ 每秒附带          │       │                                 │
│     │ queue_position    │       │                                 │
│     └──────────────────┘       │                                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| 容易问错的问题 | 正确答案 |
| --- | --- |
| Worker 是线程吗？ | 不是。是 N 个 `asyncio.Task`（协程），跑在 FastAPI 同一个事件循环里 |
| 有几个 Worker？ | **5 个**（看 `WORKER_CONCURRENCY`），同时在跑同时在抢 |
| 5 个 Worker 会抢到同一行任务吗？ | 不会。`asyncio.Lock` 保护抢任务那 50 毫秒，串行 select+update+commit |
| 跑 pipeline 时其他 worker 是不是要等？ | **不用**。锁早就释放了，5 个 pipeline 可以真的同时跑 |
| 多个用户上传会不会卡 API？ | 不会。上传走 FastAPI 协程池，跟 Worker 池完全独立 |
| 进程崩了正在跑的任务咋办？ | 下次启动 `_reset_interrupted_tasks` 把中间态全改回 `pending`，5 个 worker 再次接单 |
| 队列在哪？ | **就是 `tasks` 表本身**。没有 Redis / Celery / RabbitMQ |
| 用户能看到自己排第几吗？ | 能。SSE 推送里有 `queue_position` 字段 |

---

## 想再大幅升级该咋办？（延伸思考，不在当前实现里）

### 横向扩展到多进程（uvicorn --workers N）

当前实现：单进程内 5 个协程 ✅

如果将来想 `uvicorn --workers 4`（4 个进程 × 每进程 5 协程 = 20 并发）：

1. **抢任务的锁要升级**：`asyncio.Lock` 跨不了进程，必须改成 PostgreSQL 的行锁：
   ```python
   SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1
   ```
   `SKIP LOCKED` 让一个进程抢的时候，其他进程跳过这一行去抢下一行，性能比纯锁好。
2. **`_reset_interrupted_tasks` 要谨慎**：每个进程启动都会跑一遍，会把别的进程正在跑的任务也改回 pending。需要加进程 ID 标记，只重置"自己上次没跑完的"。
3. 别的不用改。

### 真的要 Celery / Redis 队列？

只有以下场景才值得：
- 跨多台机器分布式跑 worker
- 需要任务重试、死信、定时任务等丰富语义
- 需要专业监控（Flower 等）

对你"单机 10 用户"场景，**当前方案就是最优解**。不要过早优化。

---

## 配置速查

```env
# .env
WORKER_CONCURRENCY=5    # 同时跑的任务上限，建议 3~8
```

改完重启 uvicorn 进程即生效，不需要数据库迁移、不需要前端改动。
