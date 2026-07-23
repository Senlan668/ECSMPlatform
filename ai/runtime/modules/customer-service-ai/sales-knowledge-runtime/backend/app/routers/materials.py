# -*- coding: utf-8 -*-
"""
素材库 API
提供素材的 CRUD、OSS 预签名上传/下载、在线预览等功能
"""
from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File as FastAPIFile, Form
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import desc, func, or_
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import uuid

from app.models.database import get_db
from app.models.chat import Material
from app.models.student import Student
from app.config import get_settings
from app.services.student_reports import (
    bind_main_report_material,
    ensure_material_not_bound,
    get_material_bound_students,
    get_material_bound_students_map,
    get_student_or_404,
    serialize_material_response,
)
from app.models.student_report_binding import StudentReportBinding
from app.services.tos_service import (
    generate_presigned_upload_url,
    generate_presigned_download_url,
    delete_object,
    check_tos_configured,
    upload_object,
    download_object,
    tenant_object_key,
    is_current_tenant_object_key,
)

router = APIRouter(prefix="/api/materials", tags=["materials"])


# ==================== 请求/响应模型 ====================

class MaterialResponse(BaseModel):
    """素材响应"""
    id: int
    filename: str
    stored_name: str
    file_size: int
    file_type: str
    category: str
    title: Optional[str] = None
    description: Optional[str] = None
    remark: Optional[str] = None
    tags: list = []
    uploaded_by: str
    download_count: int
    oss_key: Optional[str] = None
    source_material_id: Optional[int] = None
    is_pre_masked: bool = False
    folder_id: Optional[int] = None
    bound_student_id: Optional[int] = None
    bound_student_name: Optional[str] = None
    bound_students: list = []
    created_at: datetime

    class Config:
        from_attributes = True


class MaterialListResponse(BaseModel):
    """素材列表响应"""
    items: List[MaterialResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class PresignedUrlResponse(BaseModel):
    """预签名 URL 响应"""
    upload_url: str
    object_key: str
    expires_in: int = 3600


class PreviewUrlResponse(BaseModel):
    """文件预览/下载 URL 响应"""
    url: str
    filename: str
    file_type: str
    expires_in: int = 3600


class MaterialCreateRequest(BaseModel):
    """记录上传完成的素材元数据"""
    filename: str
    stored_name: str
    file_size: int
    file_type: str
    category: str  # course / report
    title: Optional[str] = None
    description: Optional[str] = None
    tags: list = []
    uploaded_by: str = "admin"
    oss_key: str = ""
    folder_id: Optional[int] = None
    student_id: Optional[int] = None


class MaterialUpdateRequest(BaseModel):
    """更新素材信息"""
    filename: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    remark: Optional[str] = None
    tags: Optional[list] = None
    category: Optional[str] = None


class MaterialMoveRequest(BaseModel):
    """移动素材到指定文件夹"""
    folder_id: Optional[int] = None


class BatchTagRequest(BaseModel):
    """批量打标签请求"""
    material_ids: List[int]
    add_tags: List[str] = []
    remove_tags: List[str] = []


class TagItem(BaseModel):
    """标签项"""
    name: str
    count: int


class TosStatusResponse(BaseModel):
    """TOS 配置状态"""
    configured: bool
    message: str


# ==================== API 端点 ====================

@router.get("/debug/categories")
def debug_categories(db: DBSession = Depends(get_db)):
    """临时调试：查看各分类素材数量"""
    from sqlalchemy import func
    rows = db.query(Material.category, func.count(Material.id)).group_by(Material.category).all()
    result = {cat: cnt for cat, cnt in rows}

    # 查看 masked 素材详情
    masked_items = db.query(Material.id, Material.source_material_id, Material.oss_key).filter(
        Material.category == "masked"
    ).all()
    masked_detail = [{"id": m.id, "source_id": m.source_material_id, "has_oss": bool(m.oss_key)} for m in masked_items]

    return {"categories": result, "masked_detail": masked_detail, "total": sum(result.values())}

@router.post("/batch/mark-pre-masked")
def batch_mark_pre_masked(
    category: str = Query("brand", description="要标记的素材分类"),
    material_ids: Optional[List[int]] = None,
    value: bool = Query(True, description="true=标记为已预打码, false=取消标记"),
    db: DBSession = Depends(get_db),
):
    """
    批量标记素材为"已预打码"（上传时已经手动打码过的图片）。
    不传 material_ids 则标记该分类下所有图片素材。
    """
    query = db.query(Material).filter(
        Material.file_type.like("image/%"),
        Material.oss_key.isnot(None),
    )
    if material_ids:
        query = query.filter(Material.id.in_(material_ids))
    else:
        query = query.filter(Material.category == category)

    count = query.update({Material.is_pre_masked: value}, synchronize_session="fetch")
    db.commit()
    return {"message": f"已{'标记' if value else '取消标记'} {count} 个素材为预打码", "count": count}

@router.get("/status", response_model=TosStatusResponse)
def get_tos_status():
    """检查火山引擎 TOS 配置状态"""
    configured = check_tos_configured()
    return TosStatusResponse(
        configured=configured,
        message="TOS 已配置就绪" if configured else "TOS 未配置，请设置环境变量 TOS_ACCESS_KEY, TOS_SECRET_KEY, TOS_ENDPOINT, TOS_BUCKET"
    )


@router.get("/list", response_model=MaterialListResponse)
def list_materials(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    category: Optional[str] = Query(None, description="分类: course, report"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    tag: Optional[str] = Query(None, description="按标签筛选"),
    folder_id: Optional[int] = Query(None, description="文件夹 ID，不传则返回根目录"),
    all_folders: bool = Query(False, description="是否跨文件夹获取所有素材（首页用）"),
    unbound_only: bool = Query(False, description="仅返回未关联学员的喜报素材"),
    db: DBSession = Depends(get_db),
):
    """
    获取素材列表（分页、筛选、标签过滤）
    """
    from sqlalchemy import cast, String
    from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB

    query = db.query(Material)

    # 排除文件夹类型记录（文件夹通过专用接口管理）
    query = query.filter(Material.file_type != "folder")

    # 按标签过滤时全局搜索（跨文件夹）；否则按文件夹过滤
    if tag:
        query = query.filter(Material.tags.op('@>')(cast([tag], PG_JSONB)))
    elif all_folders:
        pass  # 首页模式：不限文件夹，跨目录展示所有素材
    elif folder_id is not None:
        query = query.filter(Material.folder_id == folder_id)
    else:
        query = query.filter(Material.folder_id.is_(None))

    # 按分类过滤
    if category:
        query = query.filter(Material.category == category)

    if unbound_only:
        query = query.outerjoin(
            StudentReportBinding, StudentReportBinding.material_id == Material.id
        ).filter(StudentReportBinding.id.is_(None))

    # 关键词搜索（搜索时不限制文件夹层级，同时搜索 tags 字段）
    if search:
        pattern = f"%{search}%"
        # 搜索时移除文件夹过滤，全局搜索
        query = db.query(Material).filter(Material.file_type != "folder")
        if category:
            query = query.filter(Material.category == category)
        if tag:
            query = query.filter(Material.tags.op('@>')(cast([tag], PG_JSONB)))
        if unbound_only:
            query = query.outerjoin(
                StudentReportBinding, StudentReportBinding.material_id == Material.id
            ).filter(StudentReportBinding.id.is_(None))
        # 搜索 filename / title / description 以及 tags（JSONB 转文本后模糊匹配）
        query = query.filter(
            or_(
                Material.filename.ilike(pattern),
                Material.title.ilike(pattern),
                Material.description.ilike(pattern),
                cast(Material.tags, String).ilike(pattern),
            )
        )

    total = query.count()
    items = (
        query.order_by(desc(Material.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    bound_students = get_material_bound_students_map(db, [item.id for item in items])

    return MaterialListResponse(
        items=[
            MaterialResponse.model_validate(serialize_material_response(item, bound_students.get(item.id)))
            for item in items
        ],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/upload/presigned-url", response_model=PresignedUrlResponse)
def get_presigned_upload_url(
    filename: str = Query(..., description="原始文件名"),
    content_type: str = Query("application/octet-stream", description="文件 MIME 类型"),
    category: str = Query("course", description="素材分类: course / report"),
):
    """
    获取预签名上传 URL，前端拿到后直传 OSS
    """
    if not check_tos_configured():
        raise HTTPException(
            status_code=503,
            detail="火山引擎 TOS 未配置，无法生成上传链接。请联系管理员配置 TOS 环境变量。",
        )

    # 生成唯一对象 key
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    unique_name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
    object_key = tenant_object_key(f"materials/{category}/{unique_name}")

    upload_url = generate_presigned_upload_url(
        object_key=object_key,
        content_type=content_type,
        expires=3600,
    )

    return PresignedUrlResponse(
        upload_url=upload_url,
        object_key=object_key,
        expires_in=3600,
    )


@router.post("/upload", response_model=MaterialResponse)
def record_upload(
    req: MaterialCreateRequest,
    db: DBSession = Depends(get_db),
):
    """
    前端直传 OSS 成功后，调用此接口记录素材元数据到数据库
    """
    if not is_current_tenant_object_key(req.oss_key):
        raise HTTPException(status_code=400, detail="对象存储 key 不属于当前租户")

    if req.student_id is not None:
        if req.category != "report":
            raise HTTPException(status_code=400, detail="只有喜报素材才能关联学员")
        get_student_or_404(db, req.student_id)

    if req.folder_id is not None:
        folder = db.query(Material).filter(Material.id == req.folder_id, Material.file_type == "folder").first()
        if not folder:
            raise HTTPException(status_code=404, detail="目标文件夹不存在")

    material = Material(
        filename=req.filename,
        stored_name=req.stored_name,
        file_size=req.file_size,
        file_type=req.file_type,
        category=req.category,
        title=req.title or req.filename.rsplit(".", 1)[0],
        description=req.description or "",
        tags=req.tags,
        uploaded_by=req.uploaded_by,
        download_count=0,
        oss_key=req.oss_key,
        folder_id=req.folder_id,
        created_at=datetime.utcnow(),
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    if req.student_id is not None:
        student, material = bind_main_report_material(db, req.student_id, material.id)
        return MaterialResponse.model_validate(serialize_material_response(material, [student]))

    return MaterialResponse.model_validate(serialize_material_response(material))


@router.post("/upload/proxy", response_model=MaterialResponse)
async def proxy_upload(
    file: UploadFile = FastAPIFile(...),
    category: str = Form("course"),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    uploaded_by: str = Form("admin"),
    folder_id: Optional[int] = Form(None),
    student_id: Optional[int] = Form(None),
    db: DBSession = Depends(get_db),
):
    """
    代理上传：前端 POST 文件到后端，后端通过 SDK 直接上传到 TOS（绕过 CORS）
    """
    if not check_tos_configured():
        raise HTTPException(status_code=503, detail="TOS 未配置")

    if student_id is not None:
        if category != "report":
            raise HTTPException(status_code=400, detail="只有喜报素材才能关联学员")
        get_student_or_404(db, student_id)

    # 如果指定了文件夹，验证文件夹存在
    if folder_id is not None:
        folder = db.query(Material).filter(Material.id == folder_id, Material.file_type == "folder").first()
        if not folder:
            raise HTTPException(status_code=404, detail="目标文件夹不存在")

    # 生成唯一对象 key
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else ""
    unique_name = f"{uuid.uuid4().hex}.{ext}" if ext else uuid.uuid4().hex
    object_key = tenant_object_key(f"materials/{category}/{unique_name}")

    # 读取文件内容并上传到 TOS
    content = await file.read()
    content_type = file.content_type or "application/octet-stream"
    try:
        upload_object(object_key=object_key, data=content, content_type=content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TOS 上传失败: {str(e)}")

    # 记录元数据到数据库
    material = Material(
        filename=file.filename or unique_name,
        stored_name=unique_name,
        file_size=len(content),
        file_type=content_type,
        category=category,
        title=title or (file.filename.rsplit(".", 1)[0] if file.filename and "." in file.filename else file.filename),
        description=description or "",
        tags=[],
        uploaded_by=uploaded_by,
        download_count=0,
        oss_key=object_key,
        folder_id=folder_id,
        created_at=datetime.utcnow(),
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    if student_id is not None:
        student, material = bind_main_report_material(db, student_id, material.id)
        return MaterialResponse.model_validate(serialize_material_response(material, [student]))

    return MaterialResponse.model_validate(serialize_material_response(material))


@router.get("/tags", response_model=List[TagItem])
def list_all_tags(
    category: Optional[str] = Query(None, description="按分类筛选标签"),
    db: DBSession = Depends(get_db),
):
    """
    获取所有已使用的标签及其计数。
    使用 PostgreSQL jsonb_array_elements_text 展开 JSONB 数组后聚合。
    """
    from sqlalchemy import text

    # 构建 SQL：展开 JSONB 数组后 GROUP BY 聚合
    if category:
        sql = text("""
            SELECT tag, COUNT(*) as cnt
            FROM materials, jsonb_array_elements_text(tags) AS tag
            WHERE file_type != 'folder' AND category = :category
            GROUP BY tag
            ORDER BY cnt DESC, tag ASC
        """)
        rows = db.execute(sql, {"category": category}).fetchall()
    else:
        sql = text("""
            SELECT tag, COUNT(*) as cnt
            FROM materials, jsonb_array_elements_text(tags) AS tag
            WHERE file_type != 'folder'
            GROUP BY tag
            ORDER BY cnt DESC, tag ASC
        """)
        rows = db.execute(sql).fetchall()

    return [TagItem(name=row[0], count=row[1]) for row in rows]


@router.post("/batch-tag")
def batch_update_tags(
    req: BatchTagRequest,
    db: DBSession = Depends(get_db),
):
    """
    批量为多个素材添加/移除标签。
    add_tags 中的标签会合并到现有标签列表（去重）；
    remove_tags 中的标签会从现有标签列表中移除。
    """
    if not req.material_ids:
        raise HTTPException(status_code=400, detail="material_ids 不能为空")
    if not req.add_tags and not req.remove_tags:
        raise HTTPException(status_code=400, detail="add_tags 和 remove_tags 不能同时为空")

    materials = db.query(Material).filter(Material.id.in_(req.material_ids)).all()
    if not materials:
        raise HTTPException(status_code=404, detail="未找到任何素材")

    updated = 0
    for m in materials:
        current_tags = list(m.tags or [])
        # 添加新标签（去重）
        for t in req.add_tags:
            t = t.strip()
            if t and t not in current_tags:
                current_tags.append(t)
        # 移除标签
        for t in req.remove_tags:
            t = t.strip()
            if t in current_tags:
                current_tags.remove(t)
        m.tags = current_tags
        updated += 1

    db.commit()
    return {"updated": updated, "message": f"成功更新 {updated} 个素材的标签"}


@router.get("/{material_id}", response_model=MaterialResponse)
def get_material(
    material_id: int,
    db: DBSession = Depends(get_db),
):
    """获取单个素材详情"""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="素材不存在")
    bound_students = get_material_bound_students(db, material.id)
    return MaterialResponse.model_validate(serialize_material_response(material, bound_students))


@router.get("/{material_id}/preview", response_model=PreviewUrlResponse)
def get_preview_url(
    material_id: int,
    db: DBSession = Depends(get_db),
):
    """
    获取素材预览/下载的预签名 URL
    """
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="素材不存在")

    if not material.oss_key:
        raise HTTPException(status_code=400, detail="该素材没有关联的 OSS 文件")

    if not check_tos_configured():
        raise HTTPException(status_code=503, detail="TOS 未配置")

    url = generate_presigned_download_url(
        object_key=material.oss_key,
        expires=3600,
    )

    return PreviewUrlResponse(
        url=url,
        filename=material.filename,
        file_type=material.file_type,
        expires_in=3600,
    )


@router.get("/{material_id}/download", response_model=PreviewUrlResponse)
def download_material(
    material_id: int,
    db: DBSession = Depends(get_db),
):
    """
    获取素材下载链接并递增下载计数
    """
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="素材不存在")

    if not material.oss_key:
        raise HTTPException(status_code=400, detail="该素材没有关联的 OSS 文件")

    if not check_tos_configured():
        raise HTTPException(status_code=503, detail="TOS 未配置")

    # 递增下载计数
    material.download_count = (material.download_count or 0) + 1
    db.commit()

    url = generate_presigned_download_url(
        object_key=material.oss_key,
        expires=3600,
    )

    return PreviewUrlResponse(
        url=url,
        filename=material.filename,
        file_type=material.file_type,
        expires_in=3600,
    )


@router.get("/{material_id}/image")
def get_material_image(
    material_id: int,
    db: DBSession = Depends(get_db),
):
    """代理下载素材图片字节流（供前端复制到剪贴板等场景使用，规避 CORS）"""
    from fastapi.responses import Response

    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="素材不存在")
    if not material.oss_key:
        raise HTTPException(status_code=400, detail="该素材没有关联的 OSS 文件")
    if not check_tos_configured():
        raise HTTPException(status_code=503, detail="TOS 未配置")

    try:
        data = download_object(material.oss_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下载失败: {str(e)}")

    return Response(content=data, media_type=material.file_type or "image/png")


@router.put("/{material_id}/move", response_model=MaterialResponse)
def move_material(
    material_id: int,
    req: MaterialMoveRequest,
    db: DBSession = Depends(get_db),
):
    """移动喜报素材到指定文件夹或根目录"""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="素材不存在")
    if material.category != "report":
        raise HTTPException(status_code=400, detail="仅支持移动喜报素材")
    if material.file_type == "folder":
        raise HTTPException(status_code=400, detail="文件夹素材不支持移动")
    if req.folder_id == material.folder_id:
        raise HTTPException(status_code=400, detail="素材已在当前目录")

    if req.folder_id is not None:
        folder = db.query(Material).filter(
            Material.id == req.folder_id,
            Material.file_type == "folder",
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail="目标文件夹不存在")
        if folder.category != material.category:
            raise HTTPException(status_code=400, detail="不能移动到其他分类的文件夹")

    material.folder_id = req.folder_id
    db.commit()
    db.refresh(material)

    bound_students = get_material_bound_students(db, material.id)
    return MaterialResponse.model_validate(serialize_material_response(material, bound_students))


@router.put("/{material_id}", response_model=MaterialResponse)
def update_material(
    material_id: int,
    req: MaterialUpdateRequest,
    db: DBSession = Depends(get_db),
):
    """更新素材信息（文件名、标题、描述、标签、分类）"""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="素材不存在")
    bound_students = get_material_bound_students(db, material.id)

    if req.filename is not None:
        filename = req.filename.strip()
        if not filename:
            raise HTTPException(status_code=400, detail="文件名不能为空")
        material.filename = filename
    if req.title is not None:
        material.title = req.title
    if req.description is not None:
        material.description = req.description
    if req.remark is not None:
        material.remark = req.remark
    if req.tags is not None:
        material.tags = req.tags
    if req.category is not None:
        if bound_students and req.category != "report":
            raise HTTPException(status_code=409, detail="已绑定学生的喜报不能改成其他分类")
        material.category = req.category

    db.commit()
    db.refresh(material)
    return MaterialResponse.model_validate(serialize_material_response(material, bound_students))


@router.delete("/{material_id}")
def delete_material(
    material_id: int,
    db: DBSession = Depends(get_db),
):
    """删除素材（同时删除 OSS 文件和数据库记录）"""
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="素材不存在")
    ensure_material_not_bound(db, material.id)

    # 尝试从 OSS 删除文件
    if material.oss_key and check_tos_configured():
        delete_object(material.oss_key)

    # 删除数据库记录
    db.delete(material)
    db.commit()

    return {
        "message": "素材已删除",
        "id": material_id,
    }


@router.post("/{material_id}/mask", response_model=MaterialResponse)
def mask_material(
    material_id: int,
    db: DBSession = Depends(get_db),
):
    """
    对指定素材执行 AI 打码处理:
    1. 从 TOS 下载原图
    2. 调用 AI 识别敏感区域
    3. Pillow 高斯模糊
    4. 上传打码图到 TOS
    5. 创建新的 Material 记录 (category=masked)
    """
    # 校验素材
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="素材不存在")

    if not material.file_type or not material.file_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="仅支持对图片类型素材打码")

    if not material.oss_key:
        raise HTTPException(status_code=400, detail="该素材没有关联的 OSS 文件")

    if not check_tos_configured():
        raise HTTPException(status_code=503, detail="TOS 未配置")

    from app.services.mask_service import mask_image

    # 1. 下载原图
    try:
        image_bytes = download_object(material.oss_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下载原图失败: {str(e)}")

    # 2+3. AI 识别 + 模糊处理
    try:
        masked_bytes = mask_image(image_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"打码处理失败: {str(e)}")

    # 4. 上传打码图
    masked_name = f"{uuid.uuid4().hex}.png"
    masked_oss_key = tenant_object_key(f"materials/masked/{masked_name}")
    try:
        upload_object(object_key=masked_oss_key, data=masked_bytes, content_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传打码图失败: {str(e)}")

    # 5. 创建新记录
    masked_material = Material(
        filename=f"masked_{material.filename}",
        stored_name=masked_name,
        file_size=len(masked_bytes),
        file_type="image/png",
        category="masked",
        title=f"[已打码] {material.title or material.filename}",
        description=f"由素材 #{material.id} 自动打码生成",
        tags=[],
        uploaded_by="ai-mask",
        download_count=0,
        oss_key=masked_oss_key,
        source_material_id=material.id,
        folder_id=material.folder_id,
    )
    db.add(masked_material)
    db.commit()
    db.refresh(masked_material)

    return MaterialResponse.model_validate(serialize_material_response(masked_material))

@router.post("/{material_id}/mask/manual", response_model=MaterialResponse)
async def manual_mask_material(
    material_id: int,
    mask: UploadFile = FastAPIFile(...),
    blur_radius: int = Form(default=25),
    db: DBSession = Depends(get_db),
):
    """
    笔刷打码：前端传一张黑白 mask PNG（白色=需模糊区域），
    后端根据 mask 对原图做高斯模糊合成。
    """
    print(f"[Mask] 收到打码请求: material_id={material_id}")
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="素材不存在")
    if not material.file_type or not material.file_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="仅支持对图片类型素材打码")
    if not material.oss_key:
        raise HTTPException(status_code=400, detail="该素材没有关联的 OSS 文件")
    if not check_tos_configured():
        raise HTTPException(status_code=503, detail="TOS 未配置")
    print(f"[Mask] 开始处理: {material.filename}, category={material.category}, oss_key={material.oss_key}")

    from PIL import Image, ImageFilter
    from io import BytesIO

    # 1. 下载原图
    try:
        image_bytes = download_object(material.oss_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"下载原图失败: {str(e)}")

    # 2. 读取 mask
    try:
        mask_bytes = await mask.read()
        original = Image.open(BytesIO(image_bytes)).convert("RGB")
        mask_img = Image.open(BytesIO(mask_bytes)).convert("L")
        if mask_img.size != original.size:
            mask_img = mask_img.resize(original.size, Image.LANCZOS)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"读取 mask 失败: {str(e)}")

    # 3. 对原图做高斯模糊
    try:
        blurred = original.filter(ImageFilter.GaussianBlur(radius=blur_radius))
        blurred = blurred.filter(ImageFilter.GaussianBlur(radius=blur_radius))
        # composite: mask 白色区域取 blurred，黑色区域取 original
        result = Image.composite(blurred, original, mask_img)
        output = BytesIO()
        result.save(output, format="PNG", optimize=True)
        masked_bytes = output.getvalue()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"打码处理失败: {str(e)}")

    # 4. 上传打码图
    masked_name = f"{uuid.uuid4().hex}.png"
    masked_oss_key = tenant_object_key(f"materials/masked/{masked_name}")
    try:
        upload_object(object_key=masked_oss_key, data=masked_bytes, content_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传打码图失败: {str(e)}")

    # 5. 创建新记录
    masked_material = Material(
        filename=f"masked_{material.filename}",
        stored_name=masked_name,
        file_size=len(masked_bytes),
        file_type="image/png",
        category="masked",
        title=f"[手动打码] {material.title or material.filename}",
        description=f"由素材 #{material.id} 笔刷打码生成",
        tags=[],
        uploaded_by="manual-mask",
        download_count=0,
        oss_key=masked_oss_key,
        source_material_id=material.id,
        folder_id=material.folder_id,
    )
    db.add(masked_material)
    db.commit()
    db.refresh(masked_material)
    print(f"[Mask] ✅ 打码成功: new_id={masked_material.id}, source_id={material.id}, oss_key={masked_oss_key}")

    return MaterialResponse.model_validate(serialize_material_response(masked_material))


@router.get("/stats/summary")
def get_stats(db: DBSession = Depends(get_db)):
    """获取素材库统计信息"""
    total = db.query(func.count(Material.id)).scalar() or 0
    course_count = (
        db.query(func.count(Material.id))
        .filter(Material.category == "course")
        .scalar()
        or 0
    )
    report_count = (
        db.query(func.count(Material.id))
        .filter(Material.category == "report")
        .scalar()
        or 0
    )
    total_size = db.query(func.sum(Material.file_size)).scalar() or 0
    total_downloads = db.query(func.sum(Material.download_count)).scalar() or 0

    return {
        "total": total,
        "course_count": course_count,
        "report_count": report_count,
        "total_size_bytes": total_size,
        "total_downloads": total_downloads,
        "tos_configured": check_tos_configured(),
    }


# ==================== 素材导出为 RAG 知识库 ====================

# ============================================================
# 标签分类 + 自然语言问题模板
# 每个标签自动归类，然后用对应模板生成 3-5 个自然语言问题变体
# ============================================================

# 标签归类
_TAG_CATEGORY = {
    # 城市
    "北京": "city", "上海": "city", "深圳": "city", "杭州": "city",
    "成都": "city", "广州": "city", "武汉": "city", "南京": "city",
    "重庆": "city", "郑州": "city", "长沙": "city", "西安": "city",
    "合肥": "city", "惠州": "city", "苏州": "city", "天津": "city",
    "厦门": "city", "济南": "city", "青岛": "city", "佛山": "city",
    # 地区
    "中部": "region", "华东": "region", "华南": "region", "华北": "region",
    "西南": "region", "川渝": "region", "广深": "region",
    # 学历
    "大专": "edu", "本科": "edu", "专升本": "edu", "硕士": "edu",
    "高中": "edu", "成人大专": "edu",
    # 转行背景
    "前端": "bg", "java": "bg", "Java": "bg", "后端": "bg",
    "零基础": "bg", "0基础": "bg", "产品经理": "bg", "运营": "bg",
    "销售": "bg", "测试": "bg", "运维": "bg", "嵌入式": "bg",
    # 薪资
    "10k": "salary", "10-15k": "salary", "15k": "salary",
    "15-20k": "salary", "20k": "salary", "20-25k": "salary",
    "25k": "salary", "30k": "salary",
    # 经验/年龄
    "应届": "exp", "1-3年": "exp", "3-5年": "exp", "5年以上": "exp",
    # 通用
    "offer": "general", "喜报": "general",
    # 聊天素材分类（brand）
    "学员群交流": "chat_community", "学员群氛围": "chat_community",
    "学员互动": "chat_community",
    "就业反馈": "chat_career", "就业交流": "chat_career",
    "面试分享": "chat_career", "学员面试分享": "chat_career",
    "学员交流面试": "chat_career",
    "课程好评反馈": "chat_course", "课程好评": "chat_course",
    "性价比、课程内容质量好评": "chat_course",
    "项目情况": "chat_project",
    "复购": "chat_repurchase", "学员复购": "chat_repurchase",
    "签": "chat_sign", "签约": "chat_sign",
}

# 每个分类对应的问题模板（{tag} 会被替换为实际标签值）
_QUESTION_TEMPLATES = {
    "city": [
        "{tag}有学员成功拿到offer的案例吗",
        "{tag}AI岗位能找到工作吗",
        "{tag}有人学完找到工作了吗",
        "{tag}学员薪资怎么样",
    ],
    "region": [
        "{tag}地区有学员成功的案例吗",
        "{tag}的学员找到工作了吗",
        "{tag}有拿到offer的喜报吗",
    ],
    "edu": [
        "{tag}学历可以学AI吗",
        "{tag}有成功转行AI的案例吗",
        "{tag}学AI能找到工作吗",
        "{tag}有学员拿到offer吗",
    ],
    "bg": [
        "{tag}转AI有成功案例吗",
        "{tag}能学会AI吗",
        "{tag}转行AI薪资多少",
        "{tag}转AI有人拿到offer了吗",
    ],
    "salary": [
        "有学员拿到{tag}薪资的案例吗",
        "AI岗位能拿到{tag}吗",
        "{tag}的offer案例有吗",
    ],
    "exp": [
        "{tag}可以学AI吗",
        "{tag}转AI有成功案例吗",
        "{tag}学AI能找到工作吗",
    ],
    "general": [
        "有学员成功的案例吗",
        "最近有拿到offer的喜报吗",
        "有学员案例可以看看吗",
    ],
    # 聊天素材（brand）专用模板
    "chat_community": [
        "学员群氛围怎么样",
        "学员之间交流多吗",
        "报名后有学员群吗",
        "群里大家都在聊什么",
    ],
    "chat_career": [
        "学完之后就业情况怎么样",
        "有学员找到工作的反馈吗",
        "面试通过率高吗",
        "学员就业反馈好吗",
    ],
    "chat_course": [
        "课程质量怎么样",
        "学过的人怎么评价课程",
        "课程好评多吗",
        "课程内容值不值这个价",
    ],
    "chat_project": [
        "课程有实战项目吗",
        "项目是什么样的",
        "学完能做什么项目",
    ],
    "chat_repurchase": [
        "有学员续费或复购吗",
        "老学员会推荐吗",
        "复购率高吗",
    ],
    "chat_sign": [
        "有签约保障吗",
        "签约内容是什么",
        "签约就业靠谱吗",
    ],
}

# 兜底模板（未归类的标签用这个）
_DEFAULT_TEMPLATES = [
    "{tag}相关的学员案例有吗",
    "{tag}有成功的案例吗",
    "有{tag}相关的offer喜报吗",
]

# 地区 → 包含的城市（地区标签自动展开为城市级问题变体）
_REGION_CITIES = {
    "中部": ["武汉", "郑州", "长沙", "合肥", "南昌"],
    "华东": ["上海", "杭州", "南京", "苏州", "合肥"],
    "华南": ["广州", "深圳", "佛山", "惠州", "厦门"],
    "华北": ["北京", "天津", "济南", "青岛"],
    "西南": ["成都", "重庆"],
    "川渝": ["成都", "重庆"],
    "广深": ["广州", "深圳"],
}


def _generate_question_variants(tag: str) -> list[str]:
    """
    为一个标签生成自然语言问题变体列表

    地区标签会额外展开为城市级问题，确保用户搜具体城市也能命中
    """
    category = _TAG_CATEGORY.get(tag, "unknown")
    templates = _QUESTION_TEMPLATES.get(category, _DEFAULT_TEMPLATES)
    variants = [t.format(tag=tag) for t in templates]

    # 地区标签：额外为每个城市生成 city 类问题
    if category == "region" and tag in _REGION_CITIES:
        city_templates = _QUESTION_TEMPLATES["city"]
        for city in _REGION_CITIES[tag]:
            # 每个城市取前 2 个模板，避免数据膨胀
            for t in city_templates[:2]:
                variants.append(t.format(tag=city))

    return variants


def _build_public_url(oss_key: str) -> str:
    """构建 TOS 公开访问 URL"""
    settings = get_settings()
    host = settings.tos_endpoint.replace("https://", "").replace("http://", "")
    return f"https://{settings.tos_bucket}.{host}/{oss_key}"


@router.get("/export/rag")
def export_materials_rag(
    category: str = Query("report", description="素材分类，默认 report（喜报）"),
    max_per_tag: int = Query(5, ge=1, le=20, description="每个标签最多图片数"),
    upload_tos: bool = Query(True, description="是否同时上传到 TOS（供火山知识库直接导入）"),
    volcano_compat: bool = Query(False, description="火山引擎兼容模式：展开变体为多行 question,answer"),
    db: DBSession = Depends(get_db),
):
    """
    将素材库导出为 RAG 知识库 CSV

    默认格式（方案 C）：一条素材一行，含结构化元数据列
    - question: 主问题
    - answer: 自然语言正文 + 图片 URL
    - type: 内容类型（case_study）
    - education: 学历标签（专科/本科/...）
    - region: 地区标签（中部/华东/...）
    - city: 城市标签
    - background: 转行背景（前端/java/...）
    - salary: 薪资标签
    - image_urls: 图片URL列表（竖线分隔）
    - tags: 所有标签（逗号分隔）
    - variants: 问题变体（竖线分隔）

    volcano_compat=true 时：退化为 question,answer 扁平格式（向后兼容）

    brand 类素材会自动使用打码版本的图片 URL
    """
    from fastapi.responses import StreamingResponse
    from collections import defaultdict
    import csv
    import io

    # 查询所有图片素材
    materials = db.query(Material).filter(
        Material.category == category,
        Material.file_type.like("image/%"),
        Material.oss_key.isnot(None),
    ).all()

    if not materials:
        raise HTTPException(status_code=404, detail=f"没有找到 {category} 类别的图片素材")

    # brand 类素材：构建 原图id → 打码图oss_key 的映射（取最新打码版本）
    masked_map: dict[int, str] = {}
    if category == "brand":
        material_ids = [m.id for m in materials]
        masked_materials = db.query(Material).filter(
            Material.category == "masked",
            Material.source_material_id.in_(material_ids),
            Material.oss_key.isnot(None),
        ).all()
        # 用单独的 dict 跟踪已见过的最大 id
        _masked_max_id: dict[int, int] = {}
        for mm in masked_materials:
            src_id = mm.source_material_id
            prev_id = _masked_max_id.get(src_id, -1)
            if mm.id > prev_id:
                _masked_max_id[src_id] = mm.id
                masked_map[src_id] = mm.oss_key
        print(f"[RAG Export] brand materials: {len(materials)}, masked found: {len(masked_materials)}, mapped: {len(masked_map)}")
        if len(masked_materials) == 0:
            # 额外调试：查看数据库中所有 masked 素材
            all_masked = db.query(Material.id, Material.source_material_id, Material.category).filter(
                Material.category == "masked",
            ).limit(10).all()
            print(f"[RAG Debug] ALL masked in DB: {[(m.id, m.source_material_id, m.category) for m in all_masked]}")
            print(f"[RAG Debug] brand material IDs (first 10): {material_ids[:10]}")
            # 查看这些 brand 素材的实际 category
            sample_cats = db.query(Material.id, Material.category).filter(Material.id.in_(material_ids[:5])).all()
            print(f"[RAG Debug] sample brand categories: {[(m.id, m.category) for m in sample_cats]}")

    def _get_export_url(m: Material) -> str | None:
        """获取导出用的图片 URL，brand 类优先使用打码版本，无打码版则退回原图"""
        if category == "brand":
            masked_key = masked_map.get(m.id)
            if masked_key:
                return _build_public_url(masked_key)
            # 没有打码版本，使用原图
        return _build_public_url(m.oss_key)

    def _get_export_desc(m: Material) -> str:
        """获取导出用的图片描述，brand 类优先使用 remark"""
        if category == "brand" and m.remark:
            return m.remark.strip()
        return m.title or m.filename

    # 按标签分组
    tag_materials = defaultdict(list)
    for m in materials:
        tags = m.tags or []
        for tag in tags:
            tag_str = str(tag).strip()
            if tag_str:
                tag_materials[tag_str].append(m)

    print(f"[RAG Export] tag groups: {len(tag_materials)}, tags: {list(tag_materials.keys())[:10]}")

    output = io.StringIO()
    output.write('\ufeff')  # BOM

    if volcano_compat:
        # ---- 火山兼容模式：展开变体，question,answer 扁平格式 ----
        writer = csv.DictWriter(output, fieldnames=['question', 'answer'])
        writer.writeheader()
        rows_written = 0

        for tag, mats in tag_materials.items():
            image_lines = []
            for m in mats[:max_per_tag]:
                url = _get_export_url(m)
                if url is None:
                    continue  # brand 未打码的跳过
                title = _get_export_desc(m)
                image_lines.append(f"- {title}: {url}")
            if not image_lines:
                continue  # 该标签下所有素材都没打码，跳过
            answer = f"有的，以下是{tag}相关的学员成功案例：\n" + "\n".join(image_lines)
            variants = _generate_question_variants(tag)
            for q in variants:
                writer.writerow({"question": q, "answer": answer})
                rows_written += 1

        recent = sorted(materials, key=lambda m: m.created_at or '', reverse=True)
        recent_lines = []
        for m in recent:
            url = _get_export_url(m)
            if url is None:
                continue
            recent_lines.append(f"- {_get_export_desc(m)}: {url}")
            if len(recent_lines) >= max_per_tag:
                break
        if recent_lines:
            general_answer = "最近的学员成功案例：\n" + "\n".join(recent_lines)
            for q in ["有最近的成功案例吗", "最新的offer喜报", "有学员案例看看吗"]:
                writer.writerow({"question": q, "answer": general_answer})
                rows_written += 1
    else:
        # ---- 方案 C：一条素材一行 + 结构化元数据 ----
        fieldnames = [
            'question', 'answer', 'type',
            'education', 'region', 'city', 'background', 'salary',
            'image_urls', 'tags', 'variants',
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        rows_written = 0

        for tag, mats in tag_materials.items():
            # 提取元数据维度
            tag_cat = _TAG_CATEGORY.get(tag, "unknown")
            meta = {
                'education': tag if tag_cat == 'edu' else '',
                'region': tag if tag_cat == 'region' else '',
                'city': tag if tag_cat == 'city' else '',
                'background': tag if tag_cat == 'bg' else '',
                'salary': tag if tag_cat == 'salary' else '',
            }

            # 构建图片 URL 列表（brand 类使用打码版本）
            image_urls = []
            image_lines = []
            for m in mats[:max_per_tag]:
                url = _get_export_url(m)
                if url is None:
                    continue  # brand 未打码的跳过
                title = _get_export_desc(m)
                image_urls.append(url)
                image_lines.append(f"- {title}: {url}")

            if not image_lines:
                continue  # 该标签下所有素材都没打码，跳过

            # 自然语言正文（RAG 向量检索友好）
            answer = f"有的，以下是{tag}相关的学员成功案例：\n" + "\n".join(image_lines)

            # 生成问题变体
            variants = _generate_question_variants(tag)
            main_question = variants[0] if variants else f"{tag}相关的学员案例有吗"

            writer.writerow({
                'question': main_question,
                'answer': answer,
                'type': 'case_study',
                'education': meta['education'],
                'region': meta['region'],
                'city': meta['city'],
                'background': meta['background'],
                'salary': meta['salary'],
                'image_urls': '|'.join(image_urls),
                'tags': ','.join(str(t) for t in (mats[0].tags or []) if t),
                'variants': '|'.join(variants[1:]),  # 主问题之外的变体
            })
            rows_written += 1

        # 通用问题
        recent = sorted(materials, key=lambda m: m.created_at or '', reverse=True)
        recent_urls = []
        recent_lines = []
        for m in recent:
            url = _get_export_url(m)
            if url is None:
                continue
            recent_urls.append(url)
            recent_lines.append(f"- {_get_export_desc(m)}: {url}")
            if len(recent_lines) >= max_per_tag:
                break
        if recent_lines:
            writer.writerow({
                'question': '有最近的成功案例吗',
                'answer': '最近的学员成功案例：\n' + '\n'.join(recent_lines),
                'type': 'case_study',
                'education': '', 'region': '', 'city': '',
                'background': '', 'salary': '',
                'image_urls': '|'.join(recent_urls),
                'tags': 'general',
                'variants': '最新的offer喜报|有学员案例看看吗',
            })
            rows_written += 1

    output.seek(0)
    content = output.getvalue()
    content_bytes = content.encode('utf-8')

    # 上传到 TOS
    tos_key = None
    if upload_tos and check_tos_configured():
        try:
            suffix = "_volcano" if volcano_compat else ""
            tos_key = tenant_object_key(f"rag-export/rag_materials_{category}{suffix}.csv")
            upload_object(
                object_key=tos_key,
                data=content_bytes,
                content_type="text/csv; charset=utf-8",
            )
        except Exception as e:
            print(f"[WARN] TOS upload failed: {e}")
            tos_key = None

    return StreamingResponse(
        io.BytesIO(content_bytes),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename=rag_materials_{category}.csv",
            "X-Total-Rows": str(rows_written),
            "X-Total-Tags": str(len(tag_materials)),
            "X-Format": "volcano_compat" if volcano_compat else "structured_metadata",
            "X-Tos-Key": tos_key or "",
        },
    )


@router.get("/export/rag/preview")
def preview_materials_rag(
    category: str = Query("report", description="素材分类"),
    db: DBSession = Depends(get_db),
):
    """
    预览素材导出为 RAG 知识库的统计信息（不下载 CSV）
    brand 类会标记未打码的素材数量
    """
    from collections import defaultdict

    materials = db.query(Material).filter(
        Material.category == category,
        Material.file_type.like("image/%"),
        Material.oss_key.isnot(None),
    ).all()

    # brand 类：统计打码 vs 未打码素材
    unmasked_count = 0
    masked_count = 0
    if category == "brand":
        material_ids = [m.id for m in materials]
        masked_source_ids = set()
        if material_ids:
            masked_rows = db.query(Material.source_material_id).filter(
                Material.category == "masked",
                Material.source_material_id.in_(material_ids),
                Material.oss_key.isnot(None),
            ).all()
            masked_source_ids = {r[0] for r in masked_rows}
        masked_count = sum(1 for m in materials if m.id in masked_source_ids or m.is_pre_masked)
        unmasked_count = len(materials) - masked_count

    tag_materials = defaultdict(list)
    no_tag = 0
    for m in materials:
        tags = m.tags or []
        if not tags:
            no_tag += 1
            continue
        for tag in tags:
            tag_str = str(tag).strip()
            if tag_str:
                tag_materials[tag_str].append(m)

    # 统计每个标签会生成的 Q&A（自然语言多变体）
    tag_stats = []
    total_rows = 0
    for tag, mats in sorted(tag_materials.items(), key=lambda x: -len(x[1])):
        variants = _generate_question_variants(tag)
        tag_stats.append({
            "tag": tag,
            "material_count": len(mats),
            "question_count": len(variants),
            "sample_questions": variants[:3],
        })
        total_rows += len(variants)

    total_rows += 3  # 通用问题

    result = {
        "total_materials": len(materials),
        "tagged_materials": len(materials) - no_tag,
        "untagged_materials": no_tag,
        "total_tags": len(tag_materials),
        "total_rows": total_rows,
        "tag_stats": tag_stats,
    }

    # brand 类额外返回打码统计
    if category == "brand":
        result["masked_materials"] = masked_count
        result["unmasked_materials"] = unmasked_count

    return result


# ==================== 结构化知识导出（手写 Q&A） ====================

@router.get("/export/knowledge")
def export_structured_knowledge(
    upload_tos: bool = Query(True, description="是否同时上传到 TOS"),
    volcano_compat: bool = Query(False, description="火山引擎兼容模式：展开变体为多行 question,answer"),
):
    """
    导出结构化知识库 CSV

    默认格式（方案 C）：一条知识一行 + 元数据列
    - question: 标准问题
    - answer: 自然语言回答（RAG 向量检索友好）
    - intent: 意图分类
    - tags: 关键词标签（逗号分隔）
    - source: 数据来源
    - variants: 问题变体（竖线分隔，提升搜索召回）

    volcano_compat=true 时：退化为展开每个变体的扁平 question,answer 格式
    """
    from fastapi.responses import StreamingResponse
    import csv
    import io
    import importlib.util

    # 动态加载 build_dual_rag.py 中的 KNOWLEDGE_BASE
    script_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "scripts", "build_dual_rag.py"
    )
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail=f"知识库脚本不存在: {script_path}")

    # 读取 KNOWLEDGE_BASE 数据
    with open(script_path, 'r', encoding='utf-8') as f:
        src = f.read()
    local_ns = {}
    # 只执行到 KNOWLEDGE_BASE 定义结束（不执行函数部分）
    exec(src.split("def build_knowledge_csv")[0], {}, local_ns)
    knowledge_base = local_ns.get("KNOWLEDGE_BASE", [])

    if not knowledge_base:
        raise HTTPException(status_code=404, detail="未找到知识库数据")

    output = io.StringIO()
    output.write('\ufeff')  # BOM

    if volcano_compat:
        # ---- 火山兼容模式：每个变体展开为独立行 ----
        writer = csv.DictWriter(output, fieldnames=['question', 'answer'])
        writer.writeheader()
        rows_written = 0
        for item in knowledge_base:
            answer = item['answer'].strip()
            writer.writerow({'question': item['question'], 'answer': answer})
            rows_written += 1
            for v in item.get('variants', []):
                writer.writerow({'question': v, 'answer': answer})
                rows_written += 1
    else:
        # ---- 方案 C：一条知识一行 + 结构化元数据列 ----
        fieldnames = ['question', 'answer', 'intent', 'tags', 'source', 'variants']
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        rows_written = 0
        for item in knowledge_base:
            writer.writerow({
                'question': item['question'],
                'answer': item['answer'].strip(),
                'intent': item.get('intent', ''),
                'tags': ','.join(item.get('tags', [])),
                'source': item.get('source', ''),
                'variants': '|'.join(item.get('variants', [])),
            })
            rows_written += 1

    output.seek(0)
    file_content = output.getvalue()
    content_bytes = file_content.encode('utf-8')

    # 上传到 TOS
    tos_key = None
    if upload_tos and check_tos_configured():
        try:
            suffix = "_volcano" if volcano_compat else ""
            tos_key = tenant_object_key(f"rag-export/rag_structured_knowledge{suffix}.csv")
            upload_object(
                object_key=tos_key,
                data=content_bytes,
                content_type="text/csv; charset=utf-8",
            )
        except Exception as e:
            print(f"[WARN] TOS upload failed: {e}")
            tos_key = None

    return StreamingResponse(
        io.BytesIO(content_bytes),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": "attachment; filename=rag_structured_knowledge.csv",
            "X-Total-Rows": str(rows_written),
            "X-Knowledge-Items": str(len(knowledge_base)),
            "X-Format": "volcano_compat" if volcano_compat else "structured_metadata",
            "X-Tos-Key": tos_key or "",
        },
    )


# ==================== 文件夹管理接口 ====================

class FolderCreateRequest(BaseModel):
    """创建文件夹请求"""
    name: str
    category: str = "report"
    parent_folder_id: Optional[int] = None


class FolderRenameRequest(BaseModel):
    """重命名文件夹请求"""
    name: str


class FolderResponse(BaseModel):
    """文件夹响应"""
    id: int
    name: str
    category: str
    parent_folder_id: Optional[int] = None
    file_count: int = 0
    subfolder_count: int = 0
    created_at: datetime


@router.get("/folders/list")
def list_folders(
    category: Optional[str] = Query(None, description="分类: course, report"),
    parent_folder_id: Optional[int] = Query(None, description="父文件夹ID，NULL=根目录"),
    db: DBSession = Depends(get_db),
):
    """获取指定分类和父文件夹下的文件夹列表"""
    query = db.query(Material).filter(Material.file_type == "folder")
    if category:
        query = query.filter(Material.category == category)
    if parent_folder_id is not None:
        query = query.filter(Material.folder_id == parent_folder_id)
    else:
        query = query.filter(Material.folder_id.is_(None))
    folders = query.order_by(desc(Material.created_at)).all()

    result = []
    for f in folders:
        file_count = db.query(func.count(Material.id)).filter(
            Material.folder_id == f.id,
            Material.file_type != "folder",
        ).scalar() or 0
        subfolder_count = db.query(func.count(Material.id)).filter(
            Material.folder_id == f.id,
            Material.file_type == "folder",
        ).scalar() or 0
        result.append(FolderResponse(
            id=f.id,
            name=f.filename,
            category=f.category,
            parent_folder_id=f.folder_id,
            file_count=file_count,
            subfolder_count=subfolder_count,
            created_at=f.created_at,
        ))
    return result


@router.post("/folder", response_model=FolderResponse)
def create_folder(
    req: FolderCreateRequest,
    db: DBSession = Depends(get_db),
):
    """创建文件夹"""
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="文件夹名称不能为空")

    # 如果有父文件夹，验证其存在
    if req.parent_folder_id is not None:
        parent = db.query(Material).filter(
            Material.id == req.parent_folder_id,
            Material.file_type == "folder",
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="父文件夹不存在")

    # 检查同级别下是否已有同名文件夹
    dup_query = db.query(Material).filter(
        Material.file_type == "folder",
        Material.category == req.category,
        Material.filename == name,
    )
    if req.parent_folder_id is not None:
        dup_query = dup_query.filter(Material.folder_id == req.parent_folder_id)
    else:
        dup_query = dup_query.filter(Material.folder_id.is_(None))
    if dup_query.first():
        raise HTTPException(status_code=409, detail=f"当前目录下已存在名为「{name}」的文件夹")

    folder = Material(
        filename=name,
        stored_name=f"folder_{uuid.uuid4().hex[:8]}",
        file_size=0,
        file_type="folder",
        category=req.category,
        title=name,
        description="",
        tags=[],
        uploaded_by="admin",
        download_count=0,
        oss_key=None,
        folder_id=req.parent_folder_id,
        created_at=datetime.utcnow(),
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)

    return FolderResponse(
        id=folder.id,
        name=folder.filename,
        category=folder.category,
        parent_folder_id=folder.folder_id,
        file_count=0,
        subfolder_count=0,
        created_at=folder.created_at,
    )


@router.put("/folder/{folder_id}", response_model=FolderResponse)
def rename_folder(
    folder_id: int,
    req: FolderRenameRequest,
    db: DBSession = Depends(get_db),
):
    """重命名文件夹"""
    folder = db.query(Material).filter(
        Material.id == folder_id,
        Material.file_type == "folder",
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="文件夹不存在")

    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="文件夹名称不能为空")

    folder.filename = name
    folder.title = name
    db.commit()
    db.refresh(folder)

    file_count = db.query(func.count(Material.id)).filter(
        Material.folder_id == folder.id,
        Material.file_type != "folder",
    ).scalar() or 0

    subfolder_count = db.query(func.count(Material.id)).filter(
        Material.folder_id == folder.id,
        Material.file_type == "folder",
    ).scalar() or 0

    return FolderResponse(
        id=folder.id,
        name=folder.filename,
        category=folder.category,
        parent_folder_id=folder.folder_id,
        file_count=file_count,
        subfolder_count=subfolder_count,
        created_at=folder.created_at,
    )


@router.delete("/folder/{folder_id}")
def delete_folder(
    folder_id: int,
    db: DBSession = Depends(get_db),
):
    """删除文件夹（级联删除内部所有文件）"""
    folder = db.query(Material).filter(
        Material.id == folder_id,
        Material.file_type == "folder",
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="文件夹不存在")

    def _collect_nested_material_ids(fid: int) -> list[int]:
        ids: list[int] = []
        children = db.query(Material).filter(Material.folder_id == fid).all()
        for child in children:
            if child.file_type == "folder":
                ids.extend(_collect_nested_material_ids(child.id))
            else:
                ids.append(child.id)
        return ids

    nested_material_ids = _collect_nested_material_ids(folder_id)
    bound_students = get_material_bound_students_map(db, nested_material_ids)
    if bound_students:
        sample_students = next(iter(bound_students.values()))
        sample_name = sample_students[0].name if sample_students else "未知"
        raise HTTPException(
            status_code=409,
            detail=f"文件夹内存在已关联学生「{sample_name}」的喜报，请先解绑",
        )

    def _delete_folder_recursive(fid: int) -> int:
        """递归删除文件夹及其所有子内容"""
        count = 0
        children = db.query(Material).filter(Material.folder_id == fid).all()
        for child in children:
            if child.file_type == "folder":
                count += _delete_folder_recursive(child.id)
            else:
                if child.oss_key and check_tos_configured():
                    try:
                        delete_object(child.oss_key)
                    except Exception:
                        pass
            db.delete(child)
            count += 1
        return count

    deleted_count = _delete_folder_recursive(folder_id)
    db.delete(folder)
    db.commit()

    return {
        "message": f"文件夹「{folder.filename}」已删除",
        "folder_id": folder_id,
        "deleted_files": deleted_count,
    }
