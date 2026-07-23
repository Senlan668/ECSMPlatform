import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from app.services.sales_sync_service import SalesSyncService
from app.core.runtime_context import RuntimeIdentity, reset_runtime_identity, set_runtime_identity


class FakeSalesClient:
    def __init__(self, *, students):
        self.students = students
        self.get_calls = []
        self.post_calls = []
        self.uploaded_content = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get(self, url, params=None, headers=None):
        self.get_calls.append({"url": url, "params": params, "headers": headers})
        return httpx.Response(
            200,
            json={"items": self.students, "total": len(self.students), "page": 1, "page_size": 10},
        )

    async def post(self, url, data=None, files=None, headers=None):
        filename, file_obj, content_type = files["file"]
        self.uploaded_content = file_obj.read()
        self.post_calls.append(
            {
                "url": url,
                "data": data,
                "filename": filename,
                "content_type": content_type,
                "headers": headers,
            }
        )
        return httpx.Response(
            200,
            json={
                "id": 88,
                "filename": filename,
                "category": "report",
                "bound_student_id": int(data["student_id"]),
                "bound_student_name": "张三",
            },
        )


class SalesSyncServiceTests(unittest.IsolatedAsyncioTestCase):
    def _service_with_image(self, tmp_path: Path) -> SalesSyncService:
        service = SalesSyncService()
        service.project_root = tmp_path
        service.static_root = tmp_path / "static"
        image_dir = service.static_root / "images" / "posters"
        image_dir.mkdir(parents=True)
        (image_dir / "report.png").write_bytes(b"fake-image")
        return service

    async def test_sync_report_uploads_to_matched_student_by_phone(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = self._service_with_image(Path(tmp))
            client = FakeSalesClient(students=[{"id": 12, "name": "张三", "phone": "13800138000"}])

            with patch("app.services.sales_sync_service.settings.sales_api_base_url", "http://sales.test"):
                with patch("app.services.sales_sync_service.httpx.AsyncClient", return_value=client):
                    result = await service.sync_report(
                        image_url="/static/images/posters/report.png",
                        query="13800138000",
                        uploaded_by="lee",
                    )

            self.assertTrue(result["success"])
            self.assertEqual(result["status"], "synced")
            self.assertEqual(result["student"]["id"], 12)
            self.assertEqual(client.post_calls[0]["url"], "http://sales.test/api/materials/upload/proxy")
            self.assertEqual(client.post_calls[0]["data"]["category"], "report")
            self.assertEqual(client.post_calls[0]["data"]["student_id"], "12")
            self.assertEqual(client.post_calls[0]["data"]["uploaded_by"], "lee")
            self.assertEqual(client.uploaded_content, b"fake-image")

    async def test_sync_report_returns_candidates_when_multiple_students_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = self._service_with_image(Path(tmp))
            client = FakeSalesClient(
                students=[
                    {"id": 12, "name": "张三", "phone": "13800138000"},
                    {"id": 13, "name": "张三丰", "phone": "13900139000"},
                ]
            )

            with patch("app.services.sales_sync_service.settings.sales_api_base_url", "http://sales.test"):
                with patch("app.services.sales_sync_service.httpx.AsyncClient", return_value=client):
                    result = await service.sync_report(
                        image_url="/static/images/posters/report.png",
                        query="张",
                    )

            self.assertFalse(result["success"])
            self.assertEqual(result["status"], "multiple_matches")
            self.assertEqual([item["id"] for item in result["candidates"]], [12, 13])
            self.assertEqual(client.post_calls, [])

    async def test_sync_report_forwards_trusted_tenant_context(self):
        with tempfile.TemporaryDirectory() as tmp:
            service = self._service_with_image(Path(tmp))
            image_path = Path(tmp) / "static" / "images" / "posters" / "report.png"
            client = FakeSalesClient(students=[{"id": 12, "name": "Zhang", "phone": "13800138000"}])
            identity_token = set_runtime_identity(RuntimeIdentity(
                tenant_id="tenant-a",
                subject_id="subject-1",
                subject_name="Operator",
            ))
            try:
                with patch.object(service, "_resolve_local_image_path", return_value=image_path):
                    with patch("app.services.sales_sync_service.settings.sales_api_base_url", "http://sales.test"):
                        with patch("app.services.sales_sync_service.settings.runtime_control_token", "runtime-token"):
                            with patch("app.services.sales_sync_service.httpx.AsyncClient", return_value=client):
                                result = await service.sync_report(
                                    image_url="/static/images/posters/report.png",
                                    query="13800138000",
                                )
            finally:
                reset_runtime_identity(identity_token)

            self.assertTrue(result["success"])
            self.assertEqual(client.get_calls[0]["headers"], {
                "X-Runtime-Token": "runtime-token",
                "X-Tenant-Id": "tenant-a",
            })
            self.assertEqual(client.post_calls[0]["headers"], {
                "X-Runtime-Token": "runtime-token",
                "X-Tenant-Id": "tenant-a",
            })


if __name__ == "__main__":
    unittest.main()
