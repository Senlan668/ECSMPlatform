"""Resolve the trusted platform subject to a tenant-local shadow user."""
from __future__ import annotations

import hashlib

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.config import settings
from app.core.runtime_context import get_runtime_identity, platform_user_id
from app.models.user import User


async def get_current_user(
    db: AsyncSession = Depends(get_async_session),
) -> User:
    identity = get_runtime_identity()
    user_id = platform_user_id(identity)
    configured_admins = {
        name.strip().lower()
        for name in settings.admin_usernames.split(",")
        if name.strip()
    }
    should_be_admin = identity.subject_username.lower() in configured_admins
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        subject_hash = hashlib.sha256(identity.subject_id.encode("utf-8")).hexdigest()[:32]
        user = User(
            id=user_id,
            username=f"platform-{subject_hash}",
            password_hash="!managed-by-core-control-plane!",
            nickname=identity.subject_name,
            is_admin=should_be_admin,
            is_active=True,
        )
        db.add(user)
        await db.flush()
    elif user.nickname != identity.subject_name or bool(getattr(user, "is_admin", False)) != should_be_admin:
        user.nickname = identity.subject_name
        user.is_admin = should_be_admin
        await db.flush()

    return user


async def get_current_user_optional(
    db: AsyncSession = Depends(get_async_session),
) -> User:
    # The runtime has no anonymous mode. Keep this dependency name for the
    # original APIs that previously accepted an optional legacy JWT.
    return await get_current_user(db)
