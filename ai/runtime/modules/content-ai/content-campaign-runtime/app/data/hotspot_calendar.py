"""
中国营销节日热点日历数据

内置 2025-2027 主要营销节点，涵盖：
- 传统节日 / 电商大促 / 西方节日 / 网络节日 / 行业节点
每条包含：日期(月-日)、名称、分类、推荐内容方向、提前准备天数。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass(frozen=True)
class Hotspot:
    """单个热点/节日"""
    month: int                    # 月份
    day: int                      # 日期
    name: str                     # 节日名称
    category: str                 # 分类：traditional / ecommerce / western / internet / industry
    icon: str                     # Emoji 图标
    content_tips: List[str]       # 推荐内容方向
    advance_days: int = 7         # 提前几天开始提醒
    is_major: bool = False        # 是否为重大节点（大促/重大节日）


# ==================== 热点数据库 ====================

HOTSPOT_DATABASE: List[Hotspot] = [
    # ========== 一月 ==========
    Hotspot(1, 1, "元旦", "traditional", "🎉",
            ["新年flag", "年度总结", "新年穿搭"], advance_days=7, is_major=True),
    Hotspot(1, 10, "年货节", "ecommerce", "🛒",
            ["年货清单", "送礼指南", "家居好物"], advance_days=10, is_major=True),

    # ========== 二月 ==========
    Hotspot(2, 14, "情人节", "western", "💝",
            ["情侣穿搭", "礼物推荐", "约会攻略"], advance_days=10, is_major=True),
    Hotspot(2, 5, "春节(约)", "traditional", "🧧",
            ["年夜饭", "春节穿搭", "红包封面", "返乡好物"], advance_days=14, is_major=True),
    Hotspot(2, 19, "元宵节(约)", "traditional", "🏮",
            ["元宵DIY", "猜灯谜", "汤圆测评"], advance_days=5),

    # ========== 三月 ==========
    Hotspot(3, 8, "三八女王节", "ecommerce", "👑",
            ["女性力量", "自我投资", "护肤囤货"], advance_days=10, is_major=True),
    Hotspot(3, 12, "植树节", "traditional", "🌱",
            ["环保生活", "绿色消费", "可持续好物"], advance_days=3),
    Hotspot(3, 15, "消费者权益日", "industry", "⚖️",
            ["避坑指南", "真假测评", "好物甄别"], advance_days=5),

    # ========== 四月 ==========
    Hotspot(4, 1, "愚人节", "western", "🃏",
            ["反转创意", "趣味内容", "品牌互动"], advance_days=3),
    Hotspot(4, 4, "清明节", "traditional", "🍃",
            ["踏青攻略", "春日穿搭", "时令美食"], advance_days=5),
    Hotspot(4, 22, "世界地球日", "western", "🌍",
            ["环保好物", "低碳生活", "旧物改造"], advance_days=5),
    Hotspot(4, 23, "世界读书日", "western", "📚",
            ["书单推荐", "读书方法", "知识干货"], advance_days=5),

    # ========== 五月 ==========
    Hotspot(5, 1, "劳动节", "traditional", "🏖️",
            ["旅行攻略", "宅家清单", "假期穿搭"], advance_days=7, is_major=True),
    Hotspot(5, 4, "青年节", "traditional", "✊",
            ["青年态度", "职场成长", "技能学习"], advance_days=3),
    Hotspot(5, 11, "母亲节(约)", "western", "🌹",
            ["送妈妈礼物", "亲子内容", "感恩故事"], advance_days=10, is_major=True),
    Hotspot(5, 20, "520表白日", "internet", "💕",
            ["表白创意", "恋爱好物", "情侣日常"], advance_days=7, is_major=True),

    # ========== 六月 ==========
    Hotspot(6, 1, "儿童节", "traditional", "🎈",
            ["童心未泯", "母婴好物", "亲子活动"], advance_days=5),
    Hotspot(6, 7, "高考", "industry", "📝",
            ["备考技巧", "高考加油", "考生家长必看"], advance_days=7),
    Hotspot(6, 15, "父亲节(约)", "western", "👔",
            ["送爸爸礼物", "父爱表达", "男士好物"], advance_days=7),
    Hotspot(6, 18, "618大促", "ecommerce", "🛍️",
            ["必买清单", "省钱攻略", "囤货指南"], advance_days=14, is_major=True),
    Hotspot(6, 22, "端午节(约)", "traditional", "🐉",
            ["粽子测评", "端午习俗", "小长假攻略"], advance_days=5),

    # ========== 七月 ==========
    Hotspot(7, 1, "毕业季", "industry", "🎓",
            ["毕业穿搭", "租房攻略", "职场新人"], advance_days=7),
    Hotspot(7, 7, "七夕(约)", "traditional", "🎋",
            ["七夕礼物", "约会穿搭", "浪漫创意"], advance_days=10, is_major=True),

    # ========== 八月 ==========
    Hotspot(8, 8, "全民健身日", "industry", "💪",
            ["健身入门", "运动装备", "饮食搭配"], advance_days=5),
    Hotspot(8, 25, "开学季", "industry", "🎒",
            ["开学好物", "文具推荐", "宿舍改造"], advance_days=10, is_major=True),

    # ========== 九月 ==========
    Hotspot(9, 10, "教师节", "traditional", "🍎",
            ["感恩老师", "教育话题", "送教师礼物"], advance_days=5),
    Hotspot(9, 17, "中秋节(约)", "traditional", "🥮",
            ["月饼测评", "中秋礼盒", "团圆故事"], advance_days=7, is_major=True),

    # ========== 十月 ==========
    Hotspot(10, 1, "国庆节", "traditional", "🇨🇳",
            ["旅行攻略", "国庆穿搭", "爱国主题"], advance_days=7, is_major=True),
    Hotspot(10, 24, "程序员节", "internet", "💻",
            ["程序员日常", "技术分享", "极客好物"], advance_days=3),
    Hotspot(10, 31, "万圣节", "western", "🎃",
            ["万圣妆容", "派对创意", "仿妆教程"], advance_days=7),

    # ========== 十一月 ==========
    Hotspot(11, 11, "双11", "ecommerce", "🔥",
            ["必买清单", "省钱攻略", "开箱测评"], advance_days=21, is_major=True),
    Hotspot(11, 11, "光棍节", "internet", "🕯️",
            ["单身快乐", "自我提升", "一人食"], advance_days=3),
    Hotspot(11, 24, "感恩节", "western", "🦃",
            ["感恩分享", "好物感谢", "年末盘点"], advance_days=5),

    # ========== 十二月 ==========
    Hotspot(12, 12, "双12", "ecommerce", "💰",
            ["年终囤货", "礼物清单", "捡漏攻略"], advance_days=10, is_major=True),
    Hotspot(12, 22, "冬至", "traditional", "🥟",
            ["冬至习俗", "饺子汤圆", "冬季养生"], advance_days=3),
    Hotspot(12, 25, "圣诞节", "western", "🎄",
            ["圣诞穿搭", "礼物交换", "节日氛围"], advance_days=10, is_major=True),
    Hotspot(12, 31, "跨年", "traditional", "🎆",
            ["跨年仪式", "年度总结", "新年计划"], advance_days=7, is_major=True),
]


# ==================== 查询工具函数 ====================

def get_hotspots_by_month(month: int) -> List[Hotspot]:
    """
    获取指定月份的所有热点

    Args:
        month: 月份 (1-12)

    Returns:
        该月份所有热点列表，按日期排序
    """
    return sorted(
        [h for h in HOTSPOT_DATABASE if h.month == month],
        key=lambda h: h.day,
    )


def get_upcoming_hotspots(month: int, day: int, lookahead_days: int = 14) -> List[Hotspot]:
    """
    获取从指定日期起未来 N 天内的热点（跨月）

    Args:
        month: 当前月份
        day: 当前日期
        lookahead_days: 向前看几天

    Returns:
        即将到来的热点列表
    """
    from datetime import date, timedelta

    current = date(2026, month, day)
    end = current + timedelta(days=lookahead_days)

    result = []
    for h in HOTSPOT_DATABASE:
        try:
            hotspot_date = date(2026, h.month, h.day)
        except ValueError:
            continue
        if current <= hotspot_date <= end:
            result.append(h)

    return sorted(result, key=lambda h: (h.month, h.day))


def get_hotspot_summary(month: int) -> List[Dict]:
    """
    获取指定月份热点的 API 摘要格式

    Args:
        month: 月份

    Returns:
        热点摘要列表
    """
    hotspots = get_hotspots_by_month(month)
    return [
        {
            "month": h.month,
            "day": h.day,
            "name": h.name,
            "category": h.category,
            "icon": h.icon,
            "content_tips": h.content_tips,
            "advance_days": h.advance_days,
            "is_major": h.is_major,
        }
        for h in hotspots
    ]
