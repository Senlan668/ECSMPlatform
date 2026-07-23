import pytest
from pydantic import ValidationError

from app.api.v1.batch import BatchItemInput
from app.api.v1.poster import CustomGenerateRequest, EditGenerateRequest, InpaintRequest

PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"


def test_image_generation_requests_accept_structured_long_prompts():
    long_prompt = "国风励志海报，山川云雾背景，商业海报质感。" * 45

    custom = CustomGenerateRequest(prompt=long_prompt)
    edit = EditGenerateRequest(image_base64=PNG_DATA_URL, edit_prompt=long_prompt)
    inpaint = InpaintRequest(
        image_base64=PNG_DATA_URL,
        mask_base64=PNG_DATA_URL,
        inpaint_prompt=long_prompt,
    )
    batch_item = BatchItemInput(prompt=long_prompt)

    assert custom.prompt == long_prompt
    assert edit.edit_prompt == long_prompt
    assert inpaint.inpaint_prompt == long_prompt
    assert batch_item.prompt == long_prompt


def test_image_generation_requests_still_reject_extreme_prompt_payloads():
    oversized_prompt = "过长提示词" * 1000

    with pytest.raises(ValidationError):
        CustomGenerateRequest(prompt=oversized_prompt)
