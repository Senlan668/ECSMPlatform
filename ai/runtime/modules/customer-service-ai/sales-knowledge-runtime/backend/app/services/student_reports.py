# -*- coding: utf-8 -*-
"""
学生喜报绑定服务（一对多版本）

绑定关系以 student_report_bindings 中间表为真相源。
每个学生可绑定多张喜报，其中一张标记为主喜报（is_primary=True）。
同一张喜报只能被一个学生绑定（互斥）。
"""
from typing import Iterable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_

from app.models.chat import Material
from app.models.student import Student
from app.models.student_report_binding import StudentReportBinding


# ==================== 序列化 ====================

def serialize_material_summary(material: Optional[Material]) -> Optional[dict]:
    """序列化素材摘要。"""
    if material is None:
        return None

    return {
        "id": material.id,
        "filename": material.filename,
        "title": material.title,
        "file_type": material.file_type,
        "category": material.category,
        "oss_key": material.oss_key,
        "created_at": material.created_at,
    }


def serialize_report_binding(material: Material, is_primary: bool) -> dict:
    """序列化单条喜报绑定信息（含 is_primary 标记）。"""
    return {
        "id": material.id,
        "filename": material.filename,
        "title": material.title,
        "file_type": material.file_type,
        "category": material.category,
        "oss_key": material.oss_key,
        "is_primary": is_primary,
        "created_at": material.created_at,
    }


def serialize_bound_student_summary(student: Student) -> dict:
    """序列化绑定学生摘要（用于素材响应）。"""
    return {"id": student.id, "name": student.name}


def serialize_material_response(material: Material, bound_students: Optional[list[Student]] = None) -> dict:
    """序列化素材响应，附带绑定学生列表。"""
    bs = bound_students or []
    return {
        "id": material.id,
        "filename": material.filename,
        "stored_name": material.stored_name,
        "file_size": material.file_size,
        "file_type": material.file_type,
        "category": material.category,
        "title": material.title,
        "description": material.description,
        "remark": material.remark,
        "tags": material.tags or [],
        "uploaded_by": material.uploaded_by,
        "download_count": material.download_count,
        "oss_key": material.oss_key,
        "source_material_id": material.source_material_id,
        "is_pre_masked": material.is_pre_masked,
        "folder_id": material.folder_id,
        # 兼容旧字段：取第一个绑定学生
        "bound_student_id": bs[0].id if bs else None,
        "bound_student_name": bs[0].name if bs else None,
        # 新字段：所有绑定学生
        "bound_students": [serialize_bound_student_summary(s) for s in bs],
        "created_at": material.created_at,
    }


def serialize_student_response(student: Student, report_materials: list[dict], primary_report: Optional[Material] = None) -> dict:
    """序列化学员响应，包含所有绑定喜报。"""
    return {
        "id": student.id,
        "name": student.name,
        "channel": student.channel,
        "job_title": student.job_title,
        "pre_salary": student.pre_salary,
        "post_salary": student.post_salary,
        "bday": student.bday,
        "city": student.city,
        "education": student.education,
        "graduation_cohort": student.graduation_cohort,
        "enroll_date": student.enroll_date,
        "graduation_date": student.graduation_date,
        "phone": student.phone,
        "douyin_order": student.douyin_order,
        "class_name": student.class_name,
        # 兼容旧字段
        "main_report_material_id": primary_report.id if primary_report else None,
        "main_report_material": serialize_material_summary(primary_report),
        # 新字段
        "report_materials": report_materials,
        "status": student.status,
        "created_at": student.created_at,
        "updated_at": student.updated_at,
    }


# ==================== 查询辅助 ====================

def get_student_or_404(db: DBSession, student_id: int) -> Student:
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="学员不存在")
    return student


def get_report_material_or_404(db: DBSession, material_id: int) -> Material:
    material = db.query(Material).filter(Material.id == material_id).first()
    if not material:
        raise HTTPException(status_code=404, detail="喜报素材不存在")
    if material.file_type == "folder":
        raise HTTPException(status_code=400, detail="不能绑定文件夹")
    if material.category != "report":
        raise HTTPException(status_code=400, detail="只能绑定喜报素材")
    return material


def get_student_report_bindings(db: DBSession, student_id: int) -> list[StudentReportBinding]:
    """获取学生所有喜报绑定记录。"""
    return (
        db.query(StudentReportBinding)
        .filter(StudentReportBinding.student_id == student_id)
        .order_by(StudentReportBinding.is_primary.desc(), StudentReportBinding.sort_order, StudentReportBinding.created_at)
        .all()
    )


def get_student_report_materials(db: DBSession, student_id: int) -> tuple[list[dict], Optional[Material]]:
    """获取学生所有绑定的喜报素材，返回 (序列化列表, 主喜报素材)。"""
    bindings = get_student_report_bindings(db, student_id)
    if not bindings:
        return [], None

    material_ids = [b.material_id for b in bindings]
    materials = db.query(Material).filter(Material.id.in_(material_ids)).all()
    mat_map = {m.id: m for m in materials}

    result = []
    primary_report = None
    for binding in bindings:
        material = mat_map.get(binding.material_id)
        if material:
            result.append(serialize_report_binding(material, binding.is_primary))
            if binding.is_primary:
                primary_report = material

    return result, primary_report


def get_student_primary_report(db: DBSession, student_id: int) -> Optional[Material]:
    """获取学生的主喜报素材。"""
    binding = (
        db.query(StudentReportBinding)
        .filter(StudentReportBinding.student_id == student_id, StudentReportBinding.is_primary.is_(True))
        .first()
    )
    if not binding:
        return None
    return db.query(Material).filter(Material.id == binding.material_id).first()


def get_material_bound_students(db: DBSession, material_id: int) -> list[Student]:
    """获取绑定了某张素材的所有学生（互斥场景下最多 1 个）。"""
    bindings = db.query(StudentReportBinding).filter(StudentReportBinding.material_id == material_id).all()
    if not bindings:
        return []
    student_ids = [b.student_id for b in bindings]
    return db.query(Student).filter(Student.id.in_(student_ids)).all()


def get_material_bound_students_map(db: DBSession, material_ids: Iterable[int]) -> dict[int, list[Student]]:
    """批量获取多张素材各自绑定的学生列表。"""
    ids = [mid for mid in material_ids if mid]
    if not ids:
        return {}

    bindings = db.query(StudentReportBinding).filter(StudentReportBinding.material_id.in_(ids)).all()
    if not bindings:
        return {}

    student_ids = list({b.student_id for b in bindings})
    students = db.query(Student).filter(Student.id.in_(student_ids)).all()
    student_map = {s.id: s for s in students}

    result: dict[int, list[Student]] = {}
    for b in bindings:
        s = student_map.get(b.student_id)
        if s:
            result.setdefault(b.material_id, []).append(s)

    return result


def build_student_response(db: DBSession, student: Student) -> dict:
    """构建完整学生响应（含所有绑定喜报）。"""
    report_materials, primary_report = get_student_report_materials(db, student.id)
    return serialize_student_response(student, report_materials, primary_report)


def build_students_response_batch(db: DBSession, students: list[Student]) -> list[dict]:
    """批量构建学生响应。"""
    if not students:
        return []

    student_ids = [s.id for s in students]

    # 批量查询所有绑定
    bindings = (
        db.query(StudentReportBinding)
        .filter(StudentReportBinding.student_id.in_(student_ids))
        .order_by(StudentReportBinding.is_primary.desc(), StudentReportBinding.sort_order)
        .all()
    )

    # 批量查素材
    material_ids = list({b.material_id for b in bindings})
    materials = db.query(Material).filter(Material.id.in_(material_ids)).all() if material_ids else []
    mat_map = {m.id: m for m in materials}

    # 按学生分组
    student_bindings: dict[int, list[StudentReportBinding]] = {}
    for b in bindings:
        student_bindings.setdefault(b.student_id, []).append(b)

    result = []
    for student in students:
        sbs = student_bindings.get(student.id, [])
        report_materials = []
        primary_report = None
        for b in sbs:
            mat = mat_map.get(b.material_id)
            if mat:
                report_materials.append(serialize_report_binding(mat, b.is_primary))
                if b.is_primary:
                    primary_report = mat
        result.append(serialize_student_response(student, report_materials, primary_report))

    return result


# ==================== 绑定操作 ====================

def add_student_report(db: DBSession, student_id: int, material_id: int, is_primary: bool = False) -> tuple[Student, Material]:
    """添加一条学生-喜报绑定。"""
    student = get_student_or_404(db, student_id)
    material = get_report_material_or_404(db, material_id)

    # 互斥校验：同一张喜报不能被多个学生绑定
    existing_binding = (
        db.query(StudentReportBinding)
        .filter(
            StudentReportBinding.material_id == material.id,
            StudentReportBinding.student_id != student.id,
        )
        .first()
    )
    if existing_binding:
        other_student = db.query(Student).filter(Student.id == existing_binding.student_id).first()
        name = other_student.name if other_student else "未知"
        raise HTTPException(status_code=409, detail=f"该喜报已关联学生「{name}」")

    # 检查是否已绑定过
    existing = (
        db.query(StudentReportBinding)
        .filter(
            StudentReportBinding.student_id == student.id,
            StudentReportBinding.material_id == material.id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="该喜报已绑定到此学生")

    # 如果设为主喜报，先取消其他主喜报
    if is_primary:
        db.query(StudentReportBinding).filter(
            StudentReportBinding.student_id == student.id,
            StudentReportBinding.is_primary.is_(True),
        ).update({"is_primary": False})

    # 如果是学生的第一条绑定，自动设为主喜报
    has_any = db.query(StudentReportBinding).filter(StudentReportBinding.student_id == student.id).first()
    if not has_any:
        is_primary = True

    binding = StudentReportBinding(
        student_id=student.id,
        material_id=material.id,
        is_primary=is_primary,
    )
    db.add(binding)

    # 同步 main_report_material_id（向后兼容）
    if is_primary:
        student.main_report_material_id = material.id

    db.commit()
    db.refresh(student)

    return student, material


def remove_student_report(db: DBSession, student_id: int, material_id: int) -> Student:
    """移除一条学生-喜报绑定。如果移除的是主喜报，自动将下一张升为主喜报。"""
    student = get_student_or_404(db, student_id)

    binding = (
        db.query(StudentReportBinding)
        .filter(
            StudentReportBinding.student_id == student.id,
            StudentReportBinding.material_id == material_id,
        )
        .first()
    )
    if not binding:
        raise HTTPException(status_code=404, detail="绑定关系不存在")

    was_primary = binding.is_primary
    db.delete(binding)

    # 如果移除的是主喜报，自动将最早绑定的下一张升为主喜报
    if was_primary:
        next_binding = (
            db.query(StudentReportBinding)
            .filter(
                StudentReportBinding.student_id == student.id,
                StudentReportBinding.material_id != material_id,
            )
            .order_by(StudentReportBinding.sort_order, StudentReportBinding.created_at)
            .first()
        )
        if next_binding:
            next_binding.is_primary = True
            student.main_report_material_id = next_binding.material_id
        else:
            student.main_report_material_id = None

    db.commit()
    db.refresh(student)
    return student


def set_primary_report(db: DBSession, student_id: int, material_id: int) -> Student:
    """设置学生的主喜报。"""
    student = get_student_or_404(db, student_id)

    binding = (
        db.query(StudentReportBinding)
        .filter(
            StudentReportBinding.student_id == student.id,
            StudentReportBinding.material_id == material_id,
        )
        .first()
    )
    if not binding:
        raise HTTPException(status_code=404, detail="绑定关系不存在")

    # 取消所有主喜报
    db.query(StudentReportBinding).filter(
        StudentReportBinding.student_id == student.id,
        StudentReportBinding.is_primary.is_(True),
    ).update({"is_primary": False})

    binding.is_primary = True
    student.main_report_material_id = material_id

    db.commit()
    db.refresh(student)
    return student


def ensure_material_not_bound(db: DBSession, material_id: int) -> None:
    """检查素材是否被任何学生绑定，如果是则阻止操作。"""
    binding = db.query(StudentReportBinding).filter(StudentReportBinding.material_id == material_id).first()
    if binding:
        student = db.query(Student).filter(Student.id == binding.student_id).first()
        name = student.name if student else "未知"
        raise HTTPException(status_code=409, detail=f"该喜报已关联学生「{name}」，请先解绑")


# ==================== 兼容旧接口 ====================

def bind_main_report_material(db: DBSession, student_id: int, material_id: int) -> tuple[Student, Material]:
    """兼容旧接口：绑定主喜报（实际调用 add_student_report 并设为主喜报）。"""
    return add_student_report(db, student_id, material_id, is_primary=True)


def unbind_main_report_material(db: DBSession, student_id: int) -> Student:
    """兼容旧接口：解绑主喜报。"""
    student = get_student_or_404(db, student_id)
    primary_binding = (
        db.query(StudentReportBinding)
        .filter(
            StudentReportBinding.student_id == student.id,
            StudentReportBinding.is_primary.is_(True),
        )
        .first()
    )
    if not primary_binding:
        student.main_report_material_id = None
        db.commit()
        db.refresh(student)
        return student

    return remove_student_report(db, student_id, primary_binding.material_id)


def get_student_main_report(db: DBSession, student: Student) -> Optional[Material]:
    """兼容旧接口：获取主喜报。"""
    return get_student_primary_report(db, student.id)


def get_material_bound_student(db: DBSession, material_id: int) -> Optional[Student]:
    """兼容旧接口：获取素材绑定的学生（返回第一个）。"""
    students = get_material_bound_students(db, material_id)
    return students[0] if students else None
