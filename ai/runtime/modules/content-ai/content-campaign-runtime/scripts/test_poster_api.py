"""
海报生成 API 测试脚本
测试后端 poster 相关接口的连通性
"""
import asyncio
import httpx

BASE_URL = "http://localhost:8000/api/v1"

# 生成的 1x1 黑色像素 Data URI 用于测试
TEST_IMAGE_BASE64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="

async def run_poster_api_smoke():
    """测试海报生成 API"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        print("=" * 60)
        print("海报生成 API 测试")
        print("=" * 60)

        # 1. 测试获取模板列表
        print("\n[1] GET /poster/templates")
        try:
            resp = await client.get(f"{BASE_URL}/poster/templates")
            data = resp.json()
            print(f"    状态码: {resp.status_code}")
            print(f"    模板数量: {data.get('total', 0)}")
            if data.get("templates"):
                for tpl in data["templates"]:
                    print(f"    - [{tpl['index']}] {tpl['name']} ({tpl['category']}) | {tpl['default_aspect_ratio']}")
            print("    ✅ 通过")
        except Exception as e:
            print(f"    ❌ 失败: {e}")

        # 2. 测试获取风格标签
        print("\n[2] GET /poster/style-tags")
        try:
            resp = await client.get(f"{BASE_URL}/poster/style-tags")
            data = resp.json()
            print(f"    状态码: {resp.status_code}")
            print(f"    标签数量: {data.get('total', 0)}")
            if data.get("tags"):
                for tag in data["tags"]:
                    print(f"    - {tag.get('icon', '')} {tag['name']} ({tag.get('name_en', '')})")
            print("    ✅ 通过")
        except Exception as e:
            print(f"    ❌ 失败: {e}")

        # 3. 测试获取尺寸比例
        print("\n[3] GET /poster/aspect-ratios")
        try:
            resp = await client.get(f"{BASE_URL}/poster/aspect-ratios")
            data = resp.json()
            print(f"    状态码: {resp.status_code}")
            if data.get("ratios"):
                for r in data["ratios"]:
                    print(f"    - {r['key']} ({r['label']}) {r['width']}x{r['height']}")
            print("    ✅ 通过")
        except Exception as e:
            print(f"    ❌ 失败: {e}")

        # 4. 测试自定义生成
        print("\n[4] POST /poster/generate/custom (可能需要 10-30 秒)")
        try:
            resp = await client.post(
                f"{BASE_URL}/poster/generate/custom",
                json={
                    "prompt": "一杯拿铁咖啡在木桌上，旁边有绿植，温暖的自然光",
                    "style_tags": ["日系清新"],
                    "aspect_ratio": "3:4",
                },
                timeout=120.0,
            )
            data = resp.json()
            print(f"    状态码: {resp.status_code}")
            print(f"    成功: {data.get('success')}")
            print(f"    图片URL: {data.get('image_url', 'N/A')}")
            print(f"    模式: {data.get('mode')}")
            if data.get("success"):
                print("    ✅ 通过")
            else:
                print(f"    ⚠️ 生成失败: {data.get('error', '未知错误')}")
        except Exception as e:
            print(f"    ❌ 请求失败: {e}")

        # 5. 测试以图改图
        print("\n[5] POST /poster/generate/edit (可能需要 10-30 秒)")
        try:
            resp = await client.post(
                f"{BASE_URL}/poster/generate/edit",
                json={
                    "image_base64": TEST_IMAGE_BASE64,
                    "edit_prompt": "给这张测试图加上一个红色的边框",
                    "aspect_ratio": "1:1",
                },
                timeout=120.0,
            )
            data = resp.json()
            print(f"    状态码: {resp.status_code}")
            print(f"    成功: {data.get('success')}")
            print(f"    图片URL: {data.get('image_url', 'N/A')}")
            print(f"    模式: {data.get('mode')}")
            if data.get("success"):
                print("    ✅ 通过")
            else:
                print(f"    ⚠️ 生成失败: {data.get('error', '未知错误')}")
        except Exception as e:
            print(f"    ❌ 请求失败: {e}")

        # 6. 测试风格迁移
        print("\n[6] POST /poster/generate/style-transfer (可能需要 10-30 秒)")
        try:
            resp = await client.post(
                f"{BASE_URL}/poster/generate/style-transfer",
                json={
                    "image_base64": TEST_IMAGE_BASE64,
                    "style_tags": ["赛博朋克"],
                    "strength": "strong",
                    "aspect_ratio": "16:9",
                },
                timeout=120.0,
            )
            data = resp.json()
            print(f"    状态码: {resp.status_code}")
            print(f"    成功: {data.get('success')}")
            print(f"    图片URL: {data.get('image_url', 'N/A')}")
            print(f"    模式: {data.get('mode')}")
            if data.get("success"):
                print("    ✅ 通过")
            else:
                print(f"    ⚠️ 生成失败: {data.get('error', '未知错误')}")
        except Exception as e:
            print(f"    ❌ 请求失败: {e}")

        print("\n" + "=" * 60)
        print("测试完成")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_poster_api_smoke())
