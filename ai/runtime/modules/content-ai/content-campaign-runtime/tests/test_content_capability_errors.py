from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from app.core.errors import CapabilityUnavailableError


@pytest.mark.asyncio
async def test_calendar_keeps_missing_llm_as_capability_error():
    from app.api.v1 import calendar as calendar_api

    request = calendar_api.GeneratePlanRequest(
        brand_description="面向新手卖家的电商运营品牌",
        industry="电商",
        year=2026,
        month=8,
    )
    unavailable = CapabilityUnavailableError("llm", "模型未配置")
    with patch.object(
        calendar_api.calendar_planner_service,
        "generate_monthly_plan",
        AsyncMock(side_effect=unavailable),
    ):
        with pytest.raises(CapabilityUnavailableError):
            await calendar_api.generate_plan(
                request,
                current_user=SimpleNamespace(id=uuid4()),
            )


@pytest.mark.asyncio
async def test_platform_adapter_keeps_missing_llm_as_capability_error():
    from app.api.v1 import platform as platform_api

    request = platform_api.AdaptSingleRequest(
        platform_id="xiaohongshu",
        source_article="这是一段足够长的待适配电商内容，用于验证模型未配置时的错误语义。",
    )
    unavailable = CapabilityUnavailableError("llm", "模型未配置")
    with patch.object(
        platform_api.platform_adapter_service,
        "adapt_single",
        AsyncMock(side_effect=unavailable),
    ):
        with pytest.raises(CapabilityUnavailableError):
            await platform_api.adapt_single_platform(
                request,
                current_user=SimpleNamespace(id=uuid4()),
                db=object(),
            )
