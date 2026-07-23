"""
销售系统喜报同步服务

通过 AiWxChat 已有 API 完成学员搜索、喜报素材上传和绑定。
"""
from __future__ import annotations

import mimetypes
import os
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import httpx

from app.core.config import settings
from app.core.runtime_context import get_runtime_identity, has_runtime_identity, resolve_static_url


class SalesSyncError(Exception):
    """销售系统同步失败。"""

    def __init__(self, status_code: int, message: str, detail: Any = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.detail = detail if detail is not None else message


class SalesSyncService:
    """封装销售系统 API 对接逻辑。"""

    def __init__(self) -> None:
        self.project_root = Path(__file__).resolve().parent.parent.parent
        self.static_root = self.project_root / "static"

    async def sync_report(
        self,
        *,
        image_url: str,
        query: Optional[str] = None,
        student_id: Optional[int] = None,
        title: Optional[str] = None,
        uploaded_by: Optional[str] = None,
    ) -> dict[str, Any]:
        """搜索或指定学员，并把本地生成图片上传到销售系统绑定为喜报。"""
        base_url = self._sales_base_url()
        image_path = self._resolve_local_image_path(image_url)
        display_title = title or self._default_title(query=query, student_id=student_id)

        async with httpx.AsyncClient(timeout=settings.sales_api_timeout) as client:
            student = None
            candidates: list[dict[str, Any]] = []

            if student_id is None:
                if not query or not query.strip():
                    raise SalesSyncError(400, "请输入学员姓名或手机号")

                students = await self._search_students(client, base_url, query.strip())
                if not students:
                    return {
                        "success": False,
                        "status": "not_found",
                        "message": "没有找到匹配的学员",
                        "candidates": [],
                    }

                exact = self._pick_exact_student(query.strip(), students)
                if exact:
                    student = exact
                elif len(students) == 1:
                    student = students[0]
                else:
                    candidates = [self._serialize_student(item) for item in students]
                    return {
                        "success": False,
                        "status": "multiple_matches",
                        "message": "找到多个匹配学员，请选择后再关联",
                        "candidates": candidates,
                    }
            else:
                student = {"id": student_id}

            material = await self._upload_report(
                client,
                base_url,
                image_path=image_path,
                student_id=int(student["id"]),
                title=display_title,
                uploaded_by=uploaded_by or settings.sales_uploaded_by,
            )

        return {
            "success": True,
            "status": "synced",
            "message": "已同步并关联到销售系统",
            "student": self._serialize_student(student),
            "material": material,
            "candidates": [],
        }

    def _sales_base_url(self) -> str:
        base_url = settings.sales_api_base_url.strip().rstrip("/")
        if not base_url:
            raise SalesSyncError(503, "销售系统地址未配置，请设置 SALES_API_BASE_URL")
        return base_url

    def _resolve_local_image_path(self, image_url: str) -> Path:
        """只允许同步本项目 /static 下的生成图片，避免任意文件读取。"""
        if not image_url:
            raise SalesSyncError(400, "缺少图片地址")

        parsed = urlparse(image_url)
        static_path = parsed.path if parsed.scheme else image_url
        if not static_path.startswith("/static/"):
            raise SalesSyncError(400, "只能同步本系统生成的静态图片")

        if has_runtime_identity():
            try:
                candidate = resolve_static_url(static_path)
                static_root = resolve_static_url("/static/placeholder").parent
            except ValueError as exception:
                raise SalesSyncError(400, "图片地址不合法") from exception
        else:
            candidate = (self.project_root / static_path.lstrip("/")).resolve()
            static_root = self.static_root.resolve()
        if os.path.commonpath([str(static_root), str(candidate)]) != str(static_root):
            raise SalesSyncError(400, "图片地址不合法")
        if not candidate.is_file():
            raise SalesSyncError(404, "生成图片文件不存在")
        return candidate

    async def _search_students(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        query: str,
    ) -> list[dict[str, Any]]:
        try:
            response = await client.get(
                f"{base_url}/api/students/list",
                params={"search": query, "page": 1, "page_size": 10},
                headers=self._headers(),
            )
        except httpx.RequestError as e:
            raise SalesSyncError(503, "无法连接销售系统", detail=str(e)) from e
        self._raise_for_response(response, fallback="搜索销售系统学员失败")
        payload = response.json()
        return payload.get("items") or []

    async def _upload_report(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        *,
        image_path: Path,
        student_id: int,
        title: str,
        uploaded_by: str,
    ) -> dict[str, Any]:
        content_type = mimetypes.guess_type(image_path.name)[0] or "image/png"
        data = {
            "category": "report",
            "title": title,
            "description": "由 AI 内容运营助手同步的喜报图片",
            "uploaded_by": uploaded_by,
            "student_id": str(student_id),
        }
        with image_path.open("rb") as fh:
            files = {"file": (image_path.name, fh, content_type)}
            try:
                response = await client.post(
                    f"{base_url}/api/materials/upload/proxy",
                    data=data,
                    files=files,
                    headers=self._headers(),
                )
            except httpx.RequestError as e:
                raise SalesSyncError(503, "无法连接销售系统", detail=str(e)) from e
        self._raise_for_response(response, fallback="上传喜报到销售系统失败")
        return response.json()

    def _headers(self) -> dict[str, str]:
        if has_runtime_identity():
            if not settings.runtime_control_token:
                raise SalesSyncError(503, "跨运行时控制令牌未配置")
            identity = get_runtime_identity()
            return {
                "X-Runtime-Token": settings.runtime_control_token,
                "X-Tenant-Id": identity.tenant_id,
            }
        if not settings.sales_api_token:
            return {}
        return {"Authorization": f"Bearer {settings.sales_api_token}"}

    def _raise_for_response(self, response: httpx.Response, *, fallback: str) -> None:
        if response.status_code < 400:
            return
        detail: Any = fallback
        try:
            payload = response.json()
            detail = payload.get("detail") or payload
        except ValueError:
            if response.text:
                detail = response.text
        raise SalesSyncError(response.status_code, fallback, detail=detail)

    def _pick_exact_student(
        self,
        query: str,
        students: list[dict[str, Any]],
    ) -> Optional[dict[str, Any]]:
        exact = [
            student
            for student in students
            if student.get("name") == query or (student.get("phone") and str(student.get("phone")) == query)
        ]
        if len(exact) == 1:
            return exact[0]
        return None

    def _serialize_student(self, student: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
        if not student:
            return None
        return {
            "id": student.get("id"),
            "name": student.get("name"),
            "phone": student.get("phone"),
            "class_name": student.get("class_name"),
            "status": student.get("status"),
        }

    def _default_title(self, *, query: Optional[str], student_id: Optional[int]) -> str:
        label = (query or "").strip() or (f"学员 {student_id}" if student_id else "未命名学员")
        return f"{label} 喜报"


sales_sync_service = SalesSyncService()
