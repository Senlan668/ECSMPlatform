"""通用管理员权限服务。"""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class AdminService:
    """运行时只信任数据库中的启用管理员标记。"""

    async def is_admin(self, db: AsyncSession, user: User) -> bool:
        return bool(getattr(user, "is_active", True) and getattr(user, "is_admin", False))


admin_service = AdminService()
