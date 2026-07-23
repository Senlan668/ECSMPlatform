"""数据库迁移脚本：为个人中心和品牌包功能添加新表和字段"""
import asyncio
from app.core.db import engine
from sqlalchemy import text


async def migrate():
    async with engine.begin() as conn:
        # 1. User 表新增字段
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500)"))
        print("OK: users.avatar_url")
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(50)"))
        print("OK: users.nickname")
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(200)"))
        print("OK: users.bio")

        # 2. PosterTemplate 新字段
        await conn.execute(text("ALTER TABLE poster_templates ADD COLUMN IF NOT EXISTS source_generation_id UUID"))
        print("OK: poster_templates.source_generation_id")
        await conn.execute(text("ALTER TABLE poster_templates ADD COLUMN IF NOT EXISTS use_count INTEGER DEFAULT 0"))
        print("OK: poster_templates.use_count")

        # 3. StyleTag 新字段
        await conn.execute(text("ALTER TABLE style_tags ADD COLUMN IF NOT EXISTS user_id UUID"))
        print("OK: style_tags.user_id")

        # 4. UserPreference 表
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS user_preferences (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL UNIQUE REFERENCES users(id),
                default_aspect_ratio VARCHAR(20) DEFAULT '3:4',
                default_style_tag VARCHAR(50),
                default_mode VARCHAR(30) DEFAULT 'custom',
                auto_save_to_gallery BOOLEAN DEFAULT TRUE,
                custom_api_key VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        print("OK: user_preferences table")

        # 5. BrandKit 表
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS brand_kits (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id UUID NOT NULL UNIQUE REFERENCES users(id),
                brand_name VARCHAR(100),
                logo_url VARCHAR(500),
                colors JSONB,
                font_style VARCHAR(50),
                tone VARCHAR(50),
                tone_prompt TEXT,
                banned_words JSONB,
                extra JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        """))
        print("OK: brand_kits table")

    await engine.dispose()
    print("All migrations done!")


if __name__ == "__main__":
    asyncio.run(migrate())
