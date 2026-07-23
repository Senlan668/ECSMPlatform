"""Strict image decoding shared by uploads and model responses."""
from __future__ import annotations

import base64
import binascii
import io
import re
from dataclasses import dataclass
from typing import Annotated

from PIL import Image, UnidentifiedImageError
from pydantic import AfterValidator

from app.core.limits import MAX_IMAGE_BASE64_CHARS, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS


SUPPORTED_IMAGE_TYPES = {
    "image/png": ("PNG", ".png"),
    "image/jpeg": ("JPEG", ".jpg"),
    "image/webp": ("WEBP", ".webp"),
}
_DATA_URL_PATTERN = re.compile(
    r"^data:(?P<mime>[-\w.+]+/[-\w.+]+);base64,(?P<data>[A-Za-z0-9+/=_\s-]+)$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class DecodedImage:
    data: bytes
    mime_type: str
    extension: str
    width: int
    height: int


def decode_image_base64(
    value: str,
    *,
    declared_content_type: str | None = None,
    max_bytes: int = MAX_IMAGE_BYTES,
) -> DecodedImage:
    """Decode and verify a PNG, JPEG, or WebP image without trusting metadata."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError("图片数据不能为空")
    if len(value) > MAX_IMAGE_BASE64_CHARS:
        raise ValueError("图片数据超过 10 MB 限制")

    normalized = value.strip()
    embedded_type: str | None = None
    match = _DATA_URL_PATTERN.fullmatch(normalized)
    if normalized.lower().startswith("data:"):
        if match is None:
            raise ValueError("图片 data URL 格式无效")
        embedded_type = match.group("mime").lower()
        encoded = match.group("data")
    else:
        encoded = normalized

    requested_type = declared_content_type.lower().strip() if declared_content_type else None
    for mime_type in (embedded_type, requested_type):
        if mime_type and mime_type not in SUPPORTED_IMAGE_TYPES:
            raise ValueError("仅支持 PNG、JPEG 和 WebP 图片")
    if embedded_type and requested_type and embedded_type != requested_type:
        raise ValueError("图片声明类型与 data URL 类型不一致")

    encoded = "".join(encoded.split())
    if len(encoded) > MAX_IMAGE_BASE64_CHARS:
        raise ValueError("图片数据超过 10 MB 限制")
    try:
        raw = base64.b64decode(encoded, altchars=b"-_", validate=True)
    except (ValueError, binascii.Error) as exception:
        raise ValueError("图片 base64 编码无效") from exception
    if not raw:
        raise ValueError("图片数据不能为空")
    if len(raw) > max_bytes:
        raise ValueError("图片文件超过 10 MB 限制")

    try:
        with Image.open(io.BytesIO(raw)) as image:
            image_format = (image.format or "").upper()
            width, height = image.size
            if width <= 0 or height <= 0 or width * height > MAX_IMAGE_PIXELS:
                raise ValueError("图片像素尺寸超过限制")
            image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError) as exception:
        raise ValueError("图片文件内容无效") from exception

    detected_type = next(
        (mime for mime, (fmt, _) in SUPPORTED_IMAGE_TYPES.items() if fmt == image_format),
        None,
    )
    if detected_type is None:
        raise ValueError("仅支持 PNG、JPEG 和 WebP 图片")
    if embedded_type and embedded_type != detected_type:
        raise ValueError("图片 data URL 类型与文件内容不一致")
    if requested_type and requested_type != detected_type:
        raise ValueError("图片声明类型与文件内容不一致")

    return DecodedImage(
        data=raw,
        mime_type=detected_type,
        extension=SUPPORTED_IMAGE_TYPES[detected_type][1],
        width=width,
        height=height,
    )


def validate_image_base64(value: str) -> str:
    decode_image_base64(value)
    return value


ImageBase64 = Annotated[str, AfterValidator(validate_image_base64)]
