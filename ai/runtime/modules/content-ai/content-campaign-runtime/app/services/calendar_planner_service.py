"""
AI 智能排期引擎

输入品牌定位 + 行业 + 月份，调用 LLM 生成 30 天内容排期计划。
结合节日热点数据，确保内容类型四象限均匀分布。
"""
from __future__ import annotations

import json
import re
import uuid
import calendar
from datetime import date, datetime
from typing import Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app.data.hotspot_calendar import get_hotspot_summary
from app.services.calendar_service import calendar_service
from app.services.llm_service import llm_service


# ==================== Prompt 模板 ====================

CALENDAR_PLANNER_SYSTEM_PROMPT = """你是一位资深的内容运营策划专家，精通中国各大社交媒体平台的内容规划。

你的任务是根据品牌定位和行业，为指定月份生成一份完整的内容排期计划。

【输出要求】
请严格输出 JSON 数组，每个元素代表一条内容安排：
```json
[
  {
    "day": 3,
    "title": "内容标题",
    "content_type": "education",
    "platform": ["xiaohongshu"],
    "scheduled_time": "18:00",
    "description": "内容简要描述（1-2句话）",
    "hotspot_tag": "三八女王节",
    "priority": 3
  }
]
```

【字段说明】
- day: 该月份的日期（1-31）
- title: 有吸引力的内容标题（15字以内）
- content_type: 四选一 → education(教育干货) / grass(种草推荐) / interaction(互动话题) / brand_story(品牌故事)
- platform: 目标平台数组 → xiaohongshu / douyin / wechat / bilibili / weibo
- scheduled_time: 建议发布时间 HH:MM（根据平台特点选择最佳时间）
- description: 1-2句话描述这条内容要写什么
- hotspot_tag: 如果与节日热点相关，填写热点名称；否则留空字符串
- priority: 优先级 1-5，1 最高（热点内容优先级更高）

【规划原则】
1. 每天安排 0~2 条内容，月均 15~25 条（不要每天都排，留有弹性）
2. 内容类型四象限均匀分布：教育 ~30% / 种草 ~30% / 互动 ~20% / 品牌故事 ~20%
3. 节日热点必须利用，提前安排（如女王节提前3天发预热）
4. 平台选择要多样化，不要只选一个平台
5. 发布时间要合理：
   - 小红书/微博：12:00-14:00 / 20:00-22:00
   - 抖音：18:00-21:00
   - 公众号：7:00-9:00 / 20:00-22:00
   - B站：18:00-22:00
6. 周末可安排轻松互动类内容

只输出 JSON 数组，不要任何解释文字。"""


class CalendarPlannerService:
    """AI 智能排期引擎"""

    def __init__(self):
        pass

    def _get_llm(self):
        return llm_service.llm_fast

    async def generate_monthly_plan(
        self,
        user_id: uuid.UUID,
        brand_description: str,
        industry: str,
        year: int,
        month: int,
    ) -> Dict:
        """
        AI 生成月度内容排期计划

        Args:
            user_id: 用户 ID
            brand_description: 品牌/账号定位描述
            industry: 所属行业
            year: 年份
            month: 月份

        Returns:
            包含 plan 元数据和 events 列表的字典
        """
        year_month = f"{year}-{month:02d}"

        # 1. 获取该月热点信息
        hotspots = get_hotspot_summary(month)
        hotspot_text = self._format_hotspots(hotspots)

        # 2. 获取该月天数信息
        _, days_in_month = calendar.monthrange(year, month)
        weekday_info = self._format_weekdays(year, month, days_in_month)

        # 3. 构建 LLM Prompt
        user_prompt = f"""请为以下账号生成 {year}年{month}月的内容排期计划。

【品牌定位】
{brand_description}

【所属行业】
{industry}

【月份信息】
{year}年{month}月，共{days_in_month}天
{weekday_info}

【本月节日/热点】
{hotspot_text if hotspot_text else '本月无特殊节日热点'}

请生成 15~25 条内容安排，覆盖整个月。"""

        # 4. 调用 LLM
        messages = [
            SystemMessage(content=CALENDAR_PLANNER_SYSTEM_PROMPT),
            HumanMessage(content=user_prompt),
        ]
        response = await self._get_llm().ainvoke(messages)
        raw_content = response.content

        # 5. 解析 LLM 输出
        events_data = self._parse_llm_response(raw_content, year, month)
        if not events_data:
            raise RuntimeError("排期模型未返回有效的日历条目")

        # 6. 创建排期计划
        plan = await calendar_service.create_plan(
            user_id=user_id,
            title=f"{year}年{month}月{industry}内容计划",
            year_month=year_month,
            brand_description=brand_description,
            industry=industry,
            ai_generated=True,
        )

        # 7. 批量创建日历条目
        events = await calendar_service.batch_create_events(
            user_id=user_id,
            events_data=events_data,
            plan_id=plan.id,
        )

        return {
            "plan": calendar_service._plan_to_dict(plan),
            "events": events,
            "total": len(events),
        }

    def _format_hotspots(self, hotspots: List[Dict]) -> str:
        """格式化热点信息供 Prompt 使用"""
        if not hotspots:
            return ""
        lines = []
        for h in hotspots:
            major = "⭐重要" if h["is_major"] else ""
            tips = "、".join(h["content_tips"][:3])
            lines.append(
                f"- {h['icon']} {h['month']}月{h['day']}日 {h['name']} {major}"
                f"（建议提前{h['advance_days']}天准备，方向：{tips}）"
            )
        return "\n".join(lines)

    def _format_weekdays(self, year: int, month: int, days: int) -> str:
        """格式化该月的星期分布"""
        weekday_names = ["一", "二", "三", "四", "五", "六", "日"]
        weekends = []
        for d in range(1, days + 1):
            wd = date(year, month, d).weekday()
            if wd >= 5:  # 周六日
                weekends.append(f"{d}日(周{weekday_names[wd]})")
        return f"周末日期：{', '.join(weekends)}"

    def _parse_llm_response(self, raw: str, year: int, month: int) -> List[Dict]:
        """
        解析 LLM 输出的 JSON 数组

        容错处理：提取 JSON 块，兼容 markdown 代码块包裹
        """
        # 尝试提取 JSON 块
        json_match = re.search(r'\[[\s\S]*\]', raw)
        if not json_match:
            return []

        try:
            items = json.loads(json_match.group())
        except json.JSONDecodeError:
            return []

        # 转换为 CalendarEvent 可用的格式
        events_data = []
        _, days_in_month = calendar.monthrange(year, month)

        for item in items:
            try:
                day = int(item.get("day", 1))
                if day < 1 or day > days_in_month:
                    continue

                events_data.append({
                    "title": str(item.get("title", "未命名"))[:200],
                    "content_type": item.get("content_type", "education"),
                    "platform": item.get("platform", []),
                    "scheduled_date": date(year, month, day),
                    "scheduled_time": item.get("scheduled_time"),
                    "description": str(item.get("description", ""))[:500],
                    "hotspot_tag": item.get("hotspot_tag") or None,
                    "priority": min(max(int(item.get("priority", 3)), 1), 5),
                })
            except (ValueError, TypeError):
                continue

        return events_data


# 单例
calendar_planner_service = CalendarPlannerService()
