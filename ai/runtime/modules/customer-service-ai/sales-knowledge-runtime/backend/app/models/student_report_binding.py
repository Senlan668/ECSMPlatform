# -*- coding: utf-8 -*-
"""
学生-喜报绑定关系表
支持一个学生绑定多张喜报，其中一张标记为主喜报
"""
from sqlalchemy import Column, Integer, Boolean, DateTime, Index
from datetime import datetime

from .database import Base


class StudentReportBinding(Base):
    """学生-喜报绑定关系表"""
    __tablename__ = "student_report_bindings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    student_id = Column(Integer, nullable=False, index=True)
    material_id = Column(Integer, nullable=False, index=True)
    is_primary = Column(Boolean, default=False)     # 是否主喜报
    sort_order = Column(Integer, default=0)          # 排序顺序（预留）
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index('uq_student_material', 'student_id', 'material_id', unique=True),
    )
