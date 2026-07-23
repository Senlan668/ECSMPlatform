# 任务列表视频时长展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在历史任务列表卡片上显示原视频时长，帮助区分同名或相似命名的视频任务。

**Architecture:** 后端列表接口直接返回 `video_duration`，避免列表页额外请求详情。前端在任务卡片底部把创建时间与时长拼接展示，处理中任务则保留进度文案并在右下角补充时长。

**Tech Stack:** FastAPI, Pydantic, React, TypeScript, Node test runner

---

### Task 1: 前端时长格式化

**Files:**
- Create: `frontend/tests/taskTime.test.ts`
- Create: `frontend/src/utils/taskTime.ts`

- [ ] **Step 1: 写失败用例**
- [ ] **Step 2: 运行用例确认失败**
- [ ] **Step 3: 实现最小格式化函数**
- [ ] **Step 4: 运行用例确认通过**

### Task 2: 任务列表接口暴露视频时长

**Files:**
- Modify: `backend/app/models/schemas.py`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: 给 `TaskListItem` 增加 `video_duration`**
- [ ] **Step 2: 给前端列表接口类型增加 `video_duration`**

### Task 3: 任务卡片展示创建时间和时长

**Files:**
- Modify: `frontend/src/components/TaskCard.tsx`

- [ ] **Step 1: 接入时长格式化工具**
- [ ] **Step 2: 已完成/失败任务显示 `创建时间 · 时长`**
- [ ] **Step 3: 处理中任务右下角显示时长（如果已知）**

### Task 4: 验证

**Files:**
- Test: `frontend/tests/taskTime.test.ts`

- [ ] **Step 1: 运行 `node --test frontend/tests/taskTime.test.ts`**
- [ ] **Step 2: 运行 `npm run build`**
