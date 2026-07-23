from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest


@pytest.mark.asyncio
async def test_single_image_api_passes_tenant_model_config_to_runtime_service():
    from app.api.v1 import image as image_api

    config = {
        "provider_type": "openai_image",
        "base_url": "https://images.example.test",
        "model_name": "tenant-image-model",
        "api_key": "tenant-key",
    }
    user = SimpleNamespace(id=uuid4())
    with patch.object(
        image_api.profile_service,
        "get_user_image_provider",
        AsyncMock(return_value=None),
    ):
        with patch.object(
            image_api.image_model_service,
            "resolve_runtime_config",
            AsyncMock(return_value=config),
        ):
            with patch.object(
                image_api.get_image_service(),
                "generate_single_image",
                AsyncMock(return_value="/static/images/generated/result.png"),
            ) as generate:
                response = await image_api.generate_image(
                    image_api.GenerateImageRequest(prompt="新品咖啡海报"),
                    current_user=user,
                    db=object(),
                )

    assert response.success is True
    assert response.model == "tenant-image-model"
    assert generate.await_args.kwargs["image_model_config"] == config


@pytest.mark.asyncio
async def test_disabling_default_image_model_also_clears_default_flag():
    from app.services.image_model_service import ImageModelService

    service = ImageModelService()
    config = SimpleNamespace(
        id=uuid4(),
        name="默认图片模型",
        provider_type="openai_image",
        base_url="https://images.example.test",
        model_name="image-v1",
        api_key="secret-key",
        description=None,
        is_active=True,
        is_default=True,
        sort_order=0,
    )
    db = SimpleNamespace(flush=AsyncMock(), refresh=AsyncMock())
    with patch.object(service, "get_config", AsyncMock(return_value=config)):
        updated = await service.update_config(
            db,
            config_id=config.id,
            data={"is_active": False},
        )

    assert updated.is_active is False
    assert updated.is_default is False
