# 📂 素材管理系统架构

> 素材管理是 AiWxChat 销售知识库的核心模块之一，负责课程文档、成交喜报、聊天截图等销售素材的全生命周期管理，并通过 RAG 知识库导出与客服系统打通。

## 一、系统总览

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              React Frontend (MaterialView)                      │
│                                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────────────┐ │
│  │ 文件上传  │ │ 文件夹   │ │ 标签管理  │ │ 笔刷打码   │ │ RAG 知识库导出        │ │
│  │ (拖拽/选择)│ │ 树形管理  │ │ 搜索筛选  │ │ Canvas编辑 │ │ 预览/下载/上传TOS    │ │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬──────┘ └──────────┬───────────┘ │
└───────┼────────────┼────────────┼──────────────┼───────────────────┼─────────────┘
        │            │            │              │                   │
        │ REST API (JWT Auth)     │              │                   │
        ▼            ▼            ▼              ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         FastAPI Backend (materials.py)                           │
│                                                                                 │
│  ┌─── 上传链路 ───┐  ┌─── 素材管理 ───┐  ┌─── 打码链路 ───┐  ┌── RAG 导出 ──┐  │
│  │ proxy_upload   │  │ CRUD / Tags   │  │ manual_mask   │  │ export/rag   │  │
│  │ presigned_url  │  │ folders       │  │ AI mask       │  │ export/      │  │
│  │ record_upload  │  │ batch_tag     │  │ mask_service  │  │  knowledge   │  │
│  └───────┬────────┘  └───────┬───────┘  └───────┬───────┘  └──────┬───────┘  │
└──────────┼───────────────────┼───────────────────┼─────────────────┼──────────┘
           │                   │                   │                 │
     ┌─────▼─────┐       ┌────▼─────┐       ┌─────▼──────┐   ┌─────▼──────────┐
     │ TOS 对象   │       │PostgreSQL│       │ RapidOCR + │   │ TOS + 客服系统  │
     │ 存储服务   │       │ materials│       │ OpenCV     │   │ (火山知识库)    │
     │ (tos_svc) │       │ 数据表    │       │ Pillow     │   │ CSV 直接导入    │
     └───────────┘       └──────────┘       └────────────┘   └────────────────┘
```

## 二、数据模型

### Material 表

```python
class Material(Base):
    __tablename__ = "materials"

    id              = Column(Integer, PK)
    filename        = Column(String(200))        # 原始文件名
    stored_name     = Column(String(200))        # UUID 存储名
    file_size       = Column(BigInteger)         # 文件大小 (bytes)
    file_type       = Column(String(100))        # MIME 类型 / "folder"
    category        = Column(String(50))         # 分类: course / report / brand / masked
    title           = Column(String(200))        # 素材标题
    description     = Column(Text)               # 描述
    remark          = Column(String(500))        # 备注（RAG 导出时作为图片描述）
    tags            = Column(JSONB)              # 标签列表 ["北京", "10k", "本科"]
    uploaded_by     = Column(String(100))        # 上传者
    download_count  = Column(Integer)            # 下载计数
    oss_key         = Column(String(500))        # TOS 对象 Key
    source_material_id = Column(Integer)         # 打码图→原图关联
    is_pre_masked   = Column(Boolean)            # 上传时已预打码
    folder_id       = Column(Integer)            # 所属文件夹 (NULL=根目录)
    created_at      = Column(DateTime)
```

> **设计要点**：文件夹也是 Material 记录（`file_type="folder"`），通过 `folder_id` 形成树形结构，复用同一张表简化查询。

### 素材分类体系

| category | 说明 | 典型内容 |
|----------|------|----------|
| `course` | 课程文档 | PDF、PPT、课程大纲 |
| `report` | 成交喜报 | offer 截图、薪资证明 |
| `brand` | 聊天素材 | 学员群截图、好评反馈 |
| `masked` | 打码版本 | 自动/手动打码后的图片 |

## 三、TOS 上传架构（核心链路）

### 3.1 上传流程

系统支持两种上传模式，当前**生产环境使用代理上传**（绕过 CORS）：

```
方式一：代理上传（推荐，当前使用）
═══════════════════════════════════════════════════════════

  浏览器                    FastAPI                       TOS
    │                         │                            │
    │  POST /upload/proxy     │                            │
    │  (multipart/form-data)  │                            │
    │ ──────────────────────> │                            │
    │                         │  put_object(oss_key, data) │
    │                         │ ─────────────────────────> │
    │                         │          200 OK            │
    │                         │ <───────────────────────── │
    │                         │                            │
    │                         │  INSERT INTO materials     │
    │                         │  (oss_key, metadata...)    │
    │                         │                            │
    │    MaterialResponse     │                            │
    │ <────────────────────── │                            │


方式二：预签名直传（备选，需 CORS 配置）
═══════════════════════════════════════════════════════════

  浏览器                    FastAPI                       TOS
    │                         │                            │
    │  GET /presigned-url     │                            │
    │ ──────────────────────> │                            │
    │  { upload_url, key }    │                            │
    │ <────────────────────── │                            │
    │                         │                            │
    │  PUT upload_url (直传)   │                            │
    │ ────────────────────────┼──────────────────────────> │
    │          200 OK         │                            │
    │ <───────────────────────┼────────────────────────── │
    │                         │                            │
    │  POST /upload (元数据)   │                            │
    │ ──────────────────────> │                            │
    │    MaterialResponse     │                            │
    │ <────────────────────── │                            │
```

### 3.2 TOS 存储结构

```
TOS Bucket
├── materials/
│   ├── course/              # 课程文档
│   │   ├── {uuid}.pdf
│   │   └── {uuid}.pptx
│   ├── report/              # 成交喜报
│   │   ├── {uuid}.png
│   │   └── {uuid}.jpg
│   ├── brand/               # 聊天素材（原图）
│   │   └── {uuid}.png
│   └── masked/              # 打码版本
│       └── {uuid}.png
│
└── rag-export/              # RAG 导出 CSV
    ├── dev/                 # 开发环境
    │   ├── rag_materials_report.csv
    │   ├── rag_materials_report_volcano.csv
    │   └── rag_structured_knowledge.csv
    └── prod/                # 生产环境
        └── ...
```

### 3.3 TOS 服务封装

`tos_service.py` 提供统一的存储操作接口：

| 方法 | 说明 | 使用场景 |
|------|------|----------|
| `upload_object()` | SDK 直接上传 | 代理上传、打码图上传、RAG CSV 上传 |
| `download_object()` | 下载文件字节流 | 打码前下载原图、图片代理下载 |
| `generate_presigned_upload_url()` | 预签名 PUT URL | 前端直传（备选） |
| `generate_presigned_download_url()` | 预签名 GET URL | 预览、下载 |
| `delete_object()` | 删除对象 | 素材删除、文件夹级联删除 |
| `check_tos_configured()` | 配置检测 | 所有 TOS 操作前的前置检查 |

## 四、打码系统

### 4.1 双模式打码

```
┌─────────────── 打码系统 ───────────────────────────────────────┐
│                                                                │
│  模式一：AI 自动打码                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────┐              │
│  │ 下载原图  │───>│ RapidOCR     │───>│ 高斯模糊  │──> 上传TOS  │
│  │ (TOS)    │    │ + OpenCV     │    │ (Pillow) │    + 新记录  │
│  └──────────┘    │ 头像+昵称检测  │    └──────────┘              │
│                  └──────────────┘                               │
│                                                                │
│  模式二：手动笔刷打码（推荐）                                      │
│  ┌──────────┐    ┌──────────────┐    ┌──────────┐              │
│  │ Canvas   │───>│ 生成 Mask    │───>│ 后端合成  │──> 上传TOS  │
│  │ 笔刷绘制  │    │ (B/W PNG)    │    │ 马赛克+   │    + 新记录  │
│  │ 实时预览  │    │ 白色=模糊区域  │    │ 高斯模糊  │              │
│  └──────────┘    └──────────────┘    └──────────┘              │
│                                                                │
│  原图 ←──── source_material_id ────→ 打码图                     │
│  (category=brand)                    (category=masked)          │
└────────────────────────────────────────────────────────────────┘
```

### 4.2 打码图关联

打码图通过 `source_material_id` 关联到原图，支持多版本（取 `id` 最大的为最新版本）。RAG 导出时自动使用打码版本的图片 URL。

## 五、客服系统打通（RAG 知识库导出）

> **核心价值**：将素材库中的喜报、聊天截图等图片素材，结合标签元数据，自动生成结构化 CSV 知识库，直接导入客服系统（火山引擎知识库）实现 RAG 检索。

### 5.1 整体数据流

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     素材库 → 客服系统 数据流                               │
│                                                                          │
│  ① 素材准备                                                               │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                            │
│  │ 上传图片  │───>│ 打标签   │───>│ 笔刷打码  │                            │
│  │ (喜报等)  │    │ (城市/   │    │ (隐私保护) │                            │
│  │          │    │  学历/   │    │          │                            │
│  │          │    │  薪资)   │    │          │                            │
│  └──────────┘    └──────────┘    └──────────┘                            │
│       │               │               │                                  │
│       ▼               ▼               ▼                                  │
│  ② 智能导出                                                               │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │                    RAG Export Engine                              │    │
│  │                                                                  │    │
│  │  标签分类引擎              问题模板引擎              CSV 生成器     │    │
│  │  ┌────────────┐          ┌──────────────┐         ┌──────────┐  │    │
│  │  │ _TAG_CATEGORY│         │ 城市/学历/   │         │ 结构化   │  │    │
│  │  │ city/edu/   │────────>│ 薪资/背景    │────────>│ 元数据   │  │    │
│  │  │ salary/bg.. │         │ 多变体生成    │         │ CSV 输出 │  │    │
│  │  └────────────┘          └──────────────┘         └────┬─────┘  │    │
│  │                                                        │        │    │
│  │  brand 类自动使用打码图 URL（masked_map 映射）             │        │    │
│  └────────────────────────────────────────────────────────┼────────┘    │
│       │                                                   │             │
│       ▼                                                   ▼             │
│  ③ 双通道输出                                                            │
│  ┌────────────────┐                    ┌─────────────────────────────┐  │
│  │ TOS 自动上传    │                    │ CSV 文件下载                  │  │
│  │ rag-export/    │                    │ (浏览器直接下载)               │  │
│  │ {env}/xxx.csv  │                    │                             │  │
│  └───────┬────────┘                    └─────────────────────────────┘  │
│          │                                                              │
│          ▼                                                              │
│  ④ 客服系统接入                                                           │
│  ┌────────────────────────────────────────────────────────────────┐     │
│  │                    火山引擎智能客服 / RAG 知识库                  │     │
│  │                                                                │     │
│  │  导入 CSV  ──>  向量化索引  ──>  客户提问  ──>  图文混排回答     │     │
│  │                                                                │     │
│  │  "北京有学员拿到offer吗"  →  匹配标签  →  返回喜报图片+描述     │     │
│  └────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 CSV 导出格式

#### 方案 A：火山兼容格式（`volcano_compat=true`）

每个问题变体展开为独立行，适合火山引擎知识库直接导入：

| question | answer |
|----------|--------|
| 北京有学员拿到offer吗 | 有的，以下是北京相关的学员案例：\n- 学员A: https://... |
| 北京AI岗位能找到工作吗 | *(同上)* |

#### 方案 C：结构化元数据格式（默认）

一条素材一行，携带完整元数据维度：

| 字段 | 说明 | 示例 |
|------|------|------|
| `question` | 主问题 | 北京有学员拿到offer吗 |
| `answer` | 自然语言回答（含图片URL） | 有的，以下是... |
| `type` | 内容类型 | case_study |
| `education` | 学历维度 | 本科 |
| `region` | 地区维度 | 华东 |
| `city` | 城市维度 | 北京 |
| `background` | 转行背景 | 前端 |
| `salary` | 薪资维度 | 15-20k |
| `image_urls` | 图片URL列表（竖线分隔） | https://...\|https://... |
| `tags` | 所有标签（逗号分隔） | 北京,本科,15k |
| `variants` | 问题变体（竖线分隔） | 北京AI岗...\|北京有人学完... |

### 5.3 标签分类与问题生成

```
标签输入                    分类引擎                     问题模板

"北京"    ───> city    ───> "{tag}有学员成功拿到offer的案例吗"
                            "{tag}AI岗位能找到工作吗"
                            "{tag}有人学完找到工作了吗"

"本科"    ───> edu     ───> "{tag}学历可以学AI吗"
                            "{tag}有成功转行AI的案例吗"

"前端"    ───> bg      ───> "{tag}转AI有成功案例吗"
                            "{tag}能学会AI吗"

"华东"    ───> region  ───> "{tag}地区有学员成功的案例吗"
                            + 自动展开为城市级变体：
                              "上海有学员拿到offer吗"
                              "杭州有学员拿到offer吗"
                              "南京有学员拿到offer吗"

"学员群交流" ─> chat_community ─> "学员群氛围怎么样"
                                  "报名后有学员群吗"
```

### 5.4 结构化知识导出

除了素材图片 RAG，系统还支持手写 Q&A 知识库导出（`/export/knowledge`），数据来源于 `scripts/build_dual_rag.py` 中维护的 `KNOWLEDGE_BASE` 结构：

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ build_dual_  │     │ /export/     │     │ TOS 上传     │
│ rag.py       │────>│ knowledge    │────>│ + CSV 下载   │
│ KNOWLEDGE_   │     │ API          │     │              │
│ BASE 数据    │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

## 六、API 接口一览

### 上传与存储

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/materials/status` | TOS 配置状态检查 |
| `GET` | `/api/materials/upload/presigned-url` | 获取预签名上传 URL |
| `POST` | `/api/materials/upload` | 记录上传完成的元数据 |
| `POST` | `/api/materials/upload/proxy` | **代理上传**（前端→后端→TOS） |

### 素材管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/materials/list` | 素材列表（分页/分类/标签/文件夹） |
| `GET` | `/api/materials/{id}` | 素材详情 |
| `PUT` | `/api/materials/{id}` | 更新素材信息 |
| `DELETE` | `/api/materials/{id}` | 删除素材（TOS + DB） |
| `GET` | `/api/materials/{id}/preview` | 预签名预览 URL |
| `GET` | `/api/materials/{id}/download` | 预签名下载 URL |
| `GET` | `/api/materials/{id}/image` | 代理下载图片字节流 |

### 标签系统

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/materials/tags` | 所有标签及计数 |
| `POST` | `/api/materials/batch-tag` | 批量添加/移除标签 |

### 打码

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/materials/{id}/mask` | AI 自动打码 |
| `POST` | `/api/materials/{id}/mask/manual` | 手动笔刷打码 |
| `POST` | `/api/materials/batch/mark-pre-masked` | 批量标记已预打码 |

### 文件夹

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/materials/folders/list` | 文件夹列表 |
| `POST` | `/api/materials/folder` | 创建文件夹 |
| `PUT` | `/api/materials/folder/{id}` | 重命名 |
| `DELETE` | `/api/materials/folder/{id}` | 删除（级联删除内容） |

### RAG 导出（打通客服系统）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/materials/export/rag` | 素材→RAG CSV（自动上传 TOS） |
| `GET` | `/api/materials/export/rag/preview` | 导出预览统计 |
| `GET` | `/api/materials/export/knowledge` | 结构化知识→CSV |
| `GET` | `/api/materials/stats/summary` | 素材库统计信息 |

## 七、前端组件架构

```
MaterialView.tsx (2300+ 行，核心组件)
├── 视图切换
│   ├── 课程文档视图 (course) ─── 卡片网格 + 文件夹树
│   ├── 成交喜报视图 (report) ─── 卡片网格 + 文件夹树
│   └── 聊天素材视图 (brand) ─── ChatMaterialView 瀑布流
│
├── 通用子组件
│   ├── ImageThumbnail ─── 异步加载 TOS 预签名缩略图
│   ├── TagEditor ─── 标签输入 + 自动补全 + 建议列表
│   ├── RemarkEditor ─── 行内编辑备注（RAG 导出描述）
│   └── ManualMaskEditor ─── Canvas 笔刷打码全屏编辑器
│
├── 交互功能
│   ├── 拖拽上传 / 点击上传
│   ├── 图片预览（全屏 Lightbox）
│   ├── 复制到剪贴板（代理下载→Canvas→Clipboard API）
│   ├── 文件夹创建/重命名/删除
│   └── RAG 导出预览 + 一键导出
│
└── 状态管理
    ├── useToast() ─── 操作反馈通知
    └── 本地 state ─── 列表/分页/搜索/标签筛选
```

## 八、环境配置

```bash
# ─── TOS 对象存储（必需） ───
TOS_ACCESS_KEY=your-access-key
TOS_SECRET_KEY=your-secret-key
TOS_ENDPOINT=https://tos-cn-beijing.volces.com
TOS_REGION=cn-beijing
TOS_BUCKET=your-bucket-name
TOS_PATH_PREFIX=                    # 路径前缀（区分 dev/prod）

# ─── 环境标识（影响 RAG 导出路径） ───
APP_ENV=prod                        # dev → rag-export/dev/  prod → rag-export/prod/
```

## 九、客服系统对接步骤

```
Step 1: 素材准备
  └── 上传喜报/聊天截图 → 打标签（城市/学历/薪资/背景）→ 笔刷打码

Step 2: RAG 导出
  └── 前端点击"导出 RAG 知识库"
      └── 选择 volcano_compat=true（火山兼容格式）
      └── CSV 自动上传到 TOS: rag-export/{env}/rag_materials_report_volcano.csv

Step 3: 客服系统导入
  └── 登录火山引擎智能客服平台
      └── 知识库管理 → 导入 → 选择 CSV
      └── 或直接配置 TOS 路径自动同步

Step 4: 验证
  └── 客户提问"北京有学员拿到offer吗"
      └── 客服系统 RAG 检索 → 匹配标签 → 返回喜报图片 + 描述
```
