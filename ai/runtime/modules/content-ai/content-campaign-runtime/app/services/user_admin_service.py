"""后台用户管理服务。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional
from uuid import UUID

from sqlalchemy import asc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_password_hash
from app.models.user import User


class UsernameExistsError(Exception):
    pass


class LastActiveAdminError(Exception):
    pass


@dataclass
class UserPage:
    items: list[User]
    total: int


class UserAdminService:
    async def list_users(
        self,
        db: AsyncSession,
        *,
        keyword: str = "",
        role: Literal["all", "admin", "user"] = "all",
        status: Literal["all", "active", "inactive"] = "all",
        page: int = 1,
        page_size: int = 20,
    ) -> UserPage:
        filters = []
        keyword = keyword.strip()
        if keyword:
            filters.append(User.username.ilike(f"%{keyword}%"))
        if role == "admin":
            filters.append(User.is_admin.is_(True))
        elif role == "user":
            filters.append(User.is_admin.is_(False))
        if status == "active":
            filters.append(User.is_active.is_(True))
        elif status == "inactive":
            filters.append(User.is_active.is_(False))

        count_stmt = select(func.count(User.id)).where(*filters)
        total = int((await db.execute(count_stmt)).scalar_one())
        stmt = (
            select(User)
            .where(*filters)
            .order_by(User.is_admin.desc(), User.is_active.desc(), asc(User.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        items = list((await db.execute(stmt)).scalars().all())
        return UserPage(items=items, total=total)

    async def get_user(self, db: AsyncSession, user_id: UUID, *, for_update: bool = False) -> Optional[User]:
        stmt = select(User).where(User.id == user_id)
        if for_update:
            stmt = stmt.with_for_update()
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def create_user(self, db: AsyncSession, username: str, password: str, is_admin: bool) -> User:
        username = username.strip()
        existing = await db.execute(select(User.id).where(User.username == username))
        if existing.scalar_one_or_none() is not None:
            raise UsernameExistsError

        user = User(
            username=username,
            password_hash=get_password_hash(password),
            is_admin=is_admin,
            is_active=True,
        )
        db.add(user)
        try:
            await db.flush()
        except IntegrityError as error:
            raise UsernameExistsError from error
        return user

    async def _lock_active_admins(self, db: AsyncSession) -> list[User]:
        stmt = (
            select(User)
            .where(User.is_admin.is_(True), User.is_active.is_(True))
            .order_by(User.id)
            .with_for_update()
        )
        return list((await db.execute(stmt)).scalars().all())

    async def set_user_admin(self, db: AsyncSession, user_id: UUID, is_admin: bool) -> Optional[User]:
        active_admins = await self._lock_active_admins(db)
        user = next((item for item in active_admins if item.id == user_id), None)
        if user is None:
            user = await self.get_user(db, user_id, for_update=True)
        if user is None:
            return None
        if not is_admin and user.is_admin and user.is_active and len(active_admins) <= 1:
            raise LastActiveAdminError
        user.is_admin = is_admin
        await db.flush()
        return user

    async def set_user_status(self, db: AsyncSession, user_id: UUID, is_active: bool) -> Optional[User]:
        active_admins = await self._lock_active_admins(db)
        user = next((item for item in active_admins if item.id == user_id), None)
        if user is None:
            user = await self.get_user(db, user_id, for_update=True)
        if user is None:
            return None
        if not is_active and user.is_admin and user.is_active and len(active_admins) <= 1:
            raise LastActiveAdminError
        user.is_active = is_active
        await db.flush()
        return user

    async def reset_password(self, db: AsyncSession, user_id: UUID, password: str) -> bool:
        user = await self.get_user(db, user_id, for_update=True)
        if user is None:
            return False
        user.password_hash = get_password_hash(password)
        await db.flush()
        return True


user_admin_service = UserAdminService()
