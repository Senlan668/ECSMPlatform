# Gallery And Template Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让作品库列表下载缩略图，并让模板中心按当前标签延迟获取模板数据。

**Architecture:** 前端降低初次页面必须传输的数据量，后端仅增加一个离线可执行的历史缩略图补齐能力。现有生成、详情展示与模板 CRUD API 行为保持不变。

**Tech Stack:** Vue 3, Axios, FastAPI, SQLAlchemy async, unittest/Node test

---

### Task 1: 作品库网格使用缩略图

**Files:**
- Modify: `frontend/src/components/gallery/GalleryCard.vue`
- Test: `frontend/tests/galleryLoadingPerformance.test.mjs`

- [x] 写失败测试，要求列表图片使用 `thumbnail_url || image_url` 且带异步解码。
- [x] 运行 `node --test frontend/tests/galleryLoadingPerformance.test.mjs`，验证测试因现有原图绑定失败。
- [x] 改为缩略图优先，保留原图回退。
- [x] 重跑测试验证通过。

### Task 2: 模板中心按标签加载

**Files:**
- Modify: `frontend/src/TemplateCenterPage.vue`
- Modify: `frontend/src/components/template/TemplatePreview.vue`
- Test: `frontend/tests/galleryLoadingPerformance.test.mjs`

- [x] 写失败测试，要求初次使用 `scope: 'mine'`，标签切换触发 `scope: 'system'`，并缓存已加载标签。
- [x] 运行目标测试观察失败。
- [x] 用按 scope 的列表状态替换 `scope=all` 加载，并为模板图片增加懒加载/异步解码。
- [x] 重跑目标测试和所有前端测试。

### Task 3: 补齐历史作品缩略图

**Files:**
- Modify: `app/services/gallery_service.py`
- Create: `scripts/backfill_gallery_thumbnails.py`
- Test: `tests/test_gallery_service.py`

- [x] 写失败测试，证明缺少缩略图的历史记录会被更新，已有缩略图不会被改写。
- [x] 运行 `PYTHONPATH=. pytest tests/test_gallery_service.py -q` 观察失败。
- [x] 实现服务方法及可重复执行的服务器脚本。
- [x] 重跑后端目标测试。

### Task 4: 回归验证

**Files:**
- Verify only

- [x] 运行 `node --test frontend/tests/*.test.mjs`。
- [x] 运行 `npm run build` 于 `frontend/`。
- [x] 运行 `PYTHONPATH=. pytest tests/test_gallery_service.py tests/test_template_service.py -q`。
- [x] 汇总上线后执行缩略图补齐脚本的命令。
