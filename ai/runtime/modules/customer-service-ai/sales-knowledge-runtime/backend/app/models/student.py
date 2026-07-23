# -*- coding: utf-8 -*-
"""
学生管理数据模型
"""
from sqlalchemy import Column, Integer, String, DateTime, Index
from datetime import datetime

from .database import Base


class Student(Base):
    """学员档案表"""
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)                   # 姓名
    channel = Column(String(20), default="微信")                 # 渠道: 微信 / 抖音
    job_title = Column(String(100))                              # 岗位
    pre_salary = Column(String(50))                              # 来之前薪资
    post_salary = Column(String(50))                             # 结业薪资
    bday = Column(String(20))                                    # 出生日期
    city = Column(String(100))                                   # 城市
    education = Column(String(50))                               # 学历
    graduation_cohort = Column(String(50))                       # 毕业年份/毕业届
    enroll_date = Column(String(20))                             # 入学日期
    graduation_date = Column(String(20))                         # 出师日期（结业日期）
    phone = Column(String(20))                                   # 电话号码
    douyin_order = Column(String(100))                           # 抖音订单号
    class_name = Column(String(100))                             # 班级
    main_report_material_id = Column(Integer, index=True)        # 主喜报素材 ID
    status = Column(String(20), default="active", index=True)    # 状态: active / graduated / dropped
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        Index('idx_student_class', 'class_name'),
        Index('idx_student_channel', 'channel'),
    )
