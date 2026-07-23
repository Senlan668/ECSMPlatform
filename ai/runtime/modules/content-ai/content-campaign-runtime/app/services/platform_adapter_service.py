"""
平台适配核心服务

负责调用 LLM 将文章改写为不同平台版本，
支持单平台改写、全平台并发改写、标签推荐等功能。
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.platform_rules import (
    PLATFORM_RULES,
    ALL_PLATFORM_IDS,
    PlatformRule,
    get_platform_rule,
    get_all_rules_summary,
)
from app.models.platform_variant import PlatformVariant
from app.services.llm_service import llm_service, LLMUsageInfo


class PlatformAdapterService:
    """
    平台适配服务

    核心能力：
    1. 单平台改写 — adapt_single()
    2. 全平台并发改写 — adapt_all()
    3. 标签推荐 — suggest_tags()
    4. 改写结果 CRUD — list / get / update / delete
    """

    # ==================== 改写核心逻辑 ====================

    async def adapt_single(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        platform_id: str,
        source_article: str,
        source_title: Optional[str] = None,
        source_thread_id: Optional[str] = None,
        include_tags: bool = True,
    ) -> Dict[str, Any]:
        """
        将文章改写为指定平台版本

        Args:
            db: 数据库会话
            user_id: 用户 ID
            platform_id: 目标平台标识
            source_article: 原始文章内容
            source_title: 原文标题（可选）
            source_thread_id: 关联工作流 ID（可选）
            include_tags: 是否同时推荐标签

        Returns:
            包含改写结果的字典
        """
        # 获取平台规则
        rule = get_platform_rule(platform_id)

        # 调用 LLM 改写
        adapted_content, adapt_usage = await self._llm_adapt(
            source_article, rule
        )

        # 清理改写结果
        adapted_content = adapted_content.strip()
        word_count = len(adapted_content)

        # 生成推荐标题
        suggested_title = await self._generate_title(
            adapted_content, rule
        )

        # 推荐标签（可选）
        suggested_tags: List[str] = []
        tag_usage = LLMUsageInfo()
        if include_tags and rule.tag_format != "无标签":
            suggested_tags, tag_usage = await self._suggest_tags(
                adapted_content, rule
            )

        # 写入数据库
        variant = PlatformVariant(
            user_id=user_id,
            source_thread_id=source_thread_id,
            source_article=source_article,
            source_title=source_title,
            platform=platform_id,
            adapted_content=adapted_content,
            suggested_title=suggested_title,
            suggested_tags=suggested_tags,
            word_count=word_count,
            image_ratio=rule.recommended_ratio,
            is_edited=False,
        )
        db.add(variant)
        await db.flush()
        await db.refresh(variant)

        return {
            "variant": self._serialize(variant),
            "usage": {
                "adapt": self._serialize_usage(adapt_usage),
                "tags": self._serialize_usage(tag_usage),
            },
            "platform_rule": {
                "id": rule.id,
                "name": rule.name,
                "min_words": rule.min_words,
                "max_words": rule.max_words,
                "word_count_ok": rule.min_words <= word_count <= rule.max_words,
            },
        }

    async def adapt_all(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        source_article: str,
        source_title: Optional[str] = None,
        source_thread_id: Optional[str] = None,
        platform_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        一键全平台改写（并发执行）

        Args:
            db: 数据库会话
            user_id: 用户 ID
            source_article: 原始文章内容
            source_title: 原文标题（可选）
            source_thread_id: 关联工作流 ID（可选）
            platform_ids: 指定平台列表（None 则改写全部平台）

        Returns:
            所有平台的改写结果
        """
        target_platforms = platform_ids or ALL_PLATFORM_IDS

        # 检查是否已存在改写结果（同一原文 + 用户）
        # 如果存在则先删除旧版本，重新生成
        if source_thread_id:
            await self._delete_by_thread(
                db, user_id=user_id, thread_id=source_thread_id
            )

        # 并发改写所有平台
        tasks = []
        for pid in target_platforms:
            tasks.append(
                self._adapt_single_no_db(
                    source_article=source_article,
                    source_title=source_title,
                    platform_id=pid,
                )
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 汇总结果，写入数据库
        variants: List[Dict[str, Any]] = []
        errors: List[Dict[str, Any]] = []

        for i, pid in enumerate(target_platforms):
            result = results[i]
            if isinstance(result, Exception):
                errors.append({"platform": pid, "error": str(result)})
                continue

            # 解包结果
            adapted_content, suggested_title, suggested_tags, rule = result
            word_count = len(adapted_content)

            variant = PlatformVariant(
                user_id=user_id,
                source_thread_id=source_thread_id,
                source_article=source_article,
                source_title=source_title,
                platform=pid,
                adapted_content=adapted_content,
                suggested_title=suggested_title,
                suggested_tags=suggested_tags,
                word_count=word_count,
                image_ratio=rule.recommended_ratio,
                is_edited=False,
            )
            db.add(variant)
            await db.flush()
            await db.refresh(variant)

            variants.append(self._serialize(variant))

        return {
            "variants": variants,
            "errors": errors,
            "total": len(variants),
            "failed": len(errors),
        }

    # ==================== CRUD 操作 ====================

    async def list_variants(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        source_thread_id: Optional[str] = None,
        platform: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """获取用户的平台适配版本列表"""
        query = select(PlatformVariant).where(
            PlatformVariant.user_id == user_id
        )

        if source_thread_id:
            query = query.where(
                PlatformVariant.source_thread_id == source_thread_id
            )
        if platform:
            query = query.where(PlatformVariant.platform == platform)

        # 统计总数
        count_query = select(func.count()).select_from(
            query.order_by(None).subquery()
        )
        total = int((await db.scalar(count_query)) or 0)

        # 分页查询
        query = query.order_by(PlatformVariant.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        rows = (await db.execute(query)).scalars().all()

        return {
            "items": [self._serialize(v) for v in rows],
            "total": total,
            "page": page,
            "page_size": page_size,
            "has_more": page * page_size < total,
        }

    async def get_variant(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        variant_id: UUID,
    ) -> Optional[Dict[str, Any]]:
        """获取单个改写版本详情"""
        variant = await self._get_owned(db, user_id=user_id, variant_id=variant_id)
        if not variant:
            return None
        return self._serialize(variant, detail=True)

    async def update_variant(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        variant_id: UUID,
        adapted_content: Optional[str] = None,
        suggested_title: Optional[str] = None,
        suggested_tags: Optional[List[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        """用户编辑改写版本"""
        variant = await self._get_owned(db, user_id=user_id, variant_id=variant_id)
        if not variant:
            return None

        if adapted_content is not None:
            variant.adapted_content = adapted_content
            variant.word_count = len(adapted_content)
        if suggested_title is not None:
            variant.suggested_title = suggested_title
        if suggested_tags is not None:
            variant.suggested_tags = suggested_tags

        variant.is_edited = True
        variant.updated_at = datetime.utcnow()
        await db.flush()

        return self._serialize(variant, detail=True)

    async def delete_variant(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        variant_id: UUID,
    ) -> bool:
        """删除单个改写版本"""
        variant = await self._get_owned(db, user_id=user_id, variant_id=variant_id)
        if not variant:
            return False

        await db.delete(variant)
        await db.flush()
        return True

    # ==================== 内部方法 ====================

    async def _llm_adapt(
        self,
        source_article: str,
        rule: PlatformRule,
    ) -> tuple[str, LLMUsageInfo]:
        """调用 LLM 改写文章"""
        from langchain_core.messages import HumanMessage, SystemMessage

        messages = [
            SystemMessage(content=rule.system_prompt),
            HumanMessage(content=f"原文内容：\n\n{source_article}"),
        ]

        response = await llm_service.llm.ainvoke(messages)
        usage = llm_service._extract_usage_info(response)

        return response.content.strip(), usage

    async def _suggest_tags(
        self,
        adapted_content: str,
        rule: PlatformRule,
    ) -> tuple[List[str], LLMUsageInfo]:
        """调用 LLM 推荐标签"""
        from langchain_core.messages import HumanMessage, SystemMessage

        messages = [
            SystemMessage(content=rule.tag_prompt),
            HumanMessage(content=f"文案内容：\n\n{adapted_content}"),
        ]

        response = await llm_service.llm_fast.ainvoke(messages)
        usage = llm_service._extract_usage_info(response, llm_service.model_fast)

        # 解析标签列表
        tags = []
        for line in response.content.strip().split("\n"):
            line = line.strip()
            if not line:
                continue
            # 去掉编号前缀（如 "1. " 或 "- "）
            line = re.sub(r"^[\d]+[\.\)]\s*", "", line)
            line = re.sub(r"^[-•]\s*", "", line)
            if line:
                tags.append(line)

        return tags[:10], usage

    async def _generate_title(
        self,
        adapted_content: str,
        rule: PlatformRule,
    ) -> str:
        """从改写后的内容提取/生成标题"""
        from langchain_core.messages import HumanMessage, SystemMessage

        prompt = f"""为以下{rule.name}文案生成一个吸引人的标题（不超过30字）。
只输出标题，不要解释。"""

        messages = [
            SystemMessage(content=prompt),
            HumanMessage(content=adapted_content[:500]),
        ]

        response = await llm_service.llm_fast.ainvoke(messages)
        title = response.content.strip()

        # 去掉可能的引号
        title = title.strip("\"'""''《》")
        return title[:200]

    async def _adapt_single_no_db(
        self,
        *,
        source_article: str,
        source_title: Optional[str],
        platform_id: str,
    ) -> tuple[str, str, List[str], PlatformRule]:
        """
        单平台改写（不写入数据库，用于并发场景）

        Returns:
            (adapted_content, suggested_title, suggested_tags, rule)
        """
        rule = get_platform_rule(platform_id)

        # 改写
        adapted_content, _ = await self._llm_adapt(source_article, rule)
        adapted_content = adapted_content.strip()

        # 生成标题
        suggested_title = await self._generate_title(adapted_content, rule)

        # 推荐标签
        suggested_tags: List[str] = []
        if rule.tag_format != "无标签":
            suggested_tags, _ = await self._suggest_tags(adapted_content, rule)

        return adapted_content, suggested_title, suggested_tags, rule

    async def _get_owned(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        variant_id: UUID,
    ) -> Optional[PlatformVariant]:
        """获取用户名下的改写版本"""
        result = await db.execute(
            select(PlatformVariant).where(
                PlatformVariant.id == variant_id,
                PlatformVariant.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def _delete_by_thread(
        self,
        db: AsyncSession,
        *,
        user_id: UUID,
        thread_id: str,
    ) -> int:
        """删除指定工作流的所有改写版本"""
        rows = (
            await db.execute(
                select(PlatformVariant).where(
                    PlatformVariant.user_id == user_id,
                    PlatformVariant.source_thread_id == thread_id,
                )
            )
        ).scalars().all()

        for row in rows:
            await db.delete(row)

        await db.flush()
        return len(rows)

    # ==================== 序列化 ====================

    def _serialize(
        self,
        variant: PlatformVariant,
        *,
        detail: bool = False,
    ) -> Dict[str, Any]:
        """将模型序列化为字典"""
        # 获取平台规则（用于附加平台信息）
        rule = PLATFORM_RULES.get(variant.platform)

        payload = {
            "id": str(variant.id),
            "platform": variant.platform,
            "platform_name": rule.name if rule else variant.platform,
            "platform_icon": rule.icon if rule else "📄",
            "adapted_content": variant.adapted_content,
            "suggested_title": variant.suggested_title,
            "suggested_tags": variant.suggested_tags or [],
            "word_count": variant.word_count,
            "image_ratio": variant.image_ratio,
            "is_edited": bool(variant.is_edited),
            "created_at": variant.created_at.isoformat() if variant.created_at else None,
            "updated_at": variant.updated_at.isoformat() if variant.updated_at else None,
        }

        if detail:
            payload.update({
                "user_id": str(variant.user_id),
                "source_thread_id": variant.source_thread_id,
                "source_article": variant.source_article,
                "source_title": variant.source_title,
            })

            # 附加字数检查信息
            if rule:
                payload["word_count_check"] = {
                    "min": rule.min_words,
                    "max": rule.max_words,
                    "ok": rule.min_words <= (variant.word_count or 0) <= rule.max_words,
                }

        return payload

    @staticmethod
    def _serialize_usage(usage: LLMUsageInfo) -> Dict[str, Any]:
        """序列化 LLM 使用信息"""
        return {
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "total_tokens": usage.total_tokens,
            "model": usage.model,
        }


# 模块级单例
platform_adapter_service = PlatformAdapterService()
