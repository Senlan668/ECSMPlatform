"""
多平台内容规则配置

定义各平台的内容规范，用于 LLM 改写时的约束条件。
每个平台包含：字数限制、推荐图片比例、语调风格、标签格式、改写 Prompt 模板。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List


@dataclass(frozen=True)
class PlatformRule:
    """单个平台的内容规则"""
    id: str                         # 平台唯一标识
    name: str                       # 平台中文名
    icon: str                       # 平台图标 emoji
    min_words: int                  # 最低字数
    max_words: int                  # 最高字数
    recommended_ratio: str          # 推荐图片比例
    tag_format: str                 # 标签格式说明
    tone: str                       # 语调风格描述
    content_features: List[str]     # 内容特点列表
    system_prompt: str              # 该平台的改写 System Prompt
    tag_prompt: str                 # 标签推荐 Prompt


# ==================== 各平台规则定义 ====================

XIAOHONGSHU = PlatformRule(
    id="xiaohongshu",
    name="小红书",
    icon="📕",
    min_words=300,
    max_words=1000,
    recommended_ratio="3:4",
    tag_format="#话题#",
    tone="种草/分享/口语化/亲切",
    content_features=[
        "开头抓眼球，用反问或感叹句",
        "多用 Emoji 点缀段落",
        "口语化表达，像跟朋友聊天",
        "善用 '救命！' '绝了！' '真的会谢' 等情绪词",
        "结尾引导互动（提问/点赞/收藏）",
        "适当使用换行和分段，增加可读性",
    ],
    system_prompt="""你是小红书10w+爆款文案写手，精通平台流量密码。

请将以下文章改写为小红书风格的笔记：

【改写规则】
1. 字数控制在 300~1000 字
2. 开头用反问、惊叹或悬念句式抓住注意力
3. 大量使用 Emoji（每 2-3 句至少一个）
4. 口语化表达，像跟闺蜜/兄弟聊天
5. 善用语气词：救命、绝了、真的会谢、姐妹们、宝子们
6. 内容要有干货，提供可操作的建议
7. 结尾引导互动：提问/点赞/收藏/关注
8. 适当分段，每段 2-4 句
9. 禁止生硬的书面语和长句

只输出改写后的文案，不要解释。""",
    tag_prompt="""为以下小红书笔记推荐 8~10 个热门话题标签。

【要求】
- 格式：#标签#（双井号格式）
- 包含 2-3 个大流量通用标签
- 包含 3-4 个垂直领域标签
- 包含 2-3 个长尾精准标签
- 每个标签不超过 10 个字

只输出标签列表，每行一个，不要编号或解释。""",
)

DOUYIN = PlatformRule(
    id="douyin",
    name="抖音",
    icon="🎵",
    min_words=50,
    max_words=300,
    recommended_ratio="16:9",
    tag_format="#话题",
    tone="短句/节奏感/口语/Hook",
    content_features=[
        "第一句必须是 Hook（悬念/冲突/反转）",
        "短句为主，节奏感强",
        "适合配合短视频口播使用",
        "口语化，去除书面语",
        "最后一句用 CTA（行动呼吁）",
    ],
    system_prompt="""你是抖音百万粉达人的文案写手。

请将以下文章改写为抖音短视频口播文案：

【改写规则】
1. 字数控制在 50~300 字（短视频配文）
2. 第一句必须是 Hook（悬念/反问/争议观点），1 秒抓住注意力
3. 全文短句为主，每句不超过 15 字
4. 口语化表达，像对着镜头说话
5. 节奏感强，适合朗读
6. 最后用 CTA 引导行动（关注/评论/转发）
7. 禁止长段落和书面语

只输出改写后的文案，不要解释。""",
    tag_prompt="""为以下抖音文案推荐 5~8 个热门话题标签。

【要求】
- 格式：#标签（单井号格式）
- 包含 1-2 个超大流量标签（百万级）
- 包含 2-3 个中流量垂直标签
- 包含 1-2 个内容精准标签
- 每个标签不超过 8 个字

只输出标签列表，每行一个，不要编号或解释。""",
)

WECHAT = PlatformRule(
    id="wechat",
    name="微信公众号",
    icon="📱",
    min_words=1000,
    max_words=5000,
    recommended_ratio="16:9",
    tag_format="无标签",
    tone="专业/深度/正式/有料",
    content_features=[
        "标题简洁有力，制造好奇心",
        "开头引入背景或痛点",
        "正文分段清晰，使用小标题",
        "观点鲜明，论据充分",
        "结尾有总结或金句",
        "语言偏正式但不生硬",
    ],
    system_prompt="""你是微信公众号头部大号的首席内容官。

请将以下文章改写为微信公众号长文：

【改写规则】
1. 字数控制在 1000~3000 字（深度长文）
2. 使用清晰的小标题分段（使用 **粗体** 标记）
3. 开头用场景/故事/数据引入，建立读者兴趣
4. 语言正式但不生硬，专业但易懂
5. 善用引用、案例、对比来增强说服力
6. 段落之间逻辑清晰，有过渡句
7. 结尾有总结、金句或思考引导
8. 禁止过度口语化和 Emoji 堆砌（可少量使用）

只输出改写后的文章，不要解释。""",
    tag_prompt="""为以下微信公众号文章推荐一个简洁的推荐语（一句话介绍文章价值）。

只输出推荐语，不要解释。""",
)

BILIBILI = PlatformRule(
    id="bilibili",
    name="B站",
    icon="📺",
    min_words=300,
    max_words=2000,
    recommended_ratio="16:9",
    tag_format="#话题#",
    tone="干货/幽默/标题党/弹幕梗",
    content_features=[
        "标题要有 '标题党' 感（但不过分）",
        "开头直入主题",
        "内容有干货，善用列表和分步骤",
        "可以用 B 站梗和互联网黑话",
        "适当幽默，拉近距离",
        "结尾引导三连（点赞/投币/收藏）",
    ],
    system_prompt="""你是 B 站百万 UP 主的文案写手，熟悉社区文化。

请将以下文章改写为 B 站专栏/视频文案风格：

【改写规则】
1. 字数控制在 300~2000 字
2. 标题要抓眼球，可适度标题党（但不离谱）
3. 开头直入主题，不要啰嗦
4. 善用列表和分步骤，干货感满满
5. 语言轻松幽默，可以用 B 站梗（一键三连、破防、绷不住、yyds）
6. 适当插入吐槽和互动引导
7. 结尾引导三连：点赞 + 投币 + 收藏 + 转发
8. 禁止过于正式的书面语

只输出改写后的文案，不要解释。""",
    tag_prompt="""为以下 B 站内容推荐 5~8 个话题标签。

【要求】
- 格式：#标签#（双井号格式）
- 包含 1-2 个 B 站热门分区标签
- 包含 2-3 个内容领域标签
- 包含 1-2 个精准标签
- 每个标签不超过 8 个字

只输出标签列表，每行一个，不要编号或解释。""",
)

WEIBO = PlatformRule(
    id="weibo",
    name="微博",
    icon="🐦",
    min_words=50,
    max_words=140,
    recommended_ratio="1:1",
    tag_format="#话题#",
    tone="精炼/热点/话题感/信息密度高",
    content_features=[
        "限制在 140 字以内",
        "信息密度高，每句话都有价值",
        "善用热点话题和 @ 互动",
        "适当使用 Emoji 做视觉分隔",
        "一句话金句容易被转发",
    ],
    system_prompt="""你是微博超级大V的运营助手。

请将以下文章改写为微博短文案：

【改写规则】
1. 严格控制在 50~140 字以内
2. 信息高度浓缩，去掉所有废话
3. 提炼核心观点，一到两句金句
4. 适当用 Emoji 做视觉分隔
5. 可以带话题引导转发讨论
6. 语言精炼有力，朗朗上口
7. 禁止长篇大论

只输出改写后的微博文案，不要解释。""",
    tag_prompt="""为以下微博内容推荐 3~5 个超话/热门话题标签。

【要求】
- 格式：#标签#（双井号格式）
- 优先选择当前热度高的话题
- 每个标签不超过 8 个字

只输出标签列表，每行一个，不要编号或解释。""",
)


# ==================== 平台规则注册表 ====================

PLATFORM_RULES: Dict[str, PlatformRule] = {
    "xiaohongshu": XIAOHONGSHU,
    "douyin": DOUYIN,
    "wechat": WECHAT,
    "bilibili": BILIBILI,
    "weibo": WEIBO,
}

# 所有支持的平台 ID 列表
ALL_PLATFORM_IDS: List[str] = list(PLATFORM_RULES.keys())


def get_platform_rule(platform_id: str) -> PlatformRule:
    """
    获取指定平台的规则配置

    Args:
        platform_id: 平台标识

    Returns:
        PlatformRule 对象

    Raises:
        ValueError: 不支持的平台
    """
    rule = PLATFORM_RULES.get(platform_id)
    if rule is None:
        supported = ", ".join(ALL_PLATFORM_IDS)
        raise ValueError(f"不支持的平台: {platform_id}，支持的平台: {supported}")
    return rule


def get_all_rules_summary() -> List[Dict]:
    """
    获取所有平台规则的摘要信息（供 API 返回）

    Returns:
        平台规则摘要列表
    """
    return [
        {
            "id": rule.id,
            "name": rule.name,
            "icon": rule.icon,
            "min_words": rule.min_words,
            "max_words": rule.max_words,
            "recommended_ratio": rule.recommended_ratio,
            "tag_format": rule.tag_format,
            "tone": rule.tone,
            "content_features": rule.content_features,
        }
        for rule in PLATFORM_RULES.values()
    ]
