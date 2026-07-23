import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from app.services.gallery_service import GalleryService


class FakeScalarResult:
    def __init__(self, records):
        self.records = records

    def scalars(self):
        return self

    def all(self):
        return self.records


class GalleryThumbnailBackfillTests(unittest.IsolatedAsyncioTestCase):
    async def test_backfill_only_generates_missing_thumbnail_urls(self):
        service = GalleryService()
        missing = SimpleNamespace(
            image_url="/static/images/posters/missing.png",
            thumbnail_url=None,
        )
        existing = SimpleNamespace(
            image_url="/static/images/posters/existing.png",
            thumbnail_url="/static/images/posters/thumbnails/existing_thumb.png",
        )
        db = SimpleNamespace(
            execute=AsyncMock(return_value=FakeScalarResult([missing, existing])),
            flush=AsyncMock(),
        )
        service.generate_thumbnail = Mock(
            return_value="/static/images/posters/thumbnails/missing_thumb.png"
        )

        result = await service.backfill_missing_thumbnails(db, limit=100)

        self.assertEqual(
            missing.thumbnail_url,
            "/static/images/posters/thumbnails/missing_thumb.png",
        )
        self.assertEqual(
            existing.thumbnail_url,
            "/static/images/posters/thumbnails/existing_thumb.png",
        )
        service.generate_thumbnail.assert_called_once_with(missing.image_url)
        self.assertEqual(result["updated_count"], 1)
        db.flush.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
