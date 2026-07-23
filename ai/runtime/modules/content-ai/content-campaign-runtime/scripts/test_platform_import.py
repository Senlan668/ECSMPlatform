"""
平台适配功能 — 模块导入验证脚本
验证所有新增模块能正确导入
"""
import sys
from pathlib import Path

# 确保项目根在 sys.path 中（scripts/ 的父目录是项目根）
root = Path(__file__).resolve().parent.parent
if str(root) not in sys.path:
    sys.path.insert(0, str(root))

errors = []

# Step 1: 验证平台规则
try:
    from app.data.platform_rules import (
        PLATFORM_RULES, ALL_PLATFORM_IDS, get_platform_rule, get_all_rules_summary
    )
    assert len(PLATFORM_RULES) == 5, f"期望 5 个平台，实际 {len(PLATFORM_RULES)}"
    assert set(ALL_PLATFORM_IDS) == {"xiaohongshu", "douyin", "wechat", "bilibili", "weibo"}
    
    summary = get_all_rules_summary()
    assert len(summary) == 5
    for s in summary:
        assert "id" in s and "name" in s and "system_prompt" not in s  # summary 不应暴露 prompt
    
    rule = get_platform_rule("xiaohongshu")
    assert rule.min_words == 300
    assert rule.max_words == 1000
    print("[OK] Step 1: platform_rules — 5 个平台规则加载正常")
    for s in summary:
        print(f"     {s['icon']} {s['name']}: {s['min_words']}~{s['max_words']}字, {s['recommended_ratio']}")
except Exception as e:
    errors.append(f"Step 1 FAILED: {e}")
    print(f"[FAIL] Step 1: platform_rules — {e}")

# Step 2: 验证数据模型
try:
    from app.models.platform_variant import PlatformVariant
    assert PlatformVariant.__tablename__ == "platform_variants"
    
    # 验证 __init__.py 导出
    from app.models import PlatformVariant as PV2
    assert PV2 is PlatformVariant
    print("[OK] Step 2: PlatformVariant model — 模型定义正常")
except Exception as e:
    errors.append(f"Step 2 FAILED: {e}")
    print(f"[FAIL] Step 2: PlatformVariant model — {e}")

# Step 3: 验证核心服务
try:
    from app.services.platform_adapter_service import platform_adapter_service
    assert hasattr(platform_adapter_service, "adapt_single")
    assert hasattr(platform_adapter_service, "adapt_all")
    assert hasattr(platform_adapter_service, "list_variants")
    assert hasattr(platform_adapter_service, "get_variant")
    assert hasattr(platform_adapter_service, "update_variant")
    assert hasattr(platform_adapter_service, "delete_variant")
    
    # 验证 __init__.py 导出
    from app.services import platform_adapter_service as pas2
    assert pas2 is platform_adapter_service
    print("[OK] Step 3: platform_adapter_service — 服务实例正常")
except Exception as e:
    errors.append(f"Step 3 FAILED: {e}")
    print(f"[FAIL] Step 3: platform_adapter_service — {e}")

# Step 4: 验证 API 路由
try:
    from app.api.v1.platform import router
    routes = [r.path for r in router.routes]
    assert "/platform/rules" in routes, f"缺少 /platform/rules 路由, 现有: {routes}"
    assert "/platform/adapt" in routes, "缺少 /platform/adapt 路由"
    assert "/platform/adapt-all" in routes, "缺少 /platform/adapt-all 路由"
    print(f"[OK] Step 4: platform API router — {len(routes)} 个路由注册正常")
    for r in router.routes:
        methods = ",".join(r.methods) if hasattr(r, "methods") else "?"
        print(f"     {methods:8s} /api/v1{r.path}")
except Exception as e:
    errors.append(f"Step 4 FAILED: {e}")
    print(f"[FAIL] Step 4: platform API router — {e}")

# Step 5: 验证 main.py 注册
try:
    from app.main import app
    # 检查是否注册了 platform 路由
    platform_routes = [r for r in app.routes if hasattr(r, "path") and "/platform" in str(r.path)]
    assert len(platform_routes) > 0, "main.py 中未找到 /platform 路由"
    print(f"[OK] Step 5: main.py — platform 路由已注册 ({len(platform_routes)} 条)")
except Exception as e:
    errors.append(f"Step 5 FAILED: {e}")
    print(f"[FAIL] Step 5: main.py — {e}")

# 总结
print()
if errors:
    print(f"=== 验证失败 ({len(errors)} 项) ===")
    for err in errors:
        print(f"  ✗ {err}")
    sys.exit(1)
else:
    print("=== 全部验证通过 ✅ ===")
