import unittest

from tests.test_poster_service import FakeAsyncClient, FakeResponse
from app.services.poster_service import PosterService

PNG_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
WEBP_DATA_URL = "data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAADQAQCdASoBAAEAAUAmJaACdLoB+AADsAD+8ut//NgVzXPv9//S4P0uD9Lg/9KQAAA="


class ImageModelConfigDispatchTests(unittest.IsolatedAsyncioTestCase):
    async def test_dynamic_openai_image_config_overrides_env_provider_settings(self):
        service = PosterService()
        client = FakeAsyncClient(
            post_response=FakeResponse({"data": [{"b64_json": "dynamic-image"}]}),
        )
        image_model_config = {
            "provider_type": "openai_image",
            "base_url": "https://dynamic.example.test",
            "model_name": "gpt-image-custom",
            "api_key": "dynamic-key",
        }

        from unittest.mock import patch

        with patch("app.services.poster_service.httpx.AsyncClient", return_value=client):
            image = await service._call_ai_image_api(
                "生成一张海报",
                provider_override="doubao",
                image_model_config=image_model_config,
            )

        self.assertEqual(image, "dynamic-image")
        self.assertEqual(client.post_payload["model"], "gpt-image-custom")

    async def test_dynamic_openai_image_config_uses_edits_endpoint_with_input_image(self):
        service = PosterService()
        client = FakeAsyncClient(
            post_response=FakeResponse({"data": [{"b64_json": "edited-image"}]}),
        )
        image_model_config = {
            "provider_type": "openai_image",
            "base_url": "https://dynamic.example.test",
            "model_name": "gpt-image-custom",
            "api_key": "dynamic-key",
        }

        from unittest.mock import patch

        with patch("app.services.poster_service.httpx.AsyncClient", return_value=client):
            image = await service._call_ai_image_api(
                "把日期改成 7月9日，其他保持一致",
                input_image_base64=PNG_DATA_URL,
                image_model_config=image_model_config,
            )

        self.assertEqual(image, "edited-image")
        self.assertEqual(client.post_url, "https://dynamic.example.test/v1/images/edits")
        self.assertEqual(client.post_payload["model"], "gpt-image-custom")
        self.assertEqual(client.post_payload["prompt"], "把日期改成 7月9日，其他保持一致")
        self.assertIn("image", [name for name, _ in client.post_kwargs["files"]])
        self.assertNotEqual(client.post_kwargs["headers"].get("Content-Type"), "application/json")

    async def test_dynamic_openai_image_config_sends_all_reference_images_to_edits_endpoint(self):
        service = PosterService()
        client = FakeAsyncClient(
            post_response=FakeResponse({"data": [{"b64_json": "fused-image"}]}),
        )
        image_model_config = {
            "provider_type": "openai_image",
            "base_url": "https://dynamic.example.test",
            "model_name": "gpt-image-custom",
            "api_key": "dynamic-key",
        }

        from unittest.mock import patch

        with patch("app.services.poster_service.httpx.AsyncClient", return_value=client):
            image = await service._call_ai_image_api(
                "把图1和图2融合成一张海报",
                input_images_base64=[
                    PNG_DATA_URL,
                    WEBP_DATA_URL,
                ],
                image_model_config=image_model_config,
            )

        self.assertEqual(image, "fused-image")
        self.assertEqual(client.post_url, "https://dynamic.example.test/v1/images/edits")
        image_files = [file for name, file in client.post_kwargs["files"] if name == "image"]
        self.assertEqual(len(image_files), 2)
        self.assertEqual(image_files[0][2], "image/png")
        self.assertEqual(image_files[1][2], "image/webp")


class ImageModelApiTests(unittest.TestCase):
    def test_image_model_router_is_registered(self):
        from app.main import app

        paths = {route.path for route in app.routes}

        self.assertIn("/api/v1/image-models/list", paths)


if __name__ == "__main__":
    unittest.main()
