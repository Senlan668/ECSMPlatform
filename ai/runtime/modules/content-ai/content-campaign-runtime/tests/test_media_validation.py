import base64

import pytest
from pydantic import ValidationError

from app.api.v1.poster import EditGenerateRequest
from app.core.media import decode_image_base64


PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"


def test_image_decoder_detects_verified_type_and_dimensions():
    image = decode_image_base64(f"data:image/png;base64,{PNG_BASE64}")

    assert image.mime_type == "image/png"
    assert image.extension == ".png"
    assert (image.width, image.height) == (1, 1)


def test_image_decoder_rejects_spoofed_data_url_type():
    with pytest.raises(ValueError, match="类型与文件内容不一致"):
        decode_image_base64(f"data:image/jpeg;base64,{PNG_BASE64}")


def test_request_model_rejects_text_disguised_as_image():
    fake_image = base64.b64encode(b"not-an-image").decode("ascii")

    with pytest.raises(ValidationError, match="图片文件内容无效"):
        EditGenerateRequest(image_base64=fake_image, edit_prompt="保留主体，替换背景")
