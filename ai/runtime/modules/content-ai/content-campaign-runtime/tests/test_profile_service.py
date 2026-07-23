import unittest
from types import SimpleNamespace

from app.services.profile_service import ProfileService


class ProfileServiceTests(unittest.TestCase):
    def test_serialize_preferences_drops_removed_image_provider(self):
        service = ProfileService()
        pref = SimpleNamespace(
            default_aspect_ratio="3:4",
            default_mode="custom",
            default_style_tag=None,
            auto_save_to_gallery=True,
            image_provider="jimeng",
            image_model_config_id=None,
            custom_api_key="legacy-key",
        )

        data = service._serialize_prefs(pref)

        self.assertIsNone(data["image_provider"])
        self.assertNotIn("custom_api_key", data)


if __name__ == "__main__":
    unittest.main()
