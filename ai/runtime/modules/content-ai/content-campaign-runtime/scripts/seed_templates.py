"""
系统模板 Seed 脚本
在应用启动时自动检查并初始化系统模板数据
幂等操作：仅在 poster_templates 表中不存在系统模板时插入
"""
from __future__ import annotations

import asyncio
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.poster import PosterTemplate
from app.data.system_templates import SYSTEM_TEMPLATES


async def seed_system_templates(db: AsyncSession) -> int:
    """
    初始化系统模板。幂等操作。

    逻辑：
    1. 查询当前 is_system=True 的模板数量
    2. 如果已有系统模板，跳过（避免重复插入）
    3. 如果为空，批量插入所有预置模板

    Returns:
        int: 插入的模板数量（0 表示跳过）
    """
    # 检查是否已有系统模板
    count_stmt = select(func.count()).select_from(PosterTemplate).where(
        PosterTemplate.is_system == True
    )
    result = await db.execute(count_stmt)
    existing_count = result.scalar() or 0

    if existing_count > 0:
        return 0  # 已有系统模板，跳过

    # 批量插入系统模板
    now = datetime.utcnow()
    templates = []
    for tpl_data in SYSTEM_TEMPLATES:
        tpl = PosterTemplate(
            user_id=None,  # 系统模板无用户归属
            is_system=True,
            is_active=True,
            name=tpl_data["name"],
            description=tpl_data.get("description"),
            category=tpl_data.get("category"),
            style_tag=tpl_data.get("style_tag"),
            config=tpl_data.get("config", {}),
            thumbnail_url=tpl_data.get("thumbnail_url"),
            sort_order=tpl_data.get("sort_order", 0),
            use_count=0,
            created_at=now,
            updated_at=now,
        )
        templates.append(tpl)

    db.add_all(templates)
    await db.flush()
    return len(templates)


async def reseed_system_templates(db: AsyncSession) -> int:
    """
    强制重新初始化系统模板（先删除旧的，再重新插入）。
    仅用于手动维护场景。

    Returns:
        int: 插入的模板数量
    """
    # 删除现有系统模板
    del_stmt = select(PosterTemplate).where(PosterTemplate.is_system == True)
    result = await db.execute(del_stmt)
    old_templates = result.scalars().all()
    for t in old_templates:
        await db.delete(t)
    await db.flush()

    # 重新插入
    now = datetime.utcnow()
    templates = []
    for tpl_data in SYSTEM_TEMPLATES:
        tpl = PosterTemplate(
            user_id=None,
            is_system=True,
            is_active=True,
            name=tpl_data["name"],
            description=tpl_data.get("description"),
            category=tpl_data.get("category"),
            style_tag=tpl_data.get("style_tag"),
            config=tpl_data.get("config", {}),
            thumbnail_url=tpl_data.get("thumbnail_url"),
            sort_order=tpl_data.get("sort_order", 0),
            use_count=0,
            created_at=now,
            updated_at=now,
        )
        templates.append(tpl)

    db.add_all(templates)
    await db.flush()
    return len(templates)
