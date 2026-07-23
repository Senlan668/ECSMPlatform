import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


RUNTIME_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RUNTIME_ROOT))

from config import settings
from main import app


class VoiceRuntimeSecurityTests(unittest.TestCase):
    tracked_settings = (
        "RUNTIME_CONTROL_TOKEN",
        "VOICE_CALLBACK_TOKEN",
        "RTC_APP_ID",
        "RTC_APP_KEY",
        "VOLC_AK",
        "VOLC_SK",
    )

    def setUp(self):
        self.original = {name: getattr(settings, name, None) for name in self.tracked_settings}
        self.client = TestClient(app)

    def tearDown(self):
        for name, value in self.original.items():
            setattr(settings, name, value)

    def test_health_reports_capability_without_exposing_configuration(self):
        settings.RTC_APP_ID = None
        settings.RTC_APP_KEY = None
        settings.VOLC_AK = None
        settings.VOLC_SK = None

        response = self.client.get("/health")

        self.assertEqual(200, response.status_code)
        self.assertFalse(response.json()["capabilities"]["rtc_token"])
        body = response.text.lower()
        self.assertNotIn("access_key", body)
        self.assertNotIn("secret", body)

    def test_control_routes_require_a_configured_matching_token(self):
        settings.RUNTIME_CONTROL_TOKEN = ""
        response = self.client.post("/getScenes", json={"room_id": "room-a", "user_id": "user-a"})
        self.assertEqual(503, response.status_code)

        settings.RUNTIME_CONTROL_TOKEN = "runtime-secret"
        response = self.client.post("/getScenes", json={"room_id": "room-a", "user_id": "user-a"})
        self.assertEqual(401, response.status_code)

        response = self.client.post(
            "/getScenes",
            headers={"X-Runtime-Token": "wrong"},
            json={"room_id": "room-a", "user_id": "user-a"},
        )
        self.assertEqual(401, response.status_code)

    def test_scene_token_uses_requested_room_and_user(self):
        settings.RUNTIME_CONTROL_TOKEN = "runtime-secret"
        settings.RTC_APP_ID = "rtc-test-app"
        settings.RTC_APP_KEY = "rtc-test-key"

        response = self.client.post(
            "/getScenes",
            headers={"X-Runtime-Token": "runtime-secret"},
            json={"room_id": "room-a", "user_id": "user-a"},
        )

        self.assertEqual(200, response.status_code)
        rtc = response.json()["Result"]["scenes"][0]["rtc"]
        self.assertEqual("rtc-test-app", rtc["AppId"])
        self.assertEqual("room-a", rtc["RoomId"])
        self.assertEqual("user-a", rtc["UserId"])
        self.assertTrue(rtc["Token"])

    def test_callback_requires_its_independent_token(self):
        settings.VOICE_CALLBACK_TOKEN = "callback-secret"
        payload = {"messages": []}

        response = self.client.post("/api/chat_callback", json=payload)
        self.assertEqual(401, response.status_code)

        response = self.client.post("/api/chat_callback?token=wrong", json=payload)
        self.assertEqual(401, response.status_code)

        response = self.client.post("/api/chat_callback?token=callback-secret", json=payload)
        self.assertEqual(200, response.status_code)
        self.assertEqual({"text": ""}, response.json())


if __name__ == "__main__":
    unittest.main()
