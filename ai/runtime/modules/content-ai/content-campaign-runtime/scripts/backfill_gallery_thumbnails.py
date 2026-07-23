"""为历史作品记录补齐列表缩略图路径。"""

import argparse
import asyncio
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.core.db import async_session_factory
from app.services.gallery_service import gallery_service


async def backfill(batch_size: int) -> None:
    total_updated = 0
    total_fallback = 0

    while True:
        async with async_session_factory() as session:
            result = await gallery_service.backfill_missing_thumbnails(
                session,
                limit=batch_size,
            )
            await session.commit()

        if result["scanned_count"] == 0:
            break

        total_updated += result["updated_count"]
        total_fallback += result["fallback_count"]
        print(
            f"processed={result['scanned_count']} "
            f"updated={result['updated_count']} "
            f"fallback={result['fallback_count']}"
        )

        if result["updated_count"] == 0:
            print("No remaining records can be updated; stopping.")
            break

    print(f"done updated={total_updated} fallback={total_fallback}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill gallery thumbnails")
    parser.add_argument("--batch-size", type=int, default=200)
    args = parser.parse_args()
    asyncio.run(backfill(args.batch_size))


if __name__ == "__main__":
    main()
