"""
提示词收藏服务层
负责 Prompt 片段的 CRUD、公共发布、Fork、引用计数
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prompt import PromptSnippet


class PromptService:
    """提示词收藏服务"""

    # =====================================================
    # 查询
    # =====================================================
    async def list_prompts(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        scope: str = "mine",       # mine | public | all
        category: Optional[str] = None,
        keyword: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """
        获取提示词列表。
        scope: mine = 仅个人; public = 仅公共; all = 两者合集
        """
        stmt = select(PromptSnippet).where(PromptSnippet.is_active == True)

        if scope == "public":
            stmt = stmt.where(PromptSnippet.is_public == True)
        elif scope == "mine":
            stmt = stmt.where(
                PromptSnippet.user_id == user_id,
            )
        else:
            # all: 当前用户的 + 所有公开的
            stmt = stmt.where(
                or_(
                    PromptSnippet.user_id == user_id,
                    PromptSnippet.is_public == True,
                )
            )

        if category and category != "all":
            stmt = stmt.where(PromptSnippet.category == category)

        if keyword:
            pattern = f"%{keyword}%"
            stmt = stmt.where(
                or_(
                    PromptSnippet.title.ilike(pattern),
                    PromptSnippet.content.ilike(pattern),
                )
            )

        stmt = stmt.order_by(
            PromptSnippet.use_count.desc(),
            PromptSnippet.created_at.desc(),
        )

        result = await db.execute(stmt)
        snippets = result.scalars().all()
        return [self.serialize(s) for s in snippets]

    async def get_prompt(
        self,
        db: AsyncSession,
        *,
        prompt_id: UUID,
    ) -> Optional[PromptSnippet]:
        """按 ID 获取单条"""
        stmt = select(PromptSnippet).where(PromptSnippet.id == prompt_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    # =====================================================
    # 创建
    # =====================================================
    async def create_prompt(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        data: dict[str, Any],
    ) -> PromptSnippet:
        """创建一条提示词收藏"""
        snippet = PromptSnippet(
            user_id=user_id,
            title=data.get("title", "未命名提示词"),
            content=data.get("content", ""),
            category=data.get("category", "poster"),
            tags=data.get("tags"),
            source_mode=data.get("source_mode"),
            is_public=False,
        )
        db.add(snippet)
        await db.flush()
        await db.refresh(snippet)
        return snippet

    # =====================================================
    # 更新
    # =====================================================
    async def update_prompt(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        prompt_id: UUID,
        data: dict[str, Any],
    ) -> Optional[PromptSnippet]:
        """更新提示词（只允许编辑自己的）"""
        snippet = await self.get_prompt(db, prompt_id=prompt_id)
        if snippet is None or snippet.user_id != user_id:
            return None

        updatable = ["title", "content", "category", "tags", "source_mode"]
        for field in updatable:
            if field in data:
                setattr(snippet, field, data[field])

        snippet.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(snippet)
        return snippet

    # =====================================================
    # 删除
    # =====================================================
    async def delete_prompt(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        prompt_id: UUID,
    ) -> bool:
        """删除自己的提示词"""
        snippet = await self.get_prompt(db, prompt_id=prompt_id)
        if snippet is None or snippet.user_id != user_id:
            return False

        await db.delete(snippet)
        await db.flush()
        return True

    # =====================================================
    # 发布为公共
    # =====================================================
    async def publish_prompt(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        prompt_id: UUID,
    ) -> Optional[PromptSnippet]:
        """将个人提示词标记为公开"""
        snippet = await self.get_prompt(db, prompt_id=prompt_id)
        if snippet is None or snippet.user_id != user_id:
            return None

        snippet.is_public = True
        snippet.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(snippet)
        return snippet

    # =====================================================
    # Fork 公共提示词
    # =====================================================
    async def fork_prompt(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        prompt_id: UUID,
    ) -> Optional[PromptSnippet]:
        """复制一条公共提示词到个人收藏"""
        source = await self.get_prompt(db, prompt_id=prompt_id)
        if source is None:
            return None

        forked = PromptSnippet(
            user_id=user_id,
            title=source.title,
            content=source.content,
            category=source.category,
            tags=list(source.tags) if source.tags else None,
            source_mode=source.source_mode,
            is_public=False,
        )
        db.add(forked)
        await db.flush()
        await db.refresh(forked)
        return forked

    # =====================================================
    # 引用计数 +1
    # =====================================================
    async def increment_use_count(
        self,
        db: AsyncSession,
        *,
        prompt_id: UUID,
    ) -> None:
        """使用一次，计数 +1"""
        snippet = await self.get_prompt(db, prompt_id=prompt_id)
        if snippet:
            snippet.use_count = (snippet.use_count or 0) + 1
            await db.flush()

    # =====================================================
    # 序列化
    # =====================================================
    def serialize(self, snippet: PromptSnippet) -> dict[str, Any]:
        """将模型序列化为字典"""
        return {
            "id": str(snippet.id),
            "user_id": str(snippet.user_id) if snippet.user_id else None,
            "title": snippet.title,
            "content": snippet.content,
            "category": snippet.category,
            "tags": snippet.tags or [],
            "source_mode": snippet.source_mode,
            "is_public": snippet.is_public,
            "use_count": snippet.use_count or 0,
            "is_active": snippet.is_active,
            "created_at": snippet.created_at.isoformat() if snippet.created_at else None,
            "updated_at": snippet.updated_at.isoformat() if snippet.updated_at else None,
        }


# 模块级单例
prompt_service = PromptService()
