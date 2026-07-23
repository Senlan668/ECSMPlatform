import os
import sys
import tempfile
import unittest
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient


sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.config import get_settings
from app.main import app
from app.models.database import dispose_runtime_databases
from app.models.database import reset_tenant_context, set_tenant_context
from app.services.data_generator import dispose_generators, get_generator
from app.services.filter import dispose_data_filters
from app.services.tos_service import is_current_tenant_object_key, tenant_object_key
from app.routers.export import dispose_rag_llm_tasks


class RuntimeSecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings = get_settings()
        self.original_database_url = self.settings.database_url
        self.original_control_token = self.settings.runtime_control_token
        self.settings.database_url = f"sqlite:///{Path(self.temp_dir.name) / 'knowledge.db'}"
        self.settings.runtime_control_token = "runtime-secret"
        dispose_runtime_databases()
        dispose_generators()
        dispose_data_filters()
        dispose_rag_llm_tasks()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()
        dispose_runtime_databases()
        dispose_generators()
        dispose_data_filters()
        dispose_rag_llm_tasks()
        self.settings.database_url = self.original_database_url
        self.settings.runtime_control_token = self.original_control_token
        self.temp_dir.cleanup()

    def test_health_is_public_and_does_not_expose_secrets(self):
        response = self.client.get("/health")

        self.assertEqual(200, response.status_code)
        self.assertEqual("sales-knowledge-runtime", response.json()["service"])
        self.assertNotIn("runtime-secret", response.text)

    def test_business_routes_require_control_token_and_tenant(self):
        response = self.client.get("/api/students/list")
        self.assertEqual(401, response.status_code)

        response = self.client.get(
            "/api/students/list",
            headers={"X-Runtime-Token": "runtime-secret"},
        )
        self.assertEqual(400, response.status_code)

        response = self.client.get(
            "/api/students/list",
            headers={"X-Runtime-Token": "wrong", "X-Tenant-Id": "tenant-a"},
        )
        self.assertEqual(401, response.status_code)

    def test_capabilities_are_protected_and_report_real_dependencies(self):
        unauthorized = self.client.get("/api/runtime/capabilities")
        self.assertEqual(401, unauthorized.status_code)

        response = self.client.get(
            "/api/runtime/capabilities",
            headers={"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-a"},
        )

        self.assertEqual(200, response.status_code)
        self.assertEqual("tenant_sqlite", response.json()["storage"]["mode"])
        self.assertTrue(response.json()["capabilities"]["wechat_etl"])
        self.assertFalse(response.json()["capabilities"]["rag_answer"])
        self.assertNotIn("runtime-secret", response.text)

    def test_rag_routes_fail_explicitly_without_cloud_configuration(self):
        headers = {"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-a"}

        search = self.client.post("/api/knowledge/search", headers=headers, json={"query": "课程"})
        ask = self.client.post("/api/knowledge/ask", headers=headers, json={"question": "课程是什么"})

        self.assertEqual(503, search.status_code)
        self.assertEqual(503, ask.status_code)
        self.assertIn("Embedding", search.json()["detail"])

    def test_sqlite_records_are_isolated_by_tenant(self):
        tenant_a = {"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-a"}
        tenant_b = {"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-b"}

        created = self.client.post(
            "/api/students/",
            headers=tenant_a,
            json={"name": "学员甲", "channel": "微信", "class_name": "A班"},
        )
        self.assertEqual(200, created.status_code, created.text)

        list_a = self.client.get("/api/students/list", headers=tenant_a)
        list_b = self.client.get("/api/students/list", headers=tenant_b)

        self.assertEqual(1, list_a.json()["total"])
        self.assertEqual("学员甲", list_a.json()["items"][0]["name"])
        self.assertEqual(0, list_b.json()["total"])

    def test_object_storage_keys_are_isolated_by_tenant(self):
        context = set_tenant_context("tenant-a")
        try:
            tenant_a_key = tenant_object_key("materials/course/example.pdf")
            self.assertTrue(is_current_tenant_object_key(tenant_a_key))
        finally:
            reset_tenant_context(context)

        context = set_tenant_context("tenant-b")
        try:
            tenant_b_key = tenant_object_key("materials/course/example.pdf")
            self.assertTrue(is_current_tenant_object_key(tenant_b_key))
            self.assertFalse(is_current_tenant_object_key(tenant_a_key))
        finally:
            reset_tenant_context(context)

        self.assertNotEqual(tenant_a_key, tenant_b_key)
        payload = {
            "filename": "example.pdf",
            "stored_name": "example.pdf",
            "file_size": 1,
            "file_type": "application/pdf",
            "category": "course",
            "oss_key": tenant_a_key,
        }
        rejected = self.client.post(
            "/api/materials/upload",
            headers={"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-b"},
            json=payload,
        )
        accepted = self.client.post(
            "/api/materials/upload",
            headers={"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-a"},
            json=payload,
        )

        self.assertEqual(400, rejected.status_code)
        self.assertEqual(200, accepted.status_code, accepted.text)

    def test_generated_conversation_progress_is_isolated_by_tenant(self):
        context = set_tenant_context("tenant-a")
        try:
            get_generator().progress.total = 9
            get_generator().progress.completed = 4
        finally:
            reset_tenant_context(context)

        tenant_a = {"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-a"}
        tenant_b = {"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-b"}
        progress_a = self.client.get("/api/custom/conversations/generate/progress", headers=tenant_a)
        progress_b = self.client.get("/api/custom/conversations/generate/progress", headers=tenant_b)

        self.assertEqual(9, progress_a.json()["total"])
        self.assertEqual(4, progress_a.json()["completed"])
        self.assertEqual(0, progress_b.json()["total"])
        self.assertEqual(0, progress_b.json()["completed"])

    def test_filter_configuration_is_isolated_and_can_be_cleared(self):
        tenant_a = {"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-a"}
        tenant_b = {"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-b"}

        updated = self.client.post(
            "/api/filter/config",
            headers=tenant_a,
            json={"blacklist_sessions": ["session-secret"], "spam_keywords": ["tenant-a-spam"]},
        )
        self.assertEqual(200, updated.status_code)
        self.assertEqual(["session-secret"], updated.json()["config"]["blacklist_sessions"])

        config_b = self.client.get("/api/filter/config", headers=tenant_b)
        self.assertEqual([], config_b.json()["blacklist_sessions"])
        self.assertNotIn("tenant-a-spam", config_b.json()["spam_keywords"])

        cleared = self.client.post(
            "/api/filter/config",
            headers=tenant_a,
            json={"blacklist_sessions": []},
        )
        self.assertEqual([], cleared.json()["config"]["blacklist_sessions"])

    def test_uploaded_wechat_databases_run_original_etl_for_current_tenant(self):
        source_dir = Path(self.temp_dir.name) / "source"
        source_dir.mkdir()
        micromsg = source_dir / "MicroMsg.db"
        messages = source_dir / "MSG0.db"

        connection = sqlite3.connect(micromsg)
        try:
            connection.execute(
                "CREATE TABLE Contact (UserName TEXT, Alias TEXT, NickName TEXT, Remark TEXT, SmallHeadImgUrl TEXT)"
            )
            connection.execute(
                "INSERT INTO Contact VALUES (?, ?, ?, ?, ?)",
                ("wxid_customer", "customer", "客户甲", "", ""),
            )
            connection.commit()
        finally:
            connection.close()
        connection = sqlite3.connect(messages)
        try:
            connection.execute(
                """
                CREATE TABLE MSG (
                    localId INTEGER, StrTalker TEXT, StrContent TEXT, CreateTime INTEGER,
                    Type INTEGER, SubType INTEGER, IsSender INTEGER, DisplayContent TEXT,
                    BytesExtra BLOB, MsgSvrID INTEGER
                )
                """
            )
            connection.execute(
                "INSERT INTO MSG VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (1, "wxid_customer", "课程价格是多少", 1760000000, 1, 0, 0, None, None, 1001),
            )
            connection.commit()
        finally:
            connection.close()

        tenant_a = {"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-a"}
        tenant_b = {"X-Runtime-Token": "runtime-secret", "X-Tenant-Id": "tenant-b"}
        with micromsg.open("rb") as contacts_file, messages.open("rb") as messages_file:
            response = self.client.post(
                "/api/admin/etl/upload",
                headers=tenant_a,
                files=[
                    ("files", ("MicroMsg.db", contacts_file, "application/octet-stream")),
                    ("files", ("MSG0.db", messages_file, "application/octet-stream")),
                ],
            )

        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual(1, response.json()["stats"]["messages"])
        self.assertEqual(1, self.client.get("/api/chats/sessions", headers=tenant_a).json()["total"])
        self.assertEqual(0, self.client.get("/api/chats/sessions", headers=tenant_b).json()["total"])


if __name__ == "__main__":
    unittest.main()
