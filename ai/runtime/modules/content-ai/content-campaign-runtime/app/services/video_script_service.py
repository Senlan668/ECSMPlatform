"""
视频脚本生成服务
使用 DeepSeek LLM 生成 + Tavily 搜索增强
支持多种视频模板类型
"""
import json
import re
from typing import Optional

from app.services.llm_service import llm_service
from app.services.tavily_service import tavily_service


# ============== 干货技能卡 Prompt (Data-Driven UI V3) ==============
KNOWLEDGE_SCRIPT_PROMPT = """你是一位顶级短视频编剧，也是一位结构化 UI 设计师。你的任务是将复杂的内容转化为极简的“组件抽认卡”演示流。

## 任务
根据主题，生成一个 60~90 秒的干货段视频脚本，包含具体的界面排版指令（组件驱动）。

{search_context}

## 输出格式
严格输出 JSON，不要包含任何其他文字：

```json
{{
  "themeColor": "HEX色值 (如 #818cf8、#34d399，代表本视频的主题点缀色)",
  "title": "视频主标题",
  "scenes": [
    {{
      "layoutType": "TitleCard",
      "narration": "开场旁白语音（制造悬念和痛点，必看理由）",
      "audioDuration": 5,
      "themeColor": "此场景的主题色（可以继承外层）",
      "content": {{
        "headline": "屏幕中央巨大粗体标题（极简，不超过8字）",
        "subhead": "副标题修饰（全大写英文字母或简短标语）"
      }}
    }},
    {{
      "layoutType": "SplitScreen",
      "narration": "第一段口语化解说旁白",
      "audioDuration": 8,
      "themeColor": "此场景的主色",
      "content": {{
        "title": "分屏右侧的段落标题",
        "keywords": ["关键词1", "关键词2", "关键词3"]
      }}
    }},
    {{
      "layoutType": "BulletPointsCard",
      "narration": "第二段口语化解说...",
      "audioDuration": 8,
      "content": {{
        "title": "要点总结标题",
        "points": ["核心要点一（短句）", "核心要点二", "核心要点三"]
      }}
    }},
    {{
      "layoutType": "TitleCard",
      "narration": "结尾号召动作（点赞关注等）",
      "audioDuration": 4,
      "content": {{
        "headline": "行动号召极简大字",
        "subhead": "SUBSCRIBE"
      }}
    }}
  ]
}}
```

## 爆款脚本法则
1. **开场3秒定生死**：大字报(TitleCard) 必须直击痛点。
2. **场景布局组合**：建议组合套路是 `TitleCard` (开场) -> `SplitScreen` (概念) -> `BulletPointsCard` (干货归纳) -> `TitleCard` (结尾)。
3. **narration 是核心**：机器朗读用，口语化、像朋友聊天，结合真实数据。
4. **组件参数极简**：不要啰嗦，标题和要点全部短平快。"""


# ============== 数据可视化 Prompt ==============
DATA_VIZ_SCRIPT_PROMPT = """你是一位顶级数据可视化短视频编剧，擅长将数据变成吸引人的故事。

## 任务
根据主题，生成一个 60~90 秒的数据可视化短视频脚本。
脚本需要包含数字翻转、柱状图对比、数据卡片三种视觉效果。

{search_context}

## 输出格式
严格输出 JSON，不要包含任何其他文字：

```json
{{
  "title": "视频标题（15字以内，数字驱动，如'5组数据揭开行业真相'）",
  "scenes": [
    {{
      "scene_index": 0,
      "sceneType": "number_flip",
      "narration": "开场旁白（用震撼数据引入话题）",
      "sceneTitle": "核心数据指标",
      "audioDuration": 8,
      "metrics": [
        {{"label": "指标名称", "value": 1200, "suffix": "万", "color": "#818cf8"}},
        {{"label": "另一个指标", "value": 95, "suffix": "%", "color": "#34d399"}}
      ]
    }},
    {{
      "scene_index": 1,
      "sceneType": "bar_chart",
      "narration": "用对比数据讲故事（口语化，突出差异的震撼感）",
      "sceneTitle": "对比维度标题",
      "audioDuration": 10,
      "unit": "%",
      "bars": [
        {{"label": "A方案", "value": 85, "color": "#818cf8"}},
        {{"label": "B方案", "value": 42, "color": "#f97316"}},
        {{"label": "C方案", "value": 23, "color": "#ef4444"}}
      ]
    }},
    {{
      "scene_index": 2,
      "sceneType": "data_card",
      "narration": "总结关键发现和洞察",
      "sceneTitle": "关键洞察总结",
      "audioDuration": 10,
      "cards": [
        {{"icon": "📈", "title": "指标名", "value": "1,234万", "trend": "↑ 23%", "trendColor": "#34d399"}},
        {{"icon": "💰", "title": "指标名", "value": "¥8.5亿", "trend": "Top 1", "trendColor": "#818cf8"}},
        {{"icon": "🎯", "title": "指标名", "value": "96.7%", "trend": "新高", "trendColor": "#f59e0b"}}
      ]
    }},
    {{
      "scene_index": 3,
      "sceneType": "number_flip",
      "narration": "结尾总结（用数字收束，引导关注）",
      "sceneTitle": "总结数据",
      "audioDuration": 6,
      "metrics": [
        {{"label": "总结指标", "value": 100, "suffix": "%", "color": "#34d399"}}
      ]
    }}
  ],
  "total_duration_hint": 55
}}
```

## 数据可视化脚本法则
1. **数据要真实可信**：如果有搜索到的参考资料，务必使用真实数据
2. **每组数据讲一个故事**：对比要有冲击力（如"传统方法需要3天，新方法只要5分钟"）
3. **narration 是灵魂**：TTS 会朗读的内容，用对话式语气解读数据（"你能想象吗"、"换句话说"）
4. **颜色搭配**：推荐色值如 #818cf8(紫), #34d399(绿), #f97316(橙), #ef4444(红), #38bdf8(蓝), #f59e0b(黄)
5. **3~4个场景**，节奏紧凑，总时长 55~70 秒"""


# 模板 → Prompt 映射
TEMPLATE_PROMPTS = {
    "KnowledgeVideo": KNOWLEDGE_SCRIPT_PROMPT,
    "DataVizVideo": DATA_VIZ_SCRIPT_PROMPT,
}


class VideoScriptService:
    """视频脚本生成服务（DeepSeek + Tavily 搜索增强）"""

    async def generate_script(
        self,
        topic: str,
        style: Optional[str] = None,
        template: str = "KnowledgeVideo",
    ) -> dict:
        """
        根据主题和模板类型生成结构化视频脚本

        流程:
        1. Tavily 搜索主题相关资料
        2. 将搜索结果注入 Prompt
        3. DeepSeek 生成高质量脚本
        """
        llm_service.require_configured()
        # ===== Step 1: Tavily 搜索增强 =====
        search_context = ""
        try:
            search_result = await tavily_service.search_topic(topic, max_results=5)
            if search_result.get("success") and search_result.get("summary"):
                search_context = f"""## 参考资料（联网搜索获取的真实数据，请在脚本中引用）
{search_result['summary']}"""
                print(f"[VideoScript] Tavily 搜索成功，获得上下文 {len(search_context)} 字")
        except Exception as e:
            print(f"[VideoScript] Tavily 搜索跳过: {e}")

        # ===== Step 2: 构建消息 =====
        system_prompt_template = TEMPLATE_PROMPTS.get(template, KNOWLEDGE_SCRIPT_PROMPT)
        system_prompt = system_prompt_template.format(
            search_context=search_context if search_context else "（无额外参考资料）"
        )

        user_prompt = f"主题：{topic}"
        if style:
            user_prompt += f"\n风格：{style}"

        from langchain_core.messages import SystemMessage, HumanMessage

        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]

        # ===== Step 3: 使用平台已配置的标准内容模型生成脚本 =====
        response = await llm_service.llm.ainvoke(messages)

        content = response.content.strip()

        # 解析 JSON
        script = self._parse_script_json(content)

        print(f"[VideoScript] 生成脚本: {script.get('title', '无标题')} "
              f"({len(script.get('scenes', []))} 个场景, 模板={template})")

        return script

    def _parse_script_json(self, content: str) -> dict:
        """从 LLM 响应中提取 JSON"""
        # 尝试提取 code block 中的 JSON
        if "```" in content:
            content = re.sub(r'^.*?```(?:json)?\s*', '', content, flags=re.DOTALL)
            content = re.sub(r'\s*```.*$', '', content, flags=re.DOTALL)

        # 尝试找到 JSON 对象
        json_start = content.find('{')
        json_end = content.rfind('}')
        if json_start != -1 and json_end != -1:
            content = content[json_start:json_end + 1]

        try:
            return json.loads(content)
        except json.JSONDecodeError as e:
            print(f"[VideoScript] JSON 解析失败: {e}")
            raise ValueError("模型返回的视频脚本不是有效 JSON") from e


# 单例
video_script_service = VideoScriptService()
