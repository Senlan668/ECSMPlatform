# -*- coding: utf-8 -*-
"""
RAG 知识库数据改写服务
将销售对话碎片转化为标准知识条目

v2: 增加 content_type 分类、source 推断、多维度 confidence 评分
"""
import json
import re
import hashlib
from enum import Enum
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime

from app.config import get_settings

settings = get_settings()


# ==================== 数据模型 ====================

class ContentType(str, Enum):
    """内容形态分类 — 决定数据进入哪个库"""
    KNOWLEDGE = "knowledge"    # 标准知识 → 入知识库 (事实陈述、FAQ、判定建议)
    SCRIPT = "script"          # 销售话术 → 入话术库 (推销、异议处理、成交引导)
    NOISE = "noise"            # 噪声 → 丢弃 (纯追问、打招呼、无信息量)


@dataclass
class RagEntry:
    """一条 RAG 知识条目"""
    question: str           # 标准化问题
    answer: str             # 标准化答案
    category: str           # 原始分类
    intent: str = ""        # 用户意图 (如: 课程咨询/价格咨询/学习周期)
    tags: List[str] = field(default_factory=list)    # 标签
    source: str = ""        # 来源
    confidence: float = 0.0 # 置信度 0-1
    content_type: str = ""  # 内容形态 (knowledge/script/noise)
    original_q: str = ""    # 原始问题 (留档对比)
    original_a: str = ""    # 原始答案


# ==================== 规则过滤器 ====================

# 无意义问题模式
JUNK_QUESTION_PATTERNS = [
    r'^(我是|你好|hello|hi|在吗|嗯|好的|ok|哦|哈哈)[\s\S]{0,5}$',
    r'^[.\s]*$',  # 空白
    r'^[\u4e00-\u9fa5]{1,3}$',  # 1-3字纯中文
]

# 无效答案模式
JUNK_ANSWER_PATTERNS = [
    r'^\s*$',
    r'^(好的|嗯|收到|ok)\s*$',
]

# 价格模板 (完全重复的需去重只保留一条)
PRICE_TEMPLATE = "价格这块懂王Ai经常有活动\n我得先看你合不合适带\n合适的话我推个教务老师给你\n你找他领最新优惠"

# 销售追问模式 (答案不是知识而是销售动作)
SALES_ACTION_PATTERNS = [
    r'情况介绍我看',
    r'学历.*毕业.*多久',
    r'电话发我',
    r'拉你进班',
    r'把.*电话.*发',
    r'群公告.*文档.*权限',
    r'开通课程',
    r'你先看下我的',
    r'我看你合适不',
    r'我看你.*不',
    r'消息太多',
]

# 直播引流 / 时效性内容模式
EPHEMERAL_PATTERNS = [
    r'今晚\d+点',
    r'今晚.*直播',
    r'今天.*截止',
    r'近期仅此一场',
    r'不见不散',
    r'朋友圈.*发',
    r'抖音.*直播',
    r'刚.*出.*offer',
    r'刚刚出.*offer',
    r'同学们都很忙',
    r'最近我的消息',
    r'我邀请了.*同学',
]

# 追问用户背景的模式 (不是知识)
PROBING_PATTERNS = [
    r'^(了)?有编程基础吗',
    r'^现在多少[kK]',
    r'^准备哪里找',
    r'^毕业多久了',
    r'^毕业几年了',
    r'^之前前端还是java',
    r'^你是.*统招.*吗',
    r'^你现在多少',
    r'^你.*学历',
    r'^多少k现在',
    r'^久了有编程基础吗',
    r'^了有编程基础吗',
]


def filter_rag_entries(entries: List[Dict]) -> Tuple[List[Dict], Dict]:
    """
    基础过滤: 去除无意义/重复/空数据

    Returns:
        (filtered_entries, filter_stats)
    """
    stats = {
        "input": len(entries),
        "empty_removed": 0,
        "junk_q_removed": 0,
        "short_a_removed": 0,
        "exact_dup_removed": 0,
        "price_template_deduped": 0,
        "output": 0,
    }

    filtered = []
    seen_answers = set()
    kept_price_template = False

    for entry in entries:
        q = entry.get("question", "").strip()
        a = entry.get("answer", "").strip()

        # 1. 空数据
        if not q or not a:
            stats["empty_removed"] += 1
            continue

        # 2. 无意义问题
        is_junk_q = False
        for pattern in JUNK_QUESTION_PATTERNS:
            if re.match(pattern, q, re.IGNORECASE):
                is_junk_q = True
                break
        # 以 "我是" 开头且不包含实质问题的
        if q.startswith("我是") and len(q) < 20 and "?" not in q and "？" not in q:
            is_junk_q = True
        if is_junk_q:
            stats["junk_q_removed"] += 1
            continue

        # 3. 答案太短
        if len(a) < 10:
            stats["short_a_removed"] += 1
            continue

        # 4. 价格模板去重 (只保留一条)
        if PRICE_TEMPLATE in a:
            if kept_price_template:
                stats["price_template_deduped"] += 1
                continue
            kept_price_template = True

        # 5. 答案完全去重
        a_hash = hashlib.md5(a.encode()).hexdigest()
        if a_hash in seen_answers:
            stats["exact_dup_removed"] += 1
            continue
        seen_answers.add(a_hash)

        filtered.append(entry)

    stats["output"] = len(filtered)
    return filtered, stats


# ==================== Source 推断 ====================

# 基于内容关键词的来源映射
SOURCE_RULES = [
    # (正则模式, 来源标签) — 按优先级从高到低排列
    # ---- 课程相关 (高优先级，出现频率最高) ----
    (r'录播|直播.*答疑|加密视频|播放器|群.*答疑', '课程学习方式说明'),
    (r'大纲|课程.*内容|技术栈|项目.*实战', '课程大纲文档'),
    (r'python|langchain|agent|rag|mcp|docker|serverless', '课程技术栈说明'),
    (r'(\d+个?月|周期|学完|多久)', '学习周期说明'),
    # ---- 就业相关 ----
    (r'简历|面试|模拟面试|复盘', '求职辅导手册'),
    (r'offer|拿到.*工作|入职', '学员就业案例库'),
    (r'(专科|本科).*(\d+k|\d+K)|(\d+k|\d+K).*(专科|本科)', '学员就业案例库'),
    (r'0基础.*转|零基础.*转|销售转|前端转|java转', '学员就业案例库'),
    # ---- 售后 ----
    (r'退款|退费|无理由', '售后政策手册'),
    (r'发票|报销|开票', '售后政策手册'),
    (r'设备.*绑定|加.*设备', '售后政策手册'),
    # ---- 行业分析 ----
    (r'前端.*不好找|ai.*趋势|行业.*增长|风口', '行业趋势分析'),
    (r'前端可以|能转|来得及|年龄|适合', '转行可行性分析'),
    (r'价格|优惠|活动|收费|付款', '价格与优惠政策'),
    (r'报名|开课|拍.*课程|下单', '报名流程指南'),
    (r'就业|工作|岗位|行情|薪资|找工作', '就业行情分析'),
]


def infer_source(question: str, answer: str) -> str:
    """
    基于关键词推断知识来源

    Returns:
        来源字符串，如 "课程大纲文档"
    """
    text = (question + " " + answer).lower()

    for pattern, source in SOURCE_RULES:
        if re.search(pattern, text, re.IGNORECASE):
            return source

    return "微信咨询对话"


# ==================== Content Type 分类 ====================

def classify_content_type(question: str, answer: str, category: str = "") -> str:
    """
    判定内容形态: knowledge / script / noise

    判定逻辑:
    1. 答案以追问开头 (有编程基础吗/现在多少k) 且无实质信息 → noise
    2. 答案主体是直播引流/销售推进 → script
    3. 包含事实信息 (课程内容/学习方式/技术栈/就业数据) → knowledge
    """
    a_lines = [line.strip() for line in answer.split('\n') if line.strip()]
    if not a_lines:
        return ContentType.NOISE.value

    # ---- 1. 检查是否纯追问 / 纯噪声 ----
    probing_lines = 0
    for line in a_lines:
        if any(re.match(p, line) for p in PROBING_PATTERNS):
            probing_lines += 1
    # 超过 60% 行是追问 → noise
    if len(a_lines) > 0 and probing_lines / len(a_lines) > 0.6:
        return ContentType.NOISE.value

    # ---- 2. 检查是否销售话术 ----
    sales_signals = 0
    # 直播引流
    for pattern in EPHEMERAL_PATTERNS:
        if re.search(pattern, answer):
            sales_signals += 1
    # 销售推进
    for pattern in SALES_ACTION_PATTERNS:
        if re.search(pattern, answer):
            sales_signals += 1
    # 情绪化/个性化判断
    emotional_patterns = [
        r'懒得|飘了|半瓶子|废物|送外卖|飞起来|装逼|毒打|打回原形',
        r'Tmd|尼玛|操你|傻逼|垃圾',
        r'你是真不懂事',
    ]
    for pattern in emotional_patterns:
        if re.search(pattern, answer, re.IGNORECASE):
            sales_signals += 2

    # ---- 3. 检查是否有知识价值 ----
    knowledge_signals = 0
    knowledge_patterns = [
        r'python|langchain|agent|rag|mcp|docker|serverless|claude|gpt',
        r'录播|直播.*答疑|加密视频|播放器账号',
        r'1\.\s*加密视频|2\.\s*直播|3\.\s*班级群',  # 课程介绍模板
        r'简历.*看|模拟面试|面试.*辅导',
        r'(\d+)个?月|周期|学完',
        r'AI应用开发|Ai应用开发|ai应用',
        r'前端.*转|java.*转|转.*ai|转型',
        r'技术栈|项目实战|项目.*部署',
        r'3年有效期|7天无理由|持续迭代',
    ]
    for pattern in knowledge_patterns:
        if re.search(pattern, answer, re.IGNORECASE):
            knowledge_signals += 1

    # ---- 4. 综合判定 ----
    if sales_signals >= 3 and knowledge_signals <= 1:
        return ContentType.SCRIPT.value
    if knowledge_signals >= 2:
        return ContentType.KNOWLEDGE.value
    if sales_signals >= 2:
        return ContentType.SCRIPT.value
    # 默认：有一定信息量的归 knowledge，纯追问归 noise
    if len(answer) > 50 and knowledge_signals >= 1:
        return ContentType.KNOWLEDGE.value
    if len(answer) < 30:
        return ContentType.NOISE.value

    return ContentType.SCRIPT.value


# ==================== 多维度 Confidence 评分 ====================

def compute_confidence(
    question: str,
    answer: str,
    content_type: str,
    source: str = "",
) -> float:
    """
    多维度置信度打分 (0.0 - 1.0)

    维度:
    1. 内容形态 (0 - 0.30)
    2. 答案质量 (0 - 0.30)
    3. 答案稳定性 (0 - 0.20)
    4. 信息完整度 (0 - 0.20)
    """
    score = 0.0

    # ---- 1. 内容形态 (0 - 0.30) ----
    if content_type == ContentType.KNOWLEDGE.value:
        score += 0.30
    elif content_type == ContentType.SCRIPT.value:
        score += 0.15
    # noise = 0.0

    # ---- 2. 答案质量 (0 - 0.30) ----
    a_len = len(answer)
    if a_len >= 200:
        score += 0.15
    elif a_len >= 100:
        score += 0.12
    elif a_len >= 50:
        score += 0.08
    elif a_len >= 20:
        score += 0.04

    # 无追问行 → 额外 0.08
    has_probing = any(re.match(p, line.strip()) for p in PROBING_PATTERNS
                      for line in answer.split('\n') if line.strip())
    if not has_probing:
        score += 0.08

    # 问题质量 (清晰的疑问句)
    if '?' in question or '？' in question or len(question) >= 10:
        score += 0.07

    # ---- 3. 答案稳定性 (0 - 0.20) ----
    # 无时效性内容
    has_ephemeral = any(re.search(p, answer) for p in EPHEMERAL_PATTERNS)
    if not has_ephemeral:
        score += 0.10

    # 无第二人称直接称呼 (说明是通用知识而非个性化回复)
    personal_patterns = [r'你现在多少', r'你是.*吗', r'你的情况', r'你先看']
    has_personal = any(re.search(p, answer) for p in personal_patterns)
    if not has_personal:
        score += 0.05

    # 无脏话/情绪
    profanity = [r'Tmd|尼玛|操你|傻逼|垃圾|废物|送外卖', r'飘了|毒打|打回原形']
    has_profanity = any(re.search(p, answer, re.IGNORECASE) for p in profanity)
    if not has_profanity:
        score += 0.05

    # ---- 4. 信息完整度 (0 - 0.20) ----
    # 包含事实信息 (数字、步骤、具体内容)
    has_facts = bool(re.search(r'\d+[kK个月年天]|步骤|方式|内容|包含|项目', answer))
    if has_facts:
        score += 0.08

    # 有结构 (多行或列表)
    line_count = len([l for l in answer.split('\n') if l.strip()])
    if line_count >= 3:
        score += 0.04

    # 有来源
    if source and source != "微信咨询对话":
        score += 0.04

    # 问题和答案有关联 (简单匹配)
    q_words = set(re.findall(r'[\u4e00-\u9fa5]+', question))
    a_words = set(re.findall(r'[\u4e00-\u9fa5]+', answer))
    overlap = len(q_words & a_words)
    if overlap >= 2:
        score += 0.04

    return round(min(score, 1.0), 2)


# ==================== LLM 改写器 ====================

REWRITE_PROMPT = """你是一个数据标注工程师。你的任务是对微信销售对话做**智能清洗和标注**。

## 输入
原始问题: {question}
原始答案: {answer}
分类: {category}

## 清洗规则

### question（轻度清理，保留原意）
- 去掉称呼（"剑哥"、"懂王"、"老师"）和微信表情符号
- **保留用户原始的口语表达**，不要改成书面语
- "打招呼 + 实际问题" → 只保留实际问题

### answer（删噪声 + 合碎片 + 留风格）
核心原则: **保留说话风格和口语感**，但要把碎片短句合并为连贯段落。

#### 第1步: 删除以下噪声行
✗ 追问用户背景（"你多少k"、"毕业多久了"、"情况介绍我看"）
✗ 直播引流（"今晚9点直播"、"不见不散"、"看我朋友圈"）
✗ 索要联系方式（"电话发我"、"拉你进班"、"飞书用户名"）
✗ 操作性指引（"群公告文档权限申请"、"微信付款方式私聊"、"课件播放器都在里面"）
✗ 脏话/攻击性（"Tmd"、"傻逼"、"废物"、"打回原形"）
✗ 微信表情标记（"[捂脸]"、"[可怜]"、"[玫瑰]"）

#### 第2步: 合并碎片短句
- 把相邻的碎片短句（<15字）合并为一行，用空格连接
- 长句（>=15字）独立成行
- 列表（1. 2. 3.）保持换行
- **保留口语化断句习惯**，不要加句号、逗号等标点

#### 第3步: 保留风格
- 保持原始的说话语气（直接、犀利、不客套）
- 不要改写措辞，不要把"是的"改成"确实"
- 不要加"亲"、"您"等客气称呼

### Few-shot 示例

输入answer:
```
情况介绍我看下
成人大专肯定比统招大专学历差点
少要点 15k
是的 现在行情好
正常要学3个月
他们学了一大半就出来试试水
你决定了All in Ai吗
我们大纲可以看下
```

输出answer:
```
成人大专肯定比统招大专学历差点 少要点15k
是的现在行情好 正常要学3个月
他们学了一大半就出来试试水
```

如果删完噪声合完碎片后答案为空，answer 写 "无实质内容"

### content_type（内容形态）
- "knowledge": 包含事实信息（课程内容、学习方式、技术栈、就业数据等）
- "script": 销售话术（推销、异议处理、成交引导、激励性表达）
- "noise": 纯追问/纯打招呼/删完噪声后无内容

### source（来源推断）
从以下选项中选一个最匹配的:
课程大纲文档、课程学习方式说明、课程技术栈说明、学员就业案例库、就业行情分析、转行可行性分析、行业趋势分析、售后政策手册、求职辅导手册、价格与优惠政策、报名流程指南、学习周期说明

### intent（意图分类，只选一个）
课程内容咨询、学习周期咨询、学习方式咨询、技术栈咨询、价格咨询、优惠活动咨询、就业前景咨询、转行可行性咨询、学历要求咨询、零基础可行性、年龄顾虑、报名流程、退款政策、售后服务、学员案例

### tags
提取3-5个关键标签

### confidence
- 0.85-1.00: 完整有价值 | 0.65-0.84: 有价值但不完整 | 0.45-0.64: 信息较少 | <0.45: 噪声

## 输出格式
严格按以下JSON输出，不要输出其他内容:
{{
  "question": "清理后的问题",
  "answer": "清洗合并后的答案（保留说话风格）",
  "intent": "意图分类",
  "tags": ["标签1", "标签2"],
  "confidence": 0.85,
  "content_type": "knowledge",
  "source": "课程大纲文档"
}}"""


# ==================== LLM 输出后处理 ====================

# 已知微信表情
_WECHAT_EMOJIS = {
    '[捂脸]', '[破涕为笑]', '[坏笑]', '[旺柴]', '[呲牙]', '[害羞]',
    '[可怜]', '[苦涩]', '[流泪]', '[撇嘴]', '[强]',
    '[抱拳]', '[OK]', '[嘿哈]', '[机智]', '[加油]', '[微笑]',
    '[玫瑰]', '[拥抱]', '[握手]', '[鼓掌]', '[比心]', '[爱心]',
    '[若干]',
}

# 操作性短语（行内）
_OPERATIONAL_PHRASES = [
    r'群公告[的中]?权限[你]?可以先?申请[一下]*[然后]?',
    r'群公告权限申请[一下]*',
    r'[你所]?需要的?一切信息都在群公告[中]?[有]?',
    r'[你所]*需要的?任何资料全部在群公告',
    r'一切信息都在群公告',
    r'播放器和课件[都]?[看在]?群公告',
    r'课件和播放器都在文档里面[的]?',
    r'播放器和课件都在里面',
    r'微信付款方式私聊[教务]?',
    r'直接转我也?可以',
    r'文档权限申请[一下]*',
    r'备注写微信名',
    r'课件.*播放器.*都在',
    r'就在群公告置顶',
]

# 追问短语（行内）
_PROBING_PHRASES = [
    r'情况介绍我看[看下一]?',
    r'情况先介绍我看[看下一]?',
    r'你好\s*情况介绍我看[看下一]?',
    r'具体情况介绍我看[看下一]?',
]


def postprocess_answer(answer: str) -> str:
    """
    LLM 输出后的自动后处理

    即使 Prompt 已经要求 LLM 做清洗，仍可能有残留，这里用规则兜底:
    1. 清除微信表情标记
    2. 剥离操作性/追问短语
    3. 合并碎片化短行
    4. 清理多余空白
    """
    if not answer or answer == "无实质内容":
        return answer

    # 1. 清除微信表情
    for emoji in _WECHAT_EMOJIS:
        answer = answer.replace(emoji, '')
    # 断裂表情
    answer = re.sub(r'\[(捂脸|可怜|破涕为笑|玫瑰|若干)\s*$', '', answer, flags=re.MULTILINE)

    # 2. 剥离操作性短语
    for phrase in _OPERATIONAL_PHRASES:
        answer = re.sub(phrase + r'\s*', '', answer)
    for phrase in _PROBING_PHRASES:
        answer = re.sub(phrase + r'\s*', '', answer)

    # 3. 合并碎片化短行
    lines = [l.strip() for l in answer.split('\n') if l.strip()]
    if len(lines) > 1:
        merged = []
        buf = ''
        for line in lines:
            if re.match(r'^(\d+[\.\、]|\-\s)', line):
                if buf:
                    merged.append(buf)
                    buf = ''
                merged.append(line)
            elif len(line) < 15:
                if buf and len(buf) + len(line) > 60:
                    merged.append(buf)
                    buf = line
                else:
                    buf = (buf + ' ' + line).strip() if buf else line
            else:
                if buf:
                    merged.append(buf)
                    buf = ''
                merged.append(line)
        if buf:
            merged.append(buf)
        answer = '\n'.join(merged)

    # 4. 清理多余空白
    answer = re.sub(r'\n\s*\n', '\n', answer)
    answer = re.sub(r'  +', ' ', answer)
    answer = '\n'.join(l for l in answer.split('\n') if l.strip())

    return answer.strip()


class RagRewriter:
    """RAG 知识库改写器"""

    def __init__(self):
        self.client = None
        self.model = None
        self._init_client()

    def _init_client(self):
        """初始化 LLM 客户端"""
        try:
            from openai import OpenAI
            if settings.deepseek_api_key:
                self.client = OpenAI(
                    api_key=settings.deepseek_api_key,
                    base_url=settings.deepseek_base_url
                )
                self.model = "deepseek-chat"
            elif settings.openai_api_key:
                self.client = OpenAI(
                    api_key=settings.openai_api_key,
                    base_url=settings.openai_base_url
                )
                self.model = "gpt-4o-mini"
        except Exception as e:
            print(f"[RagRewriter] LLM client init failed: {e}")

    def rewrite_entry(self, question: str, answer: str, category: str) -> Optional[Dict]:
        """
        用 LLM 改写单条 Q/A 为标准知识条目

        Returns:
            改写后的 dict 或 None (失败时)
        """
        if not self.client:
            return None

        prompt = REWRITE_PROMPT.format(
            question=question,
            answer=answer,
            category=category,
        )

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "你是一个专业的知识库数据工程师，擅长将非结构化对话转化为结构化知识条目。"},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=800,
            )

            text = response.choices[0].message.content.strip()
            result = self._parse_rewrite_response(text)
            if result:
                result['answer'] = postprocess_answer(result.get('answer', ''))
            return result

        except Exception as e:
            print(f"[RagRewriter] Rewrite failed: {e}")
            return None

    def _parse_rewrite_response(self, text: str) -> Optional[Dict]:
        """解析 LLM 改写结果"""
        # 提取 JSON
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]

        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            return None

        try:
            result = json.loads(text[start:end + 1])

            # 验证必需字段
            if not result.get("question") or not result.get("answer"):
                return None

            # 如果LLM判断无实质内容，标记低置信度和noise
            if "无实质知识" in result.get("answer", ""):
                result["confidence"] = 0.1
                result["content_type"] = ContentType.NOISE.value

            # 标准化
            result.setdefault("intent", "")
            result.setdefault("tags", [])
            result.setdefault("confidence", 0.5)
            result.setdefault("content_type", ContentType.KNOWLEDGE.value)
            result.setdefault("source", "微信咨询对话")

            # 确保 tags 是列表
            if isinstance(result["tags"], str):
                result["tags"] = [t.strip() for t in result["tags"].split(",")]

            # 验证 content_type 合法
            valid_types = {t.value for t in ContentType}
            if result["content_type"] not in valid_types:
                result["content_type"] = ContentType.KNOWLEDGE.value

            return result

        except (json.JSONDecodeError, KeyError):
            return None

    def batch_rewrite(
        self,
        entries: List[Dict],
        min_confidence: float = 0.4,
        on_progress=None,
        max_workers: int = 15,
    ) -> Tuple[List[Dict], Dict]:
        """
        批量改写 RAG 条目 (并发版本)

        Args:
            entries: 原始条目列表 [{question, answer, category}]
            min_confidence: 最低置信度过滤
            on_progress: 进度回调 (completed, total)
            max_workers: 并发线程数 (默认 5)

        Returns:
            (rewritten_entries, stats)
        """
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import threading

        stats = {
            "input": len(entries),
            "rewritten": 0,
            "low_confidence": 0,
            "noise_filtered": 0,
            "failed": 0,
            "output": 0,
            "by_content_type": {"knowledge": 0, "script": 0, "noise": 0},
        }

        results = []
        completed_count = 0
        lock = threading.Lock()

        def _process_one(idx_entry):
            """处理单条 entry，返回 (index, result_dict_or_None)"""
            idx, entry = idx_entry
            q = entry.get("question", "")
            a = entry.get("answer", "")
            cat = entry.get("category", "sales")
            rewritten = self.rewrite_entry(q, a, cat)
            if rewritten:
                rewritten["original_q"] = q
                rewritten["original_a"] = a
                rewritten["category"] = cat
            return idx, rewritten

        # 并发调用 LLM
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(_process_one, (i, entry)): i
                for i, entry in enumerate(entries)
            }

            for future in as_completed(futures):
                idx, rewritten = future.result()

                with lock:
                    completed_count += 1

                    if rewritten:
                        confidence = rewritten.get("confidence", 0)
                        ct = rewritten.get("content_type", "knowledge")

                        if ct in stats["by_content_type"]:
                            stats["by_content_type"][ct] += 1

                        if ct == ContentType.NOISE.value:
                            stats["noise_filtered"] += 1
                        elif confidence >= min_confidence:
                            results.append(rewritten)
                            stats["rewritten"] += 1
                        else:
                            stats["low_confidence"] += 1
                    else:
                        stats["failed"] += 1

                    if on_progress:
                        on_progress(completed_count, len(entries))

        stats["output"] = len(results)
        return results, stats


# ==================== 规则改写 (不需要 LLM) ====================

# 常见意图映射
INTENT_KEYWORDS = {
    "课程内容咨询": ["课程", "学什么", "内容", "大纲", "技术栈", "python", "agent", "rag"],
    "学习周期咨询": ["多久", "周期", "几个月", "学完", "时间"],
    "学习方式咨询": ["录播", "直播", "形式", "怎么学", "上课"],
    "价格咨询": ["多少钱", "价格", "费用", "收费", "优惠", "便宜"],
    "就业前景咨询": ["就业", "工作", "岗位", "行情", "前景", "找工作"],
    "转行可行性咨询": ["转行", "转型", "转ai", "能转吗", "合适吗"],
    "零基础可行性": ["零基础", "没基础", "学不会", "能学吗"],
    "年龄顾虑": ["年龄", "太老", "30", "35", "来得及"],
    "报名流程": ["报名", "怎么报", "链接", "下单"],
    "退款政策": ["退款", "退费", "不合适"],
    "售后服务": ["设备", "发票", "更新", "迭代"],
    "学员案例": ["offer", "案例", "学生", "同学.*找到"],
}


def infer_intent(question: str, answer: str) -> str:
    """基于关键词推断意图"""
    text = (question + " " + answer).lower()
    best_intent = "一般咨询"
    best_score = 0

    for intent, keywords in INTENT_KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in text)
        if score > best_score:
            best_score = score
            best_intent = intent

    return best_intent


def infer_tags(question: str, answer: str) -> List[str]:
    """基于关键词提取标签"""
    text = (question + " " + answer).lower()
    tags = []

    tag_keywords = {
        "ai课程": ["ai课程", "ai应用", "课程"],
        "python": ["python"],
        "agent": ["agent"],
        "rag": ["rag"],
        "mcp": ["mcp"],
        "langchain": ["langchain"],
        "前端转行": ["前端", "react", "vue"],
        "java转行": ["java"],
        "零基础": ["零基础", "没基础", "0基础"],
        "就业": ["就业", "找工作", "offer", "薪资"],
        "学习方式": ["录播", "直播"],
        "售后": ["退款", "设备", "发票"],
    }

    for tag, keywords in tag_keywords.items():
        if any(kw in text for kw in keywords):
            tags.append(tag)

    return tags[:5]  # 最多5个标签


def _clean_answer_lines(answer: str) -> str:
    """
    深度清理答案文本:
    - 移除销售追问行
    - 移除直播引流/时效性内容
    - 移除情绪化/脏话行
    - 移除纯追问用户背景的行
    """
    lines = answer.split('\n')
    clean_lines = []

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # 跳过纯销售动作行
        if any(re.search(p, stripped) for p in SALES_ACTION_PATTERNS):
            continue

        # 跳过直播引流/时效性内容
        if any(re.search(p, stripped) for p in EPHEMERAL_PATTERNS):
            continue

        # 跳过追问用户背景
        if any(re.match(p, stripped) for p in PROBING_PATTERNS):
            continue

        # 跳过情绪化/脏话
        if re.search(r'Tmd|尼玛|操你|傻逼|废物|送外卖|飘了|毒打|打回原形|装逼|干尼玛|垃圾', stripped, re.IGNORECASE):
            continue

        # 跳过极短无信息行 (1-3字)
        if len(stripped) <= 3 and not re.search(r'\d', stripped):
            continue

        clean_lines.append(stripped)

    return '\n'.join(clean_lines).strip()


def rule_based_rewrite(entries: List[Dict]) -> List[Dict]:
    """
    纯规则改写 (不依赖 LLM，速度快)
    v2: 增加 content_type 分类、source 推断、多维度 confidence

    - 补充 intent / tags / source / content_type
    - 深度清理答案 (销售追问、直播引流、时效性、情绪化)
    - 多维度 confidence 评分
    - 过滤 noise 类数据
    """
    results = []

    for entry in entries:
        q = entry.get("question", "").strip()
        a = entry.get("answer", "").strip()
        cat = entry.get("category", "sales")

        # 清理问题中的自我介绍
        q_clean = re.sub(r'^我是[^\n]{1,20}\n', '', q).strip()
        # 移除称呼
        q_clean = re.sub(r'^(剑哥|懂王|懂哥|老师|大佬|老哥|哥|宝)[，,\s]*', '', q_clean).strip()
        # 移除表情
        q_clean = re.sub(r'\[[\u4e00-\u9fa5]+\]', '', q_clean).strip()

        # 分类内容形态
        content_type = classify_content_type(q, a, cat)

        # 深度清理答案
        a_clean = _clean_answer_lines(a)

        # 推断来源
        source = infer_source(q_clean or q, a_clean or a)

        # 多维度 confidence 评分
        confidence = compute_confidence(
            q_clean or q,
            a_clean or a,
            content_type,
            source,
        )

        intent = infer_intent(q_clean or q, a_clean or a)
        tags = infer_tags(q_clean or q, a_clean or a)

        results.append({
            "question": q_clean or q,
            "answer": a_clean or a,
            "category": cat,
            "intent": intent,
            "tags": tags,
            "confidence": confidence,
            "source": source,
            "content_type": content_type,
            "original_q": q,
            "original_a": a,
        })

    return results
