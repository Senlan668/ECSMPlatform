"""
批量生成 API 测试脚本
测试 Phase 3.1 批量生成 + 系列一致性相关接口
"""
import asyncio
import time
import httpx

BASE_URL = "http://localhost:8000/api/v1"


async def run_batch_api_smoke():
    """测试批量生成 API"""
    async with httpx.AsyncClient(timeout=300.0) as client:
        print("=" * 60)
        print("批量生成 API 测试 (Phase 3.1)")
        print("=" * 60)

        # 1. 提交批量生成任务（系列模式）
        print("\n[1] POST /poster/batch/generate (系列模式)")
        try:
            resp = await client.post(
                f"{BASE_URL}/poster/batch/generate",
                json={
                    "mode": "custom",
                    "aspect_ratio": "3:4",
                    "color_tone": "暖色调",
                    "style_tags": ["日系清新"],
                    "series_mode": True,
                    "items": [
                        {
                            "title": "春日穿搭",
                            "subtitle": "第一集：清新碎花裙",
                            "prompt": "阳光下的樱花树旁，一个穿着碎花裙的女孩微笑"
                        },
                        {
                            "title": "春日穿搭",
                            "subtitle": "第二集：牛仔外套",
                            "prompt": "咖啡馆露台上，一个穿着牛仔外套的女孩喝咖啡"
                        },
                        {
                            "title": "春日穿搭",
                            "subtitle": "第三集：运动休闲风",
                            "prompt": "公园草坪上，一个穿运动服的女孩在慢跑"
                        }
                    ]
                },
            )
            data = resp.json()
            print(f"    状态码: {resp.status_code}")
            print(f"    成功: {data.get('success')}")
            task_id = data.get("task_id")
            print(f"    任务ID: {task_id}")
            print(f"    总数: {data.get('total_count')}")

            if not data.get("success"):
                print(f"    ❌ 创建失败: {data.get('error')}")
                return

            print("    ✅ 任务已提交")

        except Exception as e:
            print(f"    ❌ 请求失败: {e}")
            return

        # 2. 轮询查询进度
        print(f"\n[2] GET /poster/batch/{task_id}/status (轮询进度)")
        max_wait = 180  # 最多等 3 分钟
        elapsed = 0
        final_status = None

        while elapsed < max_wait:
            try:
                resp = await client.get(f"{BASE_URL}/poster/batch/{task_id}/status")
                status = resp.json()
                s = status["status"]
                sc = status["success_count"]
                fc = status["failed_count"]
                tc = status["total_count"]
                print(f"    [{elapsed:3d}s] 状态={s}  成功={sc}/{tc}  失败={fc}")

                if s in ("completed", "partial_failed", "failed"):
                    final_status = status
                    break

            except Exception as e:
                print(f"    ❌ 查询失败: {e}")

            await asyncio.sleep(5)
            elapsed += 5

        if not final_status:
            print("    ⚠️ 超时，任务未在预期时间内完成")
        else:
            print(f"\n    === 最终结果 ===")
            print(f"    状态: {final_status['status']}")
            print(f"    成功: {final_status['success_count']}/{final_status['total_count']}")
            for item in final_status.get("items", []):
                icon = "✅" if item["status"] == "success" else "❌"
                print(f"    {icon} #{item['order_index']+1} {item.get('title','')} → {item['status']}  图片: {item.get('image_url', 'N/A')}")

            # 3. 测试 ZIP 下载
            if final_status["success_count"] > 0:
                print(f"\n[3] GET /poster/batch/{task_id}/download (ZIP 下载)")
                try:
                    resp = await client.get(f"{BASE_URL}/poster/batch/{task_id}/download")
                    if resp.status_code == 200:
                        size_kb = len(resp.content) / 1024
                        print(f"    ZIP 大小: {size_kb:.1f} KB")
                        print("    ✅ 下载成功")
                    else:
                        print(f"    ❌ 状态码: {resp.status_code}")
                except Exception as e:
                    print(f"    ❌ 下载失败: {e}")

        # 4. 测试非系列模式
        print(f"\n[4] POST /poster/batch/generate (非系列模式, 2 条)")
        try:
            resp = await client.post(
                f"{BASE_URL}/poster/batch/generate",
                json={
                    "mode": "custom",
                    "aspect_ratio": "1:1",
                    "series_mode": False,
                    "items": [
                        {"prompt": "一片金黄色的麦田，远处有风车"},
                        {"prompt": "夜晚霓虹灯下的雨后街道"}
                    ]
                },
            )
            data = resp.json()
            print(f"    成功: {data.get('success')}")
            print(f"    任务ID: {data.get('task_id')}")
            if data.get("success"):
                print("    ✅ 通过")
            else:
                print(f"    ❌ 失败: {data.get('error')}")
        except Exception as e:
            print(f"    ❌ 请求失败: {e}")

        print("\n" + "=" * 60)
        print("测试完成")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_batch_api_smoke())
