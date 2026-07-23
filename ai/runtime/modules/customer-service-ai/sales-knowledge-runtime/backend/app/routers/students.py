# -*- coding: utf-8 -*-
"""
学生管理 API
提供学员档案的 CRUD、批量导入、统计概览等功能
"""
from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File as FastAPIFile
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import desc, func, or_
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.models.database import get_db
from app.models.chat import Material
from app.models.student import Student
from app.services.student_reports import (
    add_student_report,
    bind_main_report_material,
    build_student_response,
    build_students_response_batch,
    get_student_or_404,
    get_student_primary_report,
    get_student_report_materials,
    remove_student_report,
    serialize_student_response,
    set_primary_report,
    unbind_main_report_material,
)
from app.services.vision_service import extract_students_from_image

router = APIRouter(prefix="/api/students", tags=["students"])


# ==================== 请求/响应模型 ====================

class StudentCreate(BaseModel):
    """新增学员请求"""
    name: str
    channel: str = "微信"
    job_title: Optional[str] = None
    pre_salary: Optional[str] = None
    post_salary: Optional[str] = None
    bday: Optional[str] = None
    city: Optional[str] = None
    education: Optional[str] = None
    graduation_cohort: Optional[str] = None
    enroll_date: Optional[str] = None
    graduation_date: Optional[str] = None
    phone: Optional[str] = None
    douyin_order: Optional[str] = None
    class_name: Optional[str] = None
    status: str = "active"


class StudentUpdate(BaseModel):
    """编辑学员请求"""
    name: Optional[str] = None
    channel: Optional[str] = None
    job_title: Optional[str] = None
    pre_salary: Optional[str] = None
    post_salary: Optional[str] = None
    bday: Optional[str] = None
    city: Optional[str] = None
    education: Optional[str] = None
    graduation_cohort: Optional[str] = None
    enroll_date: Optional[str] = None
    graduation_date: Optional[str] = None
    phone: Optional[str] = None
    douyin_order: Optional[str] = None
    class_name: Optional[str] = None
    status: Optional[str] = None


class BindMainReportRequest(BaseModel):
    material_id: int


class StudentResponse(BaseModel):
    """学员响应"""
    id: int
    name: str
    channel: str
    job_title: Optional[str] = None
    pre_salary: Optional[str] = None
    post_salary: Optional[str] = None
    bday: Optional[str] = None
    city: Optional[str] = None
    education: Optional[str] = None
    graduation_cohort: Optional[str] = None
    enroll_date: Optional[str] = None
    graduation_date: Optional[str] = None
    phone: Optional[str] = None
    douyin_order: Optional[str] = None
    class_name: Optional[str] = None
    main_report_material_id: Optional[int] = None
    main_report_material: Optional[dict] = None
    report_materials: list = []
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class StudentListResponse(BaseModel):
    """学员列表响应"""
    items: List[StudentResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class StudentStatsResponse(BaseModel):
    """统计概览响应"""
    total: int
    active: int
    graduated: int
    dropped: int
    classes: dict  # {班级名: 人数}


# ==================== API 接口 ====================

# 1. 学员列表（分页 + 搜索 + 筛选）
@router.get("/list", response_model=StudentListResponse)
def list_students(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="搜索姓名/电话"),
    class_name: Optional[str] = Query(None, description="筛选班级"),
    status: Optional[str] = Query(None, description="筛选状态: active/graduated/dropped"),
    channel: Optional[str] = Query(None, description="筛选渠道: 微信/抖音"),
    db: DBSession = Depends(get_db),
):
    query = db.query(Student)

    # 搜索
    if search:
        query = query.filter(
            or_(
                Student.name.contains(search),
                Student.phone.contains(search),
            )
        )

    # 筛选
    if class_name:
        query = query.filter(Student.class_name == class_name)
    if status:
        query = query.filter(Student.status == status)
    if channel:
        query = query.filter(Student.channel == channel)

    total = query.count()
    items = (
        query.order_by(desc(Student.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return StudentListResponse(
        items=build_students_response_batch(db, items),
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


# ==================== 直播展示系统集成 ====================

# 最近变更的学员（供直播展示系统轮询）
# 注意：此路由必须在 /{student_id} 之前，否则会被路径参数捕获
@router.get("/recent-changes")
def get_recent_changes(
    since: str = Query(..., description="ISO 格式时间戳，如 2026-05-11T00:00:00"),
    limit: int = Query(50, ge=1, le=200, description="最大返回数量"),
    db: DBSession = Depends(get_db),
):
    """
    返回指定时间之后创建或更新的学员列表。
    直播展示系统每 1-2 秒轮询此接口获取增量数据。
    """
    try:
        since_dt = datetime.fromisoformat(since)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"无效的时间格式: {since}")

    query = db.query(Student).filter(
        or_(
            Student.created_at >= since_dt,
            Student.updated_at >= since_dt,
        )
    ).order_by(Student.updated_at.desc()).limit(limit)

    items = query.all()
    result_items = build_students_response_batch(db, items)

    return {
        "items": result_items,
        "count": len(result_items),
        "since": since,
    }


# 2. 获取单个学员
@router.get("/{student_id}", response_model=StudentResponse)
def get_student(student_id: int, db: DBSession = Depends(get_db)):
    student = get_student_or_404(db, student_id)
    return build_student_response(db, student)


# 3. 新增学员
@router.post("/", response_model=StudentResponse)
def create_student(data: StudentCreate, db: DBSession = Depends(get_db)):
    student = Student(**data.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return build_student_response(db, student)


# 4. 编辑学员
@router.put("/{student_id}", response_model=StudentResponse)
def update_student(student_id: int, data: StudentUpdate, db: DBSession = Depends(get_db)):
    student = get_student_or_404(db, student_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(student, key, value)

    db.commit()
    db.refresh(student)
    return build_student_response(db, student)


# 5. 删除学员
@router.delete("/{student_id}")
def delete_student(student_id: int, db: DBSession = Depends(get_db)):
    student = get_student_or_404(db, student_id)

    db.delete(student)
    db.commit()
    return {"detail": "删除成功", "id": student_id}


@router.put("/{student_id}/main-report", response_model=StudentResponse)
def bind_student_main_report(
    student_id: int,
    data: BindMainReportRequest,
    db: DBSession = Depends(get_db),
):
    """兼容旧接口：绑定主喜报"""
    student, report = bind_main_report_material(db, student_id, data.material_id)
    return build_student_response(db, student)


@router.delete("/{student_id}/main-report", response_model=StudentResponse)
def remove_student_main_report(student_id: int, db: DBSession = Depends(get_db)):
    """兼容旧接口：解绑主喜报"""
    student = unbind_main_report_material(db, student_id)
    return build_student_response(db, student)


# ==================== 喜报一对多管理 ====================

class AddReportRequest(BaseModel):
    material_id: int
    is_primary: bool = False


@router.post("/{student_id}/reports", response_model=StudentResponse)
def add_report_to_student(
    student_id: int,
    data: AddReportRequest,
    db: DBSession = Depends(get_db),
):
    """添加一张喜报到学生"""
    student, material = add_student_report(db, student_id, data.material_id, data.is_primary)
    return build_student_response(db, student)


@router.delete("/{student_id}/reports/{material_id}", response_model=StudentResponse)
def remove_report_from_student(
    student_id: int,
    material_id: int,
    db: DBSession = Depends(get_db),
):
    """移除学生的一张喜报"""
    student = remove_student_report(db, student_id, material_id)
    return build_student_response(db, student)


@router.put("/{student_id}/reports/{material_id}/primary", response_model=StudentResponse)
def set_report_as_primary(
    student_id: int,
    material_id: int,
    db: DBSession = Depends(get_db),
):
    """设置学生的主喜报"""
    student = set_primary_report(db, student_id, material_id)
    return build_student_response(db, student)


@router.get("/{student_id}/reports")
def list_student_reports(
    student_id: int,
    db: DBSession = Depends(get_db),
):
    """获取学生所有绑定的喜报"""
    get_student_or_404(db, student_id)
    report_materials, _ = get_student_report_materials(db, student_id)
    return {"items": report_materials, "count": len(report_materials)}


# 6. 批量导入
@router.post("/import", response_model=dict)
def import_students(students: List[StudentCreate], db: DBSession = Depends(get_db)):
    created = []
    for data in students:
        student = Student(**data.model_dump())
        db.add(student)
        created.append(student)

    db.commit()
    for s in created:
        db.refresh(s)

    return {"detail": f"成功导入 {len(created)} 名学员", "count": len(created)}


# 7. 统计概览
@router.get("/stats/overview", response_model=StudentStatsResponse)
def get_stats(db: DBSession = Depends(get_db)):
    total = db.query(Student).count()
    active = db.query(Student).filter(Student.status == "active").count()
    graduated = db.query(Student).filter(Student.status == "graduated").count()
    dropped = db.query(Student).filter(Student.status == "dropped").count()

    # 按班级统计
    class_counts = (
        db.query(Student.class_name, func.count(Student.id))
        .group_by(Student.class_name)
        .all()
    )
    classes = {name: count for name, count in class_counts if name}

    return StudentStatsResponse(
        total=total,
        active=active,
        graduated=graduated,
        dropped=dropped,
        classes=classes,
    )


# 8. AI 图片识别导入（仅识别，不入库，返回给前端确认）
@router.post("/import/ai")
async def ai_import_students(
    file: UploadFile = FastAPIFile(..., description="包含学员信息的截图"),
):
    """
    上传图片，使用豆包视觉模型识别学员信息。
    返回识别结果供前端展示和确认，不直接入库。
    """
    # 验证文件类型
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"仅支持图片文件，当前文件类型: {file.content_type}",
        )

    # 读取图片（限制 10MB）
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="图片大小不能超过 10MB")

    try:
        result = extract_students_from_image(
            image_data=content,
            content_type=file.content_type,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        print(f"[ERROR] AI import failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"AI 识别失败: {str(e)}",
        )

    return {
        "students": result["students"],
        "count": len(result["students"]),
        "raw_text": result["raw_text"],
    }


