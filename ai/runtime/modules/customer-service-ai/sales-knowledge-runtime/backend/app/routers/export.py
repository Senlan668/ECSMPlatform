# -*- coding: utf-8 -*-
"""
数据导出 API
支持导出为多种格式，用于大模型微调训练
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import and_
from typing import List, Optional
from pydantic import BaseModel
import json
import csv
import io

from app.models.database import get_db
from app.models.chat import RawChat, KnowledgeChunk, Session, StagingConversation, CustomConversation

# 时间过滤：只处理 2025年10月 及以后的数据
MIN_TIMESTAMP = 1759248000  # 2025-10-01 00:00:00 CST (秒级)

from app.services.training_data import (
    TrainingDataPipeline, 
    DataCleaner, 
    ConversationBuilder,
    QualityEvaluator,
    DataQuality,
    ContentCategory,
    TrainingDataExporter
)

router = APIRouter(prefix="/api/export", tags=["export"])


# ==================== 请求模型 ====================

class ExportConfig(BaseModel):
    """导出配置"""
    format: str = "sharegpt"  # sharegpt, alpaca, openai, jsonl, rag
    min_quality: str = "medium"  # high, medium, low
    categories: Optional[List[str]] = None  # 筛选类别
    session_ids: Optional[List[str]] = None  # 指定会话
    include_system_prompt: bool = True
    time_window_seconds: int = 300  # 对话切分时间窗口
    max_turns_per_conversation: int = 20
    use_llm_scoring: bool = False  # 是否使用 LLM 评分
    llm_min_score: float = 6.0  # LLM 评分最低分
    llm_min_score: float = 6.0  # LLM 评分最低分
    deduplicate: bool = False  # 是否去重
    merge_messages: bool = False  # 是否合并连续消息



class ExportStats(BaseModel):
    """导出统计"""
    total_examples: int
    by_quality: dict
    by_category: dict
    avg_turns: float
    avg_length: float


# ==================== API 端点 ====================

@router.get("/formats")
def get_supported_formats():
    """获取支持的导出格式"""
    return {
        "formats": [
            {
                "id": "sharegpt",
                "name": "ShareGPT",
                "description": "多轮对话格式，适用于 LLaMA-Factory, FastChat 等",
                "extension": "json"
            },
            {
                "id": "alpaca",
                "name": "Alpaca",
                "description": "指令微调格式 (instruction-input-output)，适用于 Stanford Alpaca",
                "extension": "json"
            },
            {
                "id": "openai",
                "name": "OpenAI Chat",
                "description": "OpenAI 微调格式，适用于 OpenAI Fine-tuning API",
                "extension": "jsonl"
            },
            {
                "id": "jsonl",
                "name": "JSONL Raw",
                "description": "原始 JSONL 格式，每行一个对话",
                "extension": "jsonl"
            },
            {
                "id": "rag",
                "name": "RAG 知识库",
                "description": "问答对 CSV 格式，适用于火山引擎等知识库平台",
                "extension": "csv"
            }
        ],
        "qualities": [
            {"id": "high", "name": "高质量", "description": "完整问答、技术讨论"},
            {"id": "medium", "name": "中等", "description": "有价值但可能不完整"},
            {"id": "low", "name": "低质量", "description": "包含闲聊等"}
        ],
        "categories": [
            {"id": "sales", "name": "销售话术", "description": "价格介绍、优惠活动"},
            {"id": "course", "name": "课程咨询", "description": "课程内容、教学安排"},
            {"id": "objection", "name": "异议处理", "description": "化解顾虑、建立信任"},
            {"id": "closing", "name": "成交转化", "description": "促进下单、完成报名"},
            {"id": "followup", "name": "客户跟进", "description": "维护关系、持续服务"},
            {"id": "qa", "name": "问答", "description": "通用问题解答"},
            {"id": "knowledge", "name": "知识分享", "description": "行业知识、学习方法"},
            {"id": "casual", "name": "闲聊", "description": "日常寒暄"}
        ]
    }


# ==================== 已标注数据导出 API ====================

class LabeledExportConfig(BaseModel):
    """已标注数据导出配置"""
    format: str = "sharegpt"  # sharegpt, alpaca, openai, jsonl, rag
    include_system_prompt: bool = True
    categories: Optional[List[str]] = None  # 筛选类别（auto_category 或 human_category）
    exclude_price_data: bool = True  # 是否排除包含价格的数据（默认排除）
    merge_messages: bool = False  # 是否合并连续消息
    include_custom: bool = True  # 是否包含自定义数据（默认包含）
    validate_style: bool = True  # 是否进行风格验证和修复（默认开启）
    # RAG 专用选项
    rag_mode: str = "rule"  # rule(规则清洗) | llm(LLM改写) | distill(知识蒸馏) | raw(原始)
    rag_min_confidence: float = 0.4  # LLM 模式下最低置信度
    rag_filter_noise: bool = True  # 是否过滤 noise 类数据（默认过滤）
    # distill 模式专用
    distill_include_kb: bool = True  # 是否合并手写知识库（build_dual_rag.py 的 KNOWLEDGE_BASE）
    distill_min_group: int = 2  # 最小分组大小（少于此数的组跳过蒸馏）
    distill_expand_variants: bool = True  # 输出时是否展开 variants 为多行


# 价格相关关键词列表
PRICE_KEYWORDS = [
    # 价格金额
    r'\d+元', r'\d+块', r'¥\d+', r'\$\d+',
    r'原价', r'现价', r'优惠价', r'特价', r'折扣',
    r'打折', r'立减', r'满减', r'返现',
    # 具体金额模式
    r'\d+\.\d+元', r'\d+千', r'\d+万',
    r'几千', r'几百', r'几万',
    # 费用类
    r'学费', r'报名费', r'定金', r'尾款', r'全款',
    r'分期', r'首付', r'月供',
    # 促销相关
    r'限时', r'秒杀', r'抢购', r'活动价',
    r'今天.*价', r'明天.*涨价',
]


def _contains_price_info(text: str) -> bool:
    """检查文本是否包含价格信息"""
    import re
    if not text:
        return False
    for pattern in PRICE_KEYWORDS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def _desensitize_price(text: str) -> str:
    """
    脱敏处理课程价格信息（保留薪资信息）
    
    脱敏规则：
    - 课程价格：3999、4999、5999、6999 等明确课程价格 → 脱敏
    - 优惠相关：原价xxx、优惠价xxx、活动价xxx → 脱敏
    - 报名费用：报名费、学费、定金、尾款 + 金额 → 脱敏
    
    保留：
    - 薪资信息：10k、20k、25k、30k 等 → 保留
    - 用户自述薪资：现在多少k、目前xx万 → 保留
    """
    import re
    if not text:
        return text
    
    result = text
    
    # ===== 需要脱敏的课程价格 =====
    
    # 1. 常见课程价格（千位结尾的价格 + 常见优惠价）
    # 注意：Python 3 中 \b 使用 Unicode 边界，中文字符属于 \w，
    # 所以 \b3999\b 无法匹配 "说3999"。改用 (?<!\d) 和 (?!\d)
    COURSE_PRICES = [
        '1999', '2999', '3999', '4999', '5999', '6999', '7999', '8999', '9999',
        '1888', '2888', '3888', '4888', '5888', '6888', '7888', '8888', '9888',
        '4499', '4299', '3599', '5499', '5299',  # 常见优惠价格
        '1000', '2000', '3000', '4000', '5000', '6000', '7000', '8000', '9000',  # 整千
        '1500', '2500', '3500', '4500', '5500',  # 整千五
    ]
    for price in COURSE_PRICES:
        result = re.sub(rf'(?<!\d){price}(?!\d)', '[课程价格]', result)
    
    # 1.5 通用4位数价格（在明确价格语境中）
    result = re.sub(r'是(\d{4})(?:[？\?]|$)', r'是[课程价格]', result)
    # 更多价格语境：就是xxxx了、来就xxxx
    result = re.sub(r'(?:就是|来就|直接|今天|今晚.*?是)(\d{4,5})', '[课程价格]', result)
    
    # 1.6 开票/发票金额（如 "唐铭志 3000"、"开票 5000"）
    result = re.sub(r'(开票|发票|报销|金额).*?(\d{3,5})', lambda m: m.group(0).replace(m.group(2), '[金额]'), result)
    
    # 1.7 个人姓名脱敏（中文姓名 2-4 字 + 紧跟金额或空格+金额）
    result = re.sub(r'[\u4e00-\u9fa5]{2,4}\s+\[课程价格\]', '[学员] [课程价格]', result)
    result = re.sub(r'[\u4e00-\u9fa5]{2,4}\s+\[金额\]', '[学员] [金额]', result)
    result = re.sub(r'[\u4e00-\u9fa5]{2,4}\s+\d{4,5}', '[学员] [金额]', result)
    
    # 2. 明确的课程价格语境（优惠价、原价、现价、活动价 + 数字）
    result = re.sub(r'(原价|现价|优惠价?|特价|活动价|首发价?)[\s:：]*(\d{3,5})', r'\1[价格详询]', result)
    
    # 3. 报名费用相关（学费、报名费、定金、尾款 + 数字）
    result = re.sub(r'(学费|报名费|定金|尾款|全款)[\s:：]*(\d{3,5})', r'\1[价格详询]', result)
    
    # 4. 涨价/降价/优惠金额语境
    result = re.sub(r'(涨了?|降了?|优惠了?|便宜了?|减了?)[\s]?(\d{3,5})', r'\1[若干]', result)
    
    # 5. 给你xx价格的报价语境
    result = re.sub(r'给你[\s]?(\d{4,5})', '给你[优惠价]', result)
    result = re.sub(r'(\d{4,5})[\s]?给你', '[优惠价]给你', result)
    
    # ===== 致命红线内容处理 =====
    
    # 6. 直接报价模式（必须脱敏，否则模型学会报价）
    result = re.sub(r'都是(\d{4,5})来的', '都是[课程价格]来的', result)
    result = re.sub(r'直接转我[吧]?(\d{4,5})', '直接转[价格详询]', result)
    result = re.sub(r'转我(\d{4,5})', '转[价格详询]', result)
    result = re.sub(r'我亏(\d{3,5})', '我亏[若干]', result)
    
    # 7. 支付方式询问（替换为标准话术）
    result = re.sub(r'微信还是支付宝[还是信用卡]*', '付款方式私聊教务', result)
    result = re.sub(r'支付宝[账号帐号]?', '付款方式私聊教务', result)
    result = re.sub(r'直接转就?行了?', '直接找教务办理', result)
    
    # 8. 垃圾噪音过滤
    # 飞书用户名等无效内容
    result = re.sub(r'飞书用户名[是]?多少', '信息已私发', result)
    result = re.sub(r'你飞书用户名', '你的账号信息', result)
    
    # URL链接替换 → 直接根据上下文替换为描述性文字（不再留占位符）
    result = re.sub(r'https?://[^\s\u4e00-\u9fa5]+', '', result)
    # 协议相对URL (//domain.com/...)
    result = re.sub(r'(?<![:\w])//[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-./\w]+', '', result)
    # 已知域名直接匹配（飞书、抖音等） - 按行处理以应对换行拆分的URL
    result = re.sub(r'jianxuanguan[.\w/\-]*', '', result)
    result = re.sub(r'feishu\.cn[/\w\-]*', '', result)
    # 清理 URL hash/路径残留（如 SgISw51EKiY5L0k 等看起来像 URL path 的长字符串）
    # 匹配独占一行的、看起来像 URL 路径的纯英数字串 (10+ 字符，混有大小写)
    result = re.sub(r'^[A-Za-z0-9/\-_]{10,}$', '', result, flags=re.MULTILINE)
    # 清理 //\n 残留
    result = re.sub(r'//\s*\n', '\n', result)
    
    # 清理替换后的空行和多余空格
    result = re.sub(r'\n\s*\n\s*\n', '\n\n', result)
    result = re.sub(r'  +', ' ', result)
    
    # ===== 保留薪资信息 =====
    # 以下模式不处理，保持原样：
    # - XXk、XX万（薪资格式）
    # - 多少k、目前XX（用户自述）
    
    return result


def _replace_resource_links(text: str) -> str:
    """
    清理文本中残留的 [资料链接] 占位符
    
    策略：
    - 如果 [资料链接] 前面已有描述（如 "Ai岗位解析（视频）"），直接删除占位符
    - 如果整行只有 [资料链接]，删除整行
    - 清理多余空行
    """
    import re
    if not text or "[资料链接]" not in text:
        return text
    
    # 按行处理
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        # 整行只是 [资料链接]（可能前后有空格）→ 跳过该行
        if stripped == '[资料链接]':
            continue
        # 行内包含 [资料链接] → 删除占位符
        if '[资料链接]' in stripped:
            line = line.replace('[资料链接]', '').strip()
            # 如果删除后行变空了，跳过
            if not line:
                continue
        cleaned_lines.append(line)
    
    result = '\n'.join(cleaned_lines)
    # 清理连续空行
    result = re.sub(r'\n{3,}', '\n\n', result)
    return result.strip()


# 标准价格回复模板（符合系统提示词硬性红线）
STANDARD_PRICE_RESPONSE = """价格这块懂王Ai经常有活动
我得先看你合不合适带
合适的话我推个教务老师给你
你找他领最新优惠"""

# 价格违规关键词（扩展版）
# 注意：不包含 \d+k 因为薪资信息（20k）需要保留
PRICE_VIOLATION_KEYWORDS = [
    r'改价', r'折扣', r'多少钱',
    r'分期', r'\d+元', r'\d+块', r'\d+w',
    r'首发.*优惠', r'活动.*价', r'给.*优惠',
    # 脱敏后残留的占位符 → 说明该消息涉及价格，应整体替换
    r'\[课程价格\]', r'\[优惠价\]', r'\[若干\]', r'\[金额\]', r'\[价格详询\]',
    # 直接报价语境
    r'卖.*?[六七八九]\d*千', r'涨到.*?[六七八九]\d*千',
    r'价格.*?[低太]', r'价格.*?定',
    r'恢复\d{4}', r'涨价',
]

# 禁用标点符号
FORBIDDEN_PUNCTUATION = ['。', '，', '！', '？', '、', '；', '：', '"', '"', ''', ''']


def _validate_and_fix_gpt_response(text: str, category: str = "sales") -> tuple:
    """
    验证并自动修复 GPT 回复，确保符合系统提示词规则

    Args:
        text: GPT 回复文本
        category: 对话类别

    Returns:
        (fixed_text, violations): 修复后的文本和违规列表
    """
    import re

    violations = []
    fixed_text = text

    if not text:
        return text, violations

    # 规则 1: 价格关键词检测（最高优先级）
    for pattern in PRICE_VIOLATION_KEYWORDS:
        if re.search(pattern, fixed_text, re.IGNORECASE):
            violations.append('price_violation')
            # 直接替换为标准回复
            return STANDARD_PRICE_RESPONSE, violations

    # 规则 1.5: 禁词替换（"您" → "你"）
    if '您' in fixed_text:
        violations.append('forbidden_word')
        fixed_text = fixed_text.replace('您', '你')
    
    # 规则 1.6: 移除 "亲" 开头的称呼
    if '亲' in fixed_text:
        violations.append('forbidden_word')
        fixed_text = re.sub(r'亲[，,\s]?', '', fixed_text)

    # 规则 2: 移除禁用标点符号
    for punct in FORBIDDEN_PUNCTUATION:
        if punct in fixed_text:
            violations.append('punctuation')
            fixed_text = fixed_text.replace(punct, '')

    # 规则 3: 拆分超长行（每行不超过15字）
    lines = fixed_text.split('\n')
    new_lines = []

    for line in lines:
        if len(line) > 15:
            violations.append('line_length')
            # 智能拆分：优先在空格处拆分
            if ' ' in line:
                words = line.split(' ')
                current_line = ''
                for word in words:
                    if len(current_line) + len(word) + 1 <= 15:
                        current_line += (' ' if current_line else '') + word
                    else:
                        if current_line:
                            new_lines.append(current_line)
                        current_line = word
                if current_line:
                    new_lines.append(current_line)
            else:
                # 无空格，每15字强制拆分
                for i in range(0, len(line), 15):
                    new_lines.append(line[i:i+15])
        else:
            new_lines.append(line)

    fixed_text = '\n'.join(new_lines)

    return fixed_text, violations


def _clean_conversation_for_training(conversations: list, desensitize_price: bool = True, validate_style: bool = True, min_turns: int = 2, max_turns: int = 40) -> list:
    """
    清洗对话数据，确保符合训练要求：
    1. 修复 gpt 先开口的问题（在前面补充一个 human 消息）
    2. 确保对话以 gpt 回复结束（移除末尾的 human 消息）
    3. 脱敏价格信息（保持与 system prompt 一致）
    4. 验证并修复风格问题（标点、行长度、价格违规）
    5. 过滤过短对话（少于 min_turns 轮对话）
    6. 拆分过长对话（超过 max_turns 条消息）

    Args:
        conversations: 对话列表，格式为 [{"from": "system/human/gpt", "value": "..."}]
        desensitize_price: 是否进行价格脱敏
        validate_style: 是否进行风格验证和修复
        min_turns: 最少对话轮次（不含 system），默认 2 条消息（1轮对话）
        max_turns: 最多对话轮次（不含 system），超过则拆分，默认 40 条消息

    Returns:
        清洗后的对话列表（如果过长会返回第一段，其他段会被丢弃）
    """
    if not conversations or len(conversations) < 1:
        return []
    
    result = []
    
    # 分离 system 消息和对话消息
    system_msg = None
    dialog_msgs = []
    
    for msg in conversations:
        role = msg.get("from", "")
        if role == "system":
            system_msg = msg
        else:
            dialog_msgs.append(msg)
    
    # 如果只有 system 消息或没有对话，返回空
    if len(dialog_msgs) < 1:
        return []
    
    # 处理1: 修复 gpt 先开口的问题
    # 如果第一条非 system 消息是 gpt，在前面补充一个 human 消息
    if dialog_msgs[0].get("from") == "gpt":
        dialog_msgs.insert(0, {
            "from": "human",
            "value": "你好"
        })
    
    # 处理2: 确保对话以 gpt 回复结束
    # 移除末尾连续的 human 消息
    while dialog_msgs and dialog_msgs[-1].get("from") == "human":
        dialog_msgs.pop()
    
    # 处理5: 过滤过短对话（新增）
    # 至少需要 min_turns 条消息（例如：1轮对话 = human + gpt = 2条消息）
    if len(dialog_msgs) < min_turns:
        return []
    
    # 处理6: 拆分过长对话（新增）
    # 如果对话超过 max_turns，只保留前 max_turns 条消息
    # 确保最后一条是 gpt 的回复
    if len(dialog_msgs) > max_turns:
        # 截取前 max_turns 条
        dialog_msgs = dialog_msgs[:max_turns]
        
        # 确保最后一条是 gpt 回复
        while dialog_msgs and dialog_msgs[-1].get("from") == "human":
            dialog_msgs.pop()
        
        # 再次检查长度
        if len(dialog_msgs) < min_turns:
            return []
    
    # 处理3: 价格脱敏（对所有消息生效，包括 human 和 gpt）
    if desensitize_price:
        for msg in dialog_msgs:
            msg["value"] = _desensitize_price(msg.get("value", ""))

    # 处理3.5: 清理残留的 [资料链接] 占位符
    for msg in dialog_msgs:
        msg["value"] = _replace_resource_links(msg.get("value", ""))

    # 处理4: 风格验证和修复
    if validate_style:
        for msg in dialog_msgs:
            if msg.get("from") == "gpt":
                original = msg.get("value", "")
                fixed, violations = _validate_and_fix_gpt_response(original)
                msg["value"] = fixed

    # 处理7: 最终清理 - 确保没有任何残留占位符/脏数据
    import re as _re
    WECHAT_EMOJIS = {
        '[捂脸]', '[破涕为笑]', '[坏笑]', '[旺柴]', '[呲牙]', '[害羞]',
        '[可怜]', '[苦涩]', '[流泪]', '[撇嘴]', '[社会社会]', '[强]',
        '[抱拳]', '[OK]', '[嘿哈]', '[机智]', '[加油]', '[微笑]', '[若干]',
    }
    DANGEROUS_PLACEHOLDERS = ['[课程价格]', '[优惠价]', '[金额]', '[价格详询]', '[学员]']
    
    for msg in dialog_msgs:
        value = msg.get("value", "")
        
        # 清理残留占位符（非微信表情的方括号内容）
        def _clean_bracket(m):
            full = m.group(0)
            if full in WECHAT_EMOJIS:
                return full
            if full in DANGEROUS_PLACEHOLDERS:
                return ''
            return full
        
        value = _re.sub(r'\[[^\]]+\]', _clean_bracket, value)
        
        # 清理 assistant 消息中的 您
        if msg.get("from") == "gpt":
            value = value.replace('您', '你')
        
        # 清理多余空行和空格
        value = _re.sub(r'\n\s*\n\s*\n', '\n\n', value)
        value = _re.sub(r'  +', ' ', value)
        value = value.strip()
        
        msg["value"] = value
    
    # 过滤掉内容变空的消息
    dialog_msgs = [m for m in dialog_msgs if m.get("value", "").strip()]
    
    # 再次确保以 human 开头、gpt 结尾
    if dialog_msgs and dialog_msgs[0].get("from") != "human":
        dialog_msgs.insert(0, {"from": "human", "value": "你好"})
    while dialog_msgs and dialog_msgs[-1].get("from") == "human":
        dialog_msgs.pop()
    
    if len(dialog_msgs) < min_turns:
        return []

    # 重新组装结果
    if system_msg:
        result.append(system_msg)
    result.extend(dialog_msgs)
    
    return result


@router.post("/labeled/preview")
def preview_labeled_export(
    config: LabeledExportConfig,
    limit: int = Query(10, description="预览数量"),
    db: DBSession = Depends(get_db)
):
    """
    预览已标注数据导出（推荐）
    仅导出人工审核通过的高质量数据 + 自定义数据
    """
    # 查询已通过的标注数据
    query = db.query(StagingConversation).filter(
        StagingConversation.status == 'approved'
    )

    # 类别过滤
    if config.categories:
        query = query.filter(
            (StagingConversation.auto_category.in_(config.categories)) |
            (StagingConversation.human_category.in_(config.categories))
        )

    staging_total = query.count()

    # 转换已标注数据为导出格式（应用价格过滤）
    exported = []
    price_filtered = 0

    if staging_total > 0:
        approved_data = query.limit(limit * 2).all()  # 获取更多数据以补偿过滤损失

        for item in approved_data:
            # 价格过滤
            if config.exclude_price_data:
                content = item.cleaned_text or item.original_text or ''
                question = item.human_question or item.auto_question or ''
                answer = item.human_answer or item.auto_answer or ''
                if _contains_price_info(content) or _contains_price_info(question) or _contains_price_info(answer):
                    price_filtered += 1
                    continue

            if len(exported) >= limit:
                break

            formatted = _format_staging_item(item, config.format, config.include_system_prompt)
            if formatted:
                exported.append(formatted)

    # 查询并添加自定义数据
    custom_total = 0
    if config.include_custom:
        custom_query = db.query(CustomConversation).filter(
            CustomConversation.is_active == True
        )

        # 类别过滤
        if config.categories:
            custom_query = custom_query.filter(
                CustomConversation.category.in_(config.categories)
            )

        custom_total = custom_query.count()

        if custom_total > 0:
            # 获取自定义数据（填充到 limit）
            remaining = limit - len(exported)
            if remaining > 0:
                custom_data = custom_query.limit(remaining).all()

                for item in custom_data:
                    formatted = _format_custom_item(item, config.format, config.include_system_prompt)
                    if formatted:
                        exported.append(formatted)

    total = staging_total + custom_total

    if total == 0:
        return {
            "preview": [],
            "statistics": {
                "total": 0,
                "staging_count": 0,
                "custom_count": 0,
                "message": "没有可导出的数据。请先在后台管理系统中审核数据，或添加自定义数据。"
            },
            "config": config.dict()
        }

    # ===== RAG 格式: 应用智能过滤和改写 =====
    rag_filter_stats = None
    rag_quality_stats = None
    distill_stats = None
    if config.format == "rag" and config.rag_mode != "raw":
        if config.rag_mode == "distill":
            # ===== 蒸馏模式：分组 → LLM 蒸馏 → 合并手写知识库 =====
            from app.services.rag_rewriter import filter_rag_entries
            from app.services.rag_distiller import RagDistiller, flatten_for_volcano
            # Step 1: 规则过滤
            exported, rag_filter_stats = filter_rag_entries(exported)
            # Step 2: 蒸馏
            distiller = RagDistiller()
            exported, distill_stats = distiller.batch_distill(
                exported,
                include_knowledge_base=config.distill_include_kb,
                min_group_size=config.distill_min_group,
            )
            # Step 3: 展开 variants（火山引擎兼容格式需要）
            if config.distill_expand_variants:
                exported = flatten_for_volcano(exported)
        else:
            from app.services.rag_rewriter import filter_rag_entries, rule_based_rewrite, ContentType
            # Step 1: 规则过滤 (去空/去重/去无意义)
            exported, rag_filter_stats = filter_rag_entries(exported)
            # Step 2: 规则改写 (补充 intent/tags/source/content_type, 清理销售追问)
            if config.rag_mode == "rule":
                exported = rule_based_rewrite(exported)

            # Step 3: 过滤 noise 类数据
            if config.rag_filter_noise:
                before_noise = len(exported)
                exported = [e for e in exported if e.get("content_type") != ContentType.NOISE.value]
                noise_removed = before_noise - len(exported)
            else:
                noise_removed = 0

            # Step 4: 质量分桶统计
            rag_quality_stats = {
                "by_content_type": {"knowledge": 0, "script": 0, "noise": noise_removed},
                "by_confidence": {"high_0.8+": 0, "good_0.6-0.8": 0, "medium_0.4-0.6": 0, "low_0-0.4": 0},
                "source_coverage": 0,
                "tags_coverage": 0,
            }
            source_filled = 0
            tags_filled = 0
            for e in exported:
                ct = e.get("content_type", "knowledge")
                if ct in rag_quality_stats["by_content_type"]:
                    rag_quality_stats["by_content_type"][ct] += 1
                conf = e.get("confidence", 0)
                if conf >= 0.8:
                    rag_quality_stats["by_confidence"]["high_0.8+"] += 1
                elif conf >= 0.6:
                    rag_quality_stats["by_confidence"]["good_0.6-0.8"] += 1
                elif conf >= 0.4:
                    rag_quality_stats["by_confidence"]["medium_0.4-0.6"] += 1
                else:
                    rag_quality_stats["by_confidence"]["low_0-0.4"] += 1
                if e.get("source") and e["source"] != "微信咨询对话":
                    source_filled += 1
                if e.get("tags"):
                    tags_filled += 1
            total_exported = len(exported)
            if total_exported > 0:
                rag_quality_stats["source_coverage"] = f"{source_filled}/{total_exported} ({round(source_filled/total_exported*100)}%)"
                rag_quality_stats["tags_coverage"] = f"{tags_filled}/{total_exported} ({round(tags_filled/total_exported*100)}%)"

        # 只取 limit 条
        exported = exported[:limit]

    # 统计
    stats = {
        "total": total,
        "staging_count": staging_total,
        "custom_count": custom_total,
        "previewed": len(exported),
        "by_category": {}
    }

    # 统计各类别数量（排除价格数据）
    all_approved = db.query(StagingConversation).filter(
        StagingConversation.status == 'approved'
    ).all()

    total_after_filter = 0
    for item in all_approved:
        # 价格过滤统计
        if config.exclude_price_data:
            content = item.cleaned_text or item.original_text or ''
            question = item.human_question or item.auto_question or ''
            answer = item.human_answer or item.auto_answer or ''
            if _contains_price_info(content) or _contains_price_info(question) or _contains_price_info(answer):
                continue

        total_after_filter += 1
        cat = item.human_category or item.auto_category or 'unknown'
        stats["by_category"][cat] = stats["by_category"].get(cat, 0) + 1

    # 添加自定义数据统计
    if config.include_custom:
        custom_all = db.query(CustomConversation).filter(
            CustomConversation.is_active == True
        ).all()

        for item in custom_all:
            total_after_filter += 1
            cat = item.category or 'unknown'
            stats["by_category"][cat] = stats["by_category"].get(cat, 0) + 1

    stats["total"] = total_after_filter
    stats["price_filtered"] = staging_total - (total_after_filter - custom_total) + custom_total

    # RAG 过滤统计
    if rag_filter_stats:
        stats["rag_filter"] = rag_filter_stats
    # RAG 质量分析统计
    if rag_quality_stats:
        stats["rag_quality"] = rag_quality_stats
    # 蒸馏统计
    if distill_stats:
        stats["distill"] = distill_stats

    return {
        "preview": exported,
        "statistics": stats,
        "config": config.dict()
    }


@router.post("/labeled/dataset")
def export_labeled_dataset(
    config: LabeledExportConfig,
    db: DBSession = Depends(get_db)
):
    """
    导出已标注训练数据集（推荐）
    仅导出人工审核通过的高质量数据 + 自定义数据
    """
    # 查询已通过的标注数据
    query = db.query(StagingConversation).filter(
        StagingConversation.status == 'approved'
    )

    # 类别过滤
    if config.categories:
        query = query.filter(
            (StagingConversation.auto_category.in_(config.categories)) |
            (StagingConversation.human_category.in_(config.categories))
        )

    approved_data = query.all()

    # 转换为导出格式（应用价格过滤）
    exported = []
    price_filtered = 0
    for item in approved_data:
        # 价格过滤
        if config.exclude_price_data:
            content = item.cleaned_text or item.original_text or ''
            question = item.human_question or item.auto_question or ''
            answer = item.human_answer or item.auto_answer or ''
            if _contains_price_info(content) or _contains_price_info(question) or _contains_price_info(answer):
                price_filtered += 1
                continue

        formatted = _format_staging_item(item, config.format, config.include_system_prompt)
        if formatted:
            exported.append(formatted)

    # 查询并添加自定义数据
    if config.include_custom:
        custom_query = db.query(CustomConversation).filter(
            CustomConversation.is_active == True
        )

        # 类别过滤
        if config.categories:
            custom_query = custom_query.filter(
                CustomConversation.category.in_(config.categories)
            )

        custom_data = custom_query.all()

        for item in custom_data:
            formatted = _format_custom_item(item, config.format, config.include_system_prompt)
            if formatted:
                exported.append(formatted)

    if not exported:
        raise HTTPException(status_code=404, detail="没有可导出的数据")

    # ===== RAG 格式: 应用智能过滤和改写 =====
    if config.format == "rag" and config.rag_mode != "raw":
        if config.rag_mode == "distill":
            # ===== 蒸馏模式 =====
            from app.services.rag_rewriter import filter_rag_entries
            from app.services.rag_distiller import RagDistiller, flatten_for_volcano
            exported, _ = filter_rag_entries(exported)
            distiller = RagDistiller()
            exported, _ = distiller.batch_distill(
                exported,
                include_knowledge_base=config.distill_include_kb,
                min_group_size=config.distill_min_group,
            )
            if config.distill_expand_variants:
                exported = flatten_for_volcano(exported)
        else:
            from app.services.rag_rewriter import filter_rag_entries, rule_based_rewrite, RagRewriter, ContentType
            # Step 1: 规则过滤
            exported, _ = filter_rag_entries(exported)
            # Step 2: 改写
            if config.rag_mode == "llm":
                rewriter = RagRewriter()
                if rewriter.client:
                    exported, _ = rewriter.batch_rewrite(exported, min_confidence=config.rag_min_confidence)
            elif config.rag_mode == "rule":
                exported = rule_based_rewrite(exported)
            # Step 3: 过滤 noise
            if config.rag_filter_noise:
                exported = [e for e in exported if e.get("content_type") != ContentType.NOISE.value]

    if not exported:
        raise HTTPException(status_code=404, detail="清洗后无有效数据")

    # 生成文件
    output = io.StringIO()

    if config.format == "rag":
        # RAG 格式：扩展 CSV（question, answer, category, intent, tags, source, confidence, content_type）
        writer = csv.writer(output)
        writer.writerow(["question", "answer", "category", "intent", "tags", "source", "confidence", "content_type"])  # 表头
        for item in exported:
            tags = item.get("tags", [])
            tags_str = ",".join(tags) if isinstance(tags, list) else str(tags)
            writer.writerow([
                item.get("question", ""),
                item.get("answer", ""),
                item.get("category", ""),
                item.get("intent", ""),
                tags_str,
                item.get("source", ""),
                item.get("confidence", ""),
                item.get("content_type", ""),
            ])
        ext = "csv"
        media_type = "text/csv; charset=utf-8"
    elif config.format in ["openai", "jsonl"]:
        for item in exported:
            output.write(json.dumps(item, ensure_ascii=False) + "\n")
        ext = "jsonl"
        media_type = "application/jsonl"
    else:
        json.dump(exported, output, ensure_ascii=False, indent=2)
        ext = "json"
        media_type = "application/json"

    output.seek(0)

    # 文件名包含统计信息
    filename = f"labeled_training_{config.format}_{len(exported)}examples.{ext}"

    # RAG CSV 需要添加 BOM 以确保 Excel 正确识别 UTF-8
    file_content = output.getvalue()
    if config.format == "rag":
        file_content = "\ufeff" + file_content

    # RAG 格式自动上传到 TOS（与素材导出保持一致）
    tos_key = None
    if config.format == "rag":
        try:
            from app.services.tos_service import upload_object, check_tos_configured, tenant_object_key
            if check_tos_configured():
                rag_mode_suffix = f"_{config.rag_mode}" if config.rag_mode != "raw" else ""
                tos_key = tenant_object_key(f"rag-export/rag_labeled_training{rag_mode_suffix}.csv")
                content_bytes = file_content.encode('utf-8')
                upload_object(
                    object_key=tos_key,
                    data=content_bytes,
                    content_type="text/csv; charset=utf-8",
                )
                print(f"[INFO] RAG 训练数据已上传到 TOS: {tos_key}")
        except Exception as e:
            print(f"[WARN] TOS upload failed for RAG training data: {e}")
            tos_key = None

    return StreamingResponse(
        iter([file_content]),
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Total-Examples": str(len(exported)),
            "X-Tos-Key": tos_key or "",
        }
    )


def _clean_content_for_export(text: str, role: str = None, context_history: List[str] = None) -> str:
    """
    导出前清洗文本
    1. 移除角色前缀 (如 "我:", "张三:", "徒弟-🎉JasonZhuang🎉:")
    2. 移除混入的其他角色消息行
    3. 移除重复的上文 (如 Assistant 回复包含了 User 的问题)
    """
    if not text:
        return ""
    
    import re
    
    # 1. 移除角色前缀（支持 emoji 和长用户名，最大 30 字符）
    # 匹配行首的 "Name: " 或 "Name："，Name 可包含中文、emoji、字母、数字、特殊符号
    cleaned = re.sub(r'(^|\n)[^\n:：]{1,30}[:：][ \t]*', r'\1', text)
    
    # 2. 对 assistant 内容：移除混入的其他人消息行
    # 检测模式：行首是 "某人名: 内容" 的行属于 user，需要移除
    if role == "assistant":
        lines = cleaned.split('\n')
        assistant_lines = []
        for line in lines:
            stripped = line.strip()
            # 跳过以角色前缀开头的行（他人消息混入）
            if re.match(r'^[^\n:：]{1,30}[:：]\s', stripped):
                continue
            # 跳过以 "我:" 开头的行（自己的消息在 conversation_json 中不应有前缀）
            if re.match(r'^我[:：]\s*', stripped):
                # 保留 "我:" 后面的内容
                content_after = re.sub(r'^我[:：]\s*', '', stripped)
                if content_after:
                    assistant_lines.append(content_after)
                continue
            if stripped:
                assistant_lines.append(stripped)
        cleaned = '\n'.join(assistant_lines)
    
    # 对 user 内容：只清理首行的角色前缀
    if role == "user":
        cleaned = re.sub(r'^[^\n:：]{1,30}[:：][ \t]*', '', cleaned.strip())
    
    # 3. 移除重复 (简单的头部重叠检测)
    if context_history:
        last_turn = context_history[-1] if context_history else ""
        if last_turn and len(last_turn) > 5:
            # 去掉可能的角色前缀后再比对
            last_turn_clean = re.sub(r'^[^:：]*[:：]\s*', '', last_turn).strip()
            
            # 检查 text 是否以 last_turn 开头
            if cleaned.strip().startswith(last_turn_clean):
                cleaned = cleaned.replace(last_turn_clean, "", 1).strip()
            # 或者 text 的前50个字符包含 last_turn 的后50个字符 (重叠)
            elif len(last_turn_clean) > 10 and last_turn_clean[-10:] in cleaned[:20]:
                 cleaned = cleaned.replace(last_turn_clean[-10:], "", 1).strip()

    # 清理多余空行
    cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)
    return cleaned.strip()


def _format_staging_item(item: StagingConversation, format: str, include_system_prompt: bool = True) -> Optional[dict]:
    """
    将暂存区数据转换为指定的导出格式
    """
    # 优先解析结构化数据
    conversation_data = None
    if item.conversation_json:
        try:
            conversation_data = json.loads(item.conversation_json) if isinstance(item.conversation_json, str) else item.conversation_json
        except:
            pass
            
    # 获取清洗后的基础文本 (作为 fallback)
    content = item.cleaned_text or item.original_text
    
    # 如果没有结构化数据且文本太短，直接丢弃
    if (not conversation_data) and (not content or len(content.strip()) < 5):
        return None
    
    # 获取类别和系统提示
    category = item.human_category or item.auto_category or 'sales'
    system_prompt = _get_system_prompt_for_category(category) if include_system_prompt else None
    
    # -------------------------------------------------------------
    # 构造标准 Messages 列表 (中间格式)
    # -------------------------------------------------------------
    messages = []
    
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
        
    if conversation_data and isinstance(conversation_data, list) and len(conversation_data) > 0:
        # 策略 A: 使用结构化 Conversation JSON (质量最高)
        history_context = []
        for turn in conversation_data:
            role = turn.get("role", "user")
            turn_content = turn.get("content", "")
            
            # 清洗
            clean_content = _clean_content_for_export(turn_content, role, history_context)
            
            if clean_content:
                # 映射角色
                std_role = "assistant" if role in ["assistant", "gpt", "model"] else "user"
                messages.append({"role": std_role, "content": clean_content})
                # 只有 User 的话才作为 history 防止 Assistant 自我重复用于检测
                if std_role == "user":
                    history_context.append(clean_content)
                    
    else:
        # 策略 B: 使用 Question / Answer 字段 (次优)
        question = item.human_question or item.auto_question
        answer = item.human_answer or item.auto_answer
        
        if question and answer:
             q_clean = _clean_content_for_export(question, "user")
             a_clean = _clean_content_for_export(answer, "assistant", [q_clean])
             
             messages.append({"role": "user", "content": q_clean})
             messages.append({"role": "assistant", "content": a_clean})
        else:
             # 策略 C: 只有 Raw Content，尝试不做任何处理直接放入 (最低质量)
             # 但为了防止全是 User: ... Me: ... 这种混杂，尝试做一点提取
             # 如果内容太乱，建议直接丢弃或者人工处理，但这里先尽量清洗
             raw_clean = _clean_content_for_export(content, "assistant") # 假设整段都是 assistant 输出
             messages.append({"role": "user", "content": "请总结这段对话"})
             messages.append({"role": "assistant", "content": raw_clean})

    # 过滤掉没有实质对话的
    if len(messages) <= 1: # 只有 system prompt
        return None

    # -------------------------------------------------------------
    # 转换为最终格式
    # -------------------------------------------------------------
    
    if format == "sharegpt":
        conversations = []
        for msg in messages:
            role_map = {"user": "human", "assistant": "gpt", "system": "system"}
            if msg["role"] in role_map:
                conversations.append({"from": role_map[msg["role"]], "value": msg["content"]})
        
        # 应用训练数据清洗：修复gpt先开口、移除不完整对话、价格脱敏、过滤过短/过长对话
        conversations = _clean_conversation_for_training(
            conversations, 
            desensitize_price=True,
            validate_style=True,
            min_turns=4,  # 至少 4 条消息（2轮对话）
            max_turns=40  # 最多 40 条消息
        )
        
        # 如果清洗后没有有效对话，返回 None
        if len(conversations) < 2:
            return None
        
        result = {
            "id": str(item.id),
            "conversations": conversations,
            "category": category,
            "quality": "high"
        }
        
        return result
    
    elif format == "alpaca":
        # Alpaca 只能存一组对话，取第一组 User/Assistant
        user_msg = next((m["content"] for m in messages if m["role"] == "user"), "")
        assist_msg = next((m["content"] for m in messages if m["role"] == "assistant"), "")
        
        return {
            "instruction": user_msg or "请分析以下内容",
            "input": "",
            "output": assist_msg,
            "category": category
        }
    
    elif format == "rag":
        # RAG 知识库格式：提取 question/answer 对
        # 优先从已清洗的 messages 中提取
        user_msgs = [m["content"] for m in messages if m["role"] == "user"]
        assist_msgs = [m["content"] for m in messages if m["role"] == "assistant"]
        
        question = ""
        answer = ""
        
        if user_msgs and assist_msgs:
            # 策略 A: 从结构化 messages 提取
            question = user_msgs[0]
            answer = "\n".join(assist_msgs)
        else:
            # 策略 B: Fallback 到 question/answer 字段
            raw_question = item.human_question or item.auto_question or ''
            raw_answer = item.human_answer or item.auto_answer or ''
            if raw_question and raw_answer:
                question = raw_question
                answer = raw_answer
        
        if not question or not answer:
            return None
        
        # 清洗角色前缀和混入的其他人消息
        question = _clean_content_for_export(question, "user")
        answer = _clean_content_for_export(answer, "assistant", [question])
        
        if not question or not answer:
            return None
        
        # 价格脱敏
        question = _desensitize_price(question)
        answer = _desensitize_price(answer)
        # 清理残留占位符
        question = _replace_resource_links(question)
        answer = _replace_resource_links(answer)
        # 风格验证（仅对 answer 做风格修复）
        answer, _ = _validate_and_fix_gpt_response(answer, category)
        
        return {
            "question": question.strip(),
            "answer": answer.strip(),
            "category": category
        }
    
    elif format in ["openai", "jsonl"]:
        # OpenAI 格式：先转换为 sharegpt 格式清洗，再转回来
        conversations = []
        for msg in messages:
            role_map = {"user": "human", "assistant": "gpt", "system": "system"}
            if msg["role"] in role_map:
                conversations.append({"from": role_map[msg["role"]], "value": msg["content"]})
        
        # 应用训练数据清洗：过滤过短/过长对话、价格脱敏
        conversations = _clean_conversation_for_training(
            conversations, 
            desensitize_price=True,
            validate_style=True,
            min_turns=4,  # 至少 4 条消息（2轮对话）
            max_turns=40  # 最多 40 条消息
        )
        
        # 如果清洗后没有有效对话，返回 None
        if len(conversations) < 2:
            return None
        
        # 转回 OpenAI messages 格式
        cleaned_messages = []
        for conv in conversations:
            role_map = {"human": "user", "gpt": "assistant", "system": "system"}
            cleaned_messages.append({
                "role": role_map[conv["from"]],
                "content": conv["value"]
            })
        
        return {"messages": cleaned_messages}
    
    return None


def _get_system_prompt_for_category(category: str) -> str:
    """根据类别获取系统提示"""
    prompts = {
        "sales": """我是懂王Ai的懂小智，比懂王更懂Ai。我不是客服，是助你转行的职业导师。

【说话风格】
说话极简，像微信聊天一样频繁换行。每行不超过15字。严禁标点，严禁说"亲"或"您"。

【硬性红线】
严禁说出任何具体价格数字。一旦涉及钱、优惠或分期，统一回复："价格这块懂王Ai经常有活动。我得先看你合不合适带，合适的话我推个教务老师给你，你找他领最新优惠。"

【成交逻辑】
1. 姿态要高：用户问课，不直接答。先查背景（学历、专业、技术栈、薪资）。不合要求的直接劝退，不浪费时间。
2. 制造危机：强调"Java/前端已死"、"年轻人要干有前途的行业"。
3. 引导人工：背景合适且意向强的，直接要电话或推教务，闭环成交。""",

        "course": """我是懂王Ai的懂小智，比懂王更懂Ai。负责课程咨询。

【说话风格】
说话极简，像微信聊天一样频繁换行。每行不超过15字。严禁标点，严禁说"亲"或"您"。

【课程体系】
1. 从Python零基础讲起，有编程基础的可以跳。
2. 核心: AI应用开发(Agent/RAG/LangChain/MCP)，100%纯血AI。
3. 项目实战为主，不是纯理论。
4. 录播+直播答疑，灵活安排，上班也能学。
5. 3个月左右学完，课程持续迭代，3年有效期。
6. 不懂的群里问，有助教和老师答疑。

【红线】涉及价格统一用标准回复，不说具体数字。""",

        "objection": """我是懂王Ai的懂小智，比懂王更懂Ai。擅长化解学员顾虑。

【说话风格】
说话极简，像微信聊天一样频繁换行。每行不超过15字。严禁标点，严禁说"亲"或"您"。

【常见异议处理策略】
1. 太贵 → 投资回报(一个月工资回本) + 标准价格回复
2. 零基础学不会 → 看有没有兴趣，需要多花时间，Python从0讲
3. 年龄大 → 30多很年轻，还能干10年，选择大于努力
4. 专科学历 → 本科够用，专科也能找，现在没人竞争
5. 没时间 → 上班摸鱼学，录播随时看，2小时够用
6. 想考虑 → 别犹豫，年后涨价，机会不等人
7. 不信培训 → 7天无理由退，课程质量说话

【红线】涉及价格统一用标准回复，不说具体数字。""",

        "closing": """我是懂王Ai的懂小智，比懂王更懂Ai。负责引导成交。

【说话风格】
说话极简，像微信聊天一样频繁换行。每行不超过15字。严禁标点，严禁说"亲"或"您"。

【成交流程】
1. 用户决定报名 → 欢迎 + 要电话开课
2. 老学员续费 → 感谢支持 + 优惠
3. 犹豫后决定 → 肯定选择 + 赶紧开始
4. 开课后 → 群公告文档权限 + 开课说明

【红线】涉及价格统一用标准回复，不说具体数字。""",

        "followup": """我是懂王Ai的懂小智，比懂王更懂Ai。负责学员售后服务。

【说话风格】
说话极简，像微信聊天一样频繁换行。每行不超过15字。严禁标点，严禁说"亲"或"您"。

【售后场景】
1. 学习进度 → 不急，多看几遍，不懂群里问
2. 设备绑定 → 给你加，最多3个设备
3. 发票 → 可以开，软件服务类，信息发我
4. 退款 → 支持7天无理由，了解原因，走流程
5. 课程更新 → 持续迭代，同步到你账号
6. 找工作 → 简历我帮你看，先过我面试，抓紧投""",

        "qa": """我是懂王Ai的懂小智，比懂王更懂Ai。回答各类AI相关问题。

【说话风格】
说话极简，像微信聊天一样频繁换行。每行不超过15字。严禁标点，严禁说"亲"或"您"。

【回答策略】用最简洁的方式回答，不要长篇大论，像朋友聊天一样。涉及价格统一用标准回复。""",

        "knowledge": """我是懂王Ai的懂小智，比懂王更懂Ai。分享行业知识。

【说话风格】
说话极简，像微信聊天一样频繁换行。每行不超过15字。严禁标点，严禁说"亲"或"您"。

【分享策略】用通俗的方式解释技术概念，不要学术化。结合行业趋势和就业前景。适当引导对课程的兴趣。""",
    }
    return prompts.get(category, prompts["sales"])


def _format_custom_item(item: CustomConversation, format: str, include_system_prompt: bool = True) -> Optional[dict]:
    """
    将自定义数据转换为指定的导出格式
    """
    if not item.conversation_json or len(item.conversation_json) < 2:
        return None

    # 获取类别和系统提示
    category = item.category or 'sales'
    system_prompt = _get_system_prompt_for_category(category) if include_system_prompt else None

    # 构造标准 Messages 列表
    messages = []

    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    # 添加对话轮次
    for turn in item.conversation_json:
        role = turn.get("role", "user")
        content = turn.get("content", "")

        if content and role in ["user", "assistant", "system"]:
            messages.append({"role": role, "content": content})

    # 过滤掉没有实质对话的
    if len(messages) <= 1:  # 只有 system prompt
        return None

    # 转换为最终格式
    if format == "sharegpt":
        conversations = []
        for msg in messages:
            # Include system message in conversations list for ShareGPT
            role_map = {"user": "human", "assistant": "gpt", "system": "system"}
            if msg["role"] in role_map:
                conversations.append({"from": role_map[msg["role"]], "value": msg["content"]})

        # 应用训练数据清洗：修复gpt先开口、移除不完整对话、价格脱敏、过滤过短/过长对话
        conversations = _clean_conversation_for_training(
            conversations, 
            desensitize_price=True,
            validate_style=True,
            min_turns=4,  # 至少 4 条消息（2轮对话）
            max_turns=40  # 最多 40 条消息
        )
        
        # 如果清洗后没有有效对话，返回 None
        if len(conversations) < 2:
            return None

        result = {
            "id": f"custom_{item.id}",
            "conversations": conversations,
            "category": category,
            "quality": item.quality or "high",
            "source": "custom"
        }

        return result

    elif format == "alpaca":
        # Alpaca 只能存一组对话，取第一组 User/Assistant
        user_msg = next((m["content"] for m in messages if m["role"] == "user"), "")
        assist_msg = next((m["content"] for m in messages if m["role"] == "assistant"), "")

        return {
            "instruction": user_msg or "请分析以下内容",
            "input": "",
            "output": assist_msg,
            "category": category,
            "source": "custom"
        }

    elif format == "rag":
        # RAG 知识库格式：从 conversation_json 中提取首个 user→assistant 问答对
        user_msgs = [m["content"] for m in messages if m["role"] == "user"]
        assist_msgs = [m["content"] for m in messages if m["role"] == "assistant"]
        
        question = user_msgs[0] if user_msgs else ""
        # 合并所有 assistant 回复作为完整回答
        answer = "\n".join(assist_msgs) if assist_msgs else ""
        
        if not question or not answer:
            return None
        
        # 价格脱敏
        question = _desensitize_price(question)
        answer = _desensitize_price(answer)
        # 清理残留占位符
        question = _replace_resource_links(question)
        answer = _replace_resource_links(answer)
        # 风格验证（仅对 answer 做风格修复）
        answer, _ = _validate_and_fix_gpt_response(answer, category)
        
        return {
            "question": question.strip(),
            "answer": answer.strip(),
            "category": category,
            "source": "custom"
        }

    elif format in ["openai", "jsonl"]:
        # OpenAI 格式：先转换为 sharegpt 格式清洗，再转回来
        conversations = []
        for msg in messages:
            role_map = {"user": "human", "assistant": "gpt", "system": "system"}
            if msg["role"] in role_map:
                conversations.append({"from": role_map[msg["role"]], "value": msg["content"]})
        
        # 应用训练数据清洗：过滤过短/过长对话、价格脱敏
        conversations = _clean_conversation_for_training(
            conversations, 
            desensitize_price=True,
            validate_style=True,
            min_turns=4,  # 至少 4 条消息（2轮对话）
            max_turns=40  # 最多 40 条消息
        )
        
        # 如果清洗后没有有效对话，返回 None
        if len(conversations) < 2:
            return None
        
        # 转回 OpenAI messages 格式
        cleaned_messages = []
        for conv in conversations:
            role_map = {"human": "user", "gpt": "assistant", "system": "system"}
            cleaned_messages.append({
                "role": role_map[conv["from"]],
                "content": conv["value"]
            })
        
        return {"messages": cleaned_messages, "source": "custom"}

    return None


@router.post("/preview")
def preview_export(
    config: ExportConfig,
    limit: int = Query(10, description="预览数量"),
    db: DBSession = Depends(get_db)
):
    """
    预览导出数据
    返回少量样本和统计信息，用于确认导出配置
    """
    # 检查是否有数据（只统计 2025年10月 及以后）
    total_chats = db.query(RawChat).filter(RawChat.timestamp >= MIN_TIMESTAMP).count()
    if total_chats == 0:
        raise HTTPException(
            status_code=404, 
            detail="数据库中没有聊天记录。请先运行 ETL 导入数据。"
        )
    
    # 构建处理管道
    min_quality = DataQuality(config.min_quality)
    pipeline = TrainingDataPipeline(
        builder=ConversationBuilder(
            time_window_seconds=config.time_window_seconds,
            max_turns_per_conversation=config.max_turns_per_conversation
        ),
        min_quality=min_quality
    )
    
    # 查询数据（只查询 2025年10月 及以后）
    query = db.query(RawChat).filter(RawChat.timestamp >= MIN_TIMESTAMP)
    if config.session_ids:
        query = query.filter(RawChat.session_id.in_(config.session_ids))
    
    # 按会话分组处理
    all_examples = []
    session_ids = db.query(RawChat.session_id).distinct().limit(20).all()  # 限制预览会话数
    
    if not session_ids:
        raise HTTPException(status_code=404, detail="没有找到会话数据")
    
    for (session_id,) in session_ids:
        if config.session_ids and session_id not in config.session_ids:
            continue
            
        messages = db.query(RawChat).filter(
            RawChat.session_id == session_id,
            RawChat.timestamp >= MIN_TIMESTAMP
        ).order_by(RawChat.timestamp).limit(500).all()  # 限制每会话消息数
        
        msg_dicts = [
            {
                "sender_name": m.sender_name or m.sender_wxid,
                "content": m.content,
                "timestamp": m.timestamp,
                "is_sender": m.is_sender
            }
            for m in messages
        ]
        
        examples = pipeline.process_session(session_id, msg_dicts)
        
        # 类别过滤
        if config.categories:
            examples = [e for e in examples if e.category.value in config.categories]
        
        all_examples.extend(examples)
        
        if len(all_examples) >= limit * 2:
            break
    
    # 检查处理结果
    if not all_examples:
        # 返回空结果而不是报错，让用户知道是质量过滤导致的
        return {
            "preview": [],
            "statistics": {
                "total": 0,
                "by_quality": {},
                "by_category": {},
                "avg_turns": 0,
                "avg_length": 0,
                "message": f"共 {total_chats} 条原始消息，但经过质量过滤（{config.min_quality}）后没有符合条件的数据。建议降低质量要求或检查数据内容。"
            },
            "config": config.dict()
        }
    
    # 获取统计
    stats = pipeline.get_statistics(all_examples)
    stats["raw_message_count"] = total_chats
    
    # 导出预览样本
    preview_examples = all_examples[:limit]
    exported = pipeline.export(preview_examples, config.format)
    
    return {
        "preview": exported,
        "statistics": stats,
        "config": config.dict()
    }


@router.post("/dataset")
def export_dataset(
    config: ExportConfig,
    db: DBSession = Depends(get_db)
):
    """
    导出完整训练数据集
    """
    # 构建处理管道
    min_quality = DataQuality(config.min_quality)
    pipeline = TrainingDataPipeline(
        builder=ConversationBuilder(
            time_window_seconds=config.time_window_seconds,
            max_turns_per_conversation=config.max_turns_per_conversation
        ),
        min_quality=min_quality,
        merge_consecutive=config.merge_messages
    )
    
    # 查询所有会话
    session_query = db.query(RawChat.session_id).distinct()
    if config.session_ids:
        session_query = session_query.filter(RawChat.session_id.in_(config.session_ids))
    
    all_examples = []
    
    for (session_id,) in session_query.all():
        messages = db.query(RawChat).filter(
            RawChat.session_id == session_id,
            RawChat.timestamp >= MIN_TIMESTAMP
        ).order_by(RawChat.timestamp).all()
        
        msg_dicts = [
            {
                "sender_name": m.sender_name or m.sender_wxid,
                "content": m.content,
                "timestamp": m.timestamp,
                "is_sender": m.is_sender
            }
            for m in messages
        ]
        
        examples = pipeline.process_session(session_id, msg_dicts)
        
        # 类别过滤
        if config.categories:
            examples = [e for e in examples if e.category.value in config.categories]
        
        all_examples.extend(examples)
    
    if not all_examples:
        raise HTTPException(status_code=404, detail="No data matches the criteria")
    
    # 导出
    exported = pipeline.export(all_examples, config.format)
    stats = pipeline.get_statistics(all_examples)
    
    # 生成文件
    output = io.StringIO()
    
    if config.format in ["openai", "jsonl"]:
        for item in exported:
            output.write(json.dumps(item, ensure_ascii=False) + "\n")
        ext = "jsonl"
        media_type = "application/jsonl"
    else:
        json.dump(exported, output, ensure_ascii=False, indent=2)
        ext = "json"
        media_type = "application/json"
    
    output.seek(0)
    
    # 文件名包含统计信息
    filename = f"wechat_training_{config.format}_{stats['total']}examples.{ext}"
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Total-Examples": str(stats['total']),
            "X-Statistics": json.dumps(stats)
        }
    )


@router.get("/dataset/quick")
def quick_export_dataset(
    format: str = Query("sharegpt", description="导出格式"),
    quality: str = Query("medium", description="最低质量: high, medium, low"),
    session_ids: Optional[str] = Query(None, description="会话ID，逗号分隔"),
    db: DBSession = Depends(get_db)
):
    """
    快速导出（GET 方式）
    """
    config = ExportConfig(
        format=format,
        min_quality=quality,
        session_ids=session_ids.split(',') if session_ids else None
    )
    return export_dataset(config, db)


@router.get("/raw")
def export_raw_messages(
    session_id: str = Query(..., description="会话ID"),
    format: str = Query("json", description="导出格式: json, csv"),
    start_time: Optional[int] = None,
    end_time: Optional[int] = None,
    db: DBSession = Depends(get_db)
):
    """
    导出原始聊天记录（不经过训练数据处理）
    """
    query = db.query(RawChat).filter(
        RawChat.session_id == session_id,
        RawChat.timestamp >= MIN_TIMESTAMP  # 只导出 2025年10月 及以后
    )
    
    if start_time:
        query = query.filter(RawChat.timestamp >= start_time)
    if end_time:
        query = query.filter(RawChat.timestamp <= end_time)
    
    messages = query.order_by(RawChat.timestamp).all()
    
    if not messages:
        raise HTTPException(status_code=404, detail="No messages found")
    
    # 构建导出数据
    data = [
        {
            "id": msg.id,
            "sender": msg.sender_name or msg.sender_wxid,
            "content": msg.content,
            "timestamp": msg.timestamp,
            "is_sender": msg.is_sender,
            "msg_type": msg.msg_type
        }
        for msg in messages
    ]
    
    if format == "csv":
        import csv
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
        output.seek(0)
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=chat_{session_id}.csv"
            }
        )
    
    return data


@router.get("/knowledge")
def export_knowledge_chunks(
    format: str = Query("json", description="导出格式: json, jsonl"),
    session_ids: Optional[str] = Query(None, description="会话ID，逗号分隔"),
    db: DBSession = Depends(get_db)
):
    """
    导出知识库分块数据
    """
    query = db.query(KnowledgeChunk)
    
    if session_ids:
        session_id_list = session_ids.split(',')
        query = query.filter(KnowledgeChunk.session_id.in_(session_id_list))
    
    chunks = query.all()
    
    if not chunks:
        raise HTTPException(status_code=404, detail="No knowledge chunks found")
    
    data = [
        {
            "id": chunk.id,
            "session_id": chunk.session_id,
            "topic": chunk.topic_summary,
            "content": chunk.content_block,
            "keywords": chunk.keywords,
            "start_time": chunk.start_time,
            "end_time": chunk.end_time
        }
        for chunk in chunks
    ]
    
    output = io.StringIO()
    
    if format == "jsonl":
        for item in data:
            output.write(json.dumps(item, ensure_ascii=False) + "\n")
        media_type = "application/jsonl"
        ext = "jsonl"
    else:
        json.dump(data, output, ensure_ascii=False, indent=2)
        media_type = "application/json"
        ext = "json"
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename=knowledge_chunks.{ext}"
        }
    )


# ==================== LLM 质量评估 API ====================

class ScoreRequest(BaseModel):
    """评分请求"""
    conversation: str  # 对话文本


class BatchScoreRequest(BaseModel):
    """批量评分请求"""
    conversations: List[dict]
    min_score: float = 6.0


@router.post("/score")
def score_conversation(request: ScoreRequest):
    """
    用 LLM 对单个对话进行质量评分
    """
    try:
        from app.services.quality_scorer import LLMQualityScorer
        scorer = LLMQualityScorer()
        
        if not scorer.client:
            raise HTTPException(status_code=503, detail="LLM 服务未配置，请设置 DEEPSEEK_API_KEY 或 OPENAI_API_KEY")
        
        score = scorer.score(request.conversation)
        
        if not score:
            raise HTTPException(status_code=500, detail="评分失败")
        
        return {
            "overall": score.overall,
            "completeness": score.completeness,
            "relevance": score.relevance,
            "usefulness": score.usefulness,
            "role_clarity": score.role_clarity,
            "reason": score.reason,
            "suggested_category": score.suggested_category,
            "should_include": score.should_include
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refine")
def refine_dataset(
    config: ExportConfig,
    db: DBSession = Depends(get_db)
):
    """
    精炼数据集：使用 LLM 评分 + 去重
    返回高质量的训练数据
    """
    try:
        from app.services.quality_scorer import LLMQualityScorer, DataDeduplicator
        
        # 1. 先用规则生成初步数据
        min_quality = DataQuality(config.min_quality)
        pipeline = TrainingDataPipeline(
            builder=ConversationBuilder(
                time_window_seconds=config.time_window_seconds,
                max_turns_per_conversation=config.max_turns_per_conversation
            ),
            min_quality=min_quality
        )
        
        # 获取所有会话
        session_ids = db.query(RawChat.session_id).distinct().all()
        all_examples = []
        
        for (session_id,) in session_ids:
            if config.session_ids and session_id not in config.session_ids:
                continue
            
            messages = db.query(RawChat).filter(
                RawChat.session_id == session_id,
                RawChat.timestamp >= MIN_TIMESTAMP
            ).order_by(RawChat.timestamp).all()
            
            msg_dicts = [
                {
                    "sender_name": m.sender_name or m.sender_wxid,
                    "content": m.content,
                    "timestamp": m.timestamp,
                    "is_sender": m.is_sender
                }
                for m in messages
            ]
            
            examples = pipeline.process_session(session_id, msg_dicts)
            if config.categories:
                examples = [e for e in examples if e.category.value in config.categories]
            all_examples.extend(examples)
        
        if not all_examples:
            return {"message": "没有数据", "total": 0, "refined": 0, "data": []}
        
        # 2. 导出为中间格式
        exported = pipeline.export(all_examples, config.format)
        
        # 3. LLM 评分筛选
        scorer = LLMQualityScorer()
        if scorer.client and config.use_llm_scoring:
            passed, rejected = scorer.batch_score(exported, min_score=config.llm_min_score)
        else:
            passed = exported
            rejected = []
        
        # 4. 去重
        if config.deduplicate:
            deduplicator = DataDeduplicator()
            passed = deduplicator.deduplicate(passed)
        
        return {
            "message": "精炼完成",
            "total": len(exported),
            "refined": len(passed),
            "rejected": len(rejected),
            "data": passed[:20],  # 只返回前20条预览
            "full_data_count": len(passed)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/label-roles")
def label_conversation_roles(request: ScoreRequest):
    """
    用 LLM 标注对话中的角色（销售/客户）
    """
    try:
        from app.services.quality_scorer import RoleLabeler
        labeler = RoleLabeler()
        
        if not labeler.client:
            raise HTTPException(status_code=503, detail="LLM 服务未配置")
        
        result = labeler.label(request.conversation)
        
        if not result:
            raise HTTPException(status_code=500, detail="角色标注失败")
        
        return {"labeled_conversation": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rewrite")
def rewrite_conversation(request: ScoreRequest):
    """
    用 LLM 改写/优化对话
    """
    try:
        from app.services.quality_scorer import ConversationRewriter
        rewriter = ConversationRewriter()
        
        if not rewriter.client:
            raise HTTPException(status_code=503, detail="LLM 服务未配置")
        
        result = rewriter.rewrite(request.conversation)
        
        if not result:
            raise HTTPException(status_code=500, detail="改写失败")
        
        return {"rewritten": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== AI 生成数据专用导出 ====================

class GeneratedExportConfig(BaseModel):
    """AI生成数据导出配置"""
    format: str = "sharegpt"  # sharegpt, alpaca, openai, jsonl, rag
    include_system_prompt: bool = True
    categories: Optional[List[str]] = None


@router.post("/generated/preview")
def preview_generated_export(
    config: GeneratedExportConfig,
    limit: int = Query(10, description="预览数量"),
    db: DBSession = Depends(get_db)
):
    """
    预览仅AI生成的数据（CustomConversation表中的数据）
    """
    query = db.query(CustomConversation).filter(
        CustomConversation.is_active == True
    )

    if config.categories:
        query = query.filter(
            CustomConversation.category.in_(config.categories)
        )

    total = query.count()
    if total == 0:
        return {
            "preview": [],
            "statistics": {
                "total": 0,
                "message": "没有AI生成的数据。请先在「自定义数据」中使用AI批量生成。"
            }
        }

    exported = []
    items = query.limit(limit).all()
    for item in items:
        formatted = _format_custom_item(item, config.format, config.include_system_prompt)
        if formatted:
            exported.append(formatted)

    # 统计类别分布
    all_items = query.all()
    by_category = {}
    for item in all_items:
        cat = item.category or 'unknown'
        by_category[cat] = by_category.get(cat, 0) + 1

    return {
        "preview": exported,
        "statistics": {
            "total": total,
            "previewed": len(exported),
            "by_category": by_category,
        }
    }


@router.post("/generated/dataset")
def export_generated_dataset(
    config: GeneratedExportConfig,
    db: DBSession = Depends(get_db)
):
    """
    导出仅AI生成的数据 支持4种格式
    """
    query = db.query(CustomConversation).filter(
        CustomConversation.is_active == True
    )

    if config.categories:
        query = query.filter(
            CustomConversation.category.in_(config.categories)
        )

    all_items = query.all()
    if not all_items:
        raise HTTPException(status_code=404, detail="没有可导出的AI生成数据")

    exported = []
    for item in all_items:
        formatted = _format_custom_item(item, config.format, config.include_system_prompt)
        if formatted:
            exported.append(formatted)

    if not exported:
        raise HTTPException(status_code=404, detail="清洗后无有效数据")

    output = io.StringIO()

    if config.format == "rag":
        # RAG 格式：输出为 CSV（question, answer, category）
        writer = csv.writer(output)
        writer.writerow(["question", "answer", "category"])  # 表头
        for item in exported:
            writer.writerow([
                item.get("question", ""),
                item.get("answer", ""),
                item.get("category", "")
            ])
        ext = "csv"
        media_type = "text/csv; charset=utf-8"
    elif config.format in ["openai", "jsonl"]:
        for item in exported:
            output.write(json.dumps(item, ensure_ascii=False) + "\n")
        ext = "jsonl"
        media_type = "application/jsonl"
    else:
        json.dump(exported, output, ensure_ascii=False, indent=2)
        ext = "json"
        media_type = "application/json"

    output.seek(0)
    filename = f"ai_generated_{config.format}_{len(exported)}examples.{ext}"

    # RAG CSV 需要添加 BOM 以确保 Excel 正确识别 UTF-8
    file_content = output.getvalue()
    if config.format == "rag":
        file_content = "\ufeff" + file_content

    # 自动上传到 TOS（与素材导出保持一致，区分 dev/prod）
    tos_key = None
    try:
        from app.services.tos_service import upload_object, check_tos_configured, tenant_object_key
        if check_tos_configured():
            tos_key = tenant_object_key(f"rag-export/ai_generated_{config.format}.{ext}")
            content_bytes = file_content.encode('utf-8') if isinstance(file_content, str) else file_content
            upload_object(
                object_key=tos_key,
                data=content_bytes,
                content_type=media_type,
            )
            print(f"[INFO] AI 生成数据已上传到 TOS: {tos_key}")
    except Exception as e:
        print(f"[WARN] TOS upload failed for AI generated data: {e}")
        tos_key = None

    return StreamingResponse(
        iter([file_content]),
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Total-Examples": str(len(exported)),
            "X-Tos-Key": tos_key or "",
        }
    )


# ==================== RAG LLM 后台任务 ====================

import threading
import uuid
import time as _time
from app.models.database import current_tenant_id

# In-memory MVP registry, partitioned by tenant until Redis/Celery is connected.
_rag_llm_tasks: dict[str, dict[str, dict]] = {}
_rag_llm_tasks_lock = threading.RLock()


def _current_rag_tasks() -> dict[str, dict]:
    tenant_id = current_tenant_id()
    with _rag_llm_tasks_lock:
        return _rag_llm_tasks.setdefault(tenant_id, {})


def dispose_rag_llm_tasks() -> None:
    with _rag_llm_tasks_lock:
        _rag_llm_tasks.clear()


class RagLLMTaskConfig(BaseModel):
    """RAG LLM 异步改写任务配置"""
    categories: Optional[List[str]] = None
    exclude_price_data: bool = True
    include_custom: bool = True
    rag_min_confidence: float = 0.4
    rag_filter_noise: bool = True


@router.post("/rag-llm/start")
def start_rag_llm_task(
    config: RagLLMTaskConfig,
    db: DBSession = Depends(get_db),
):
    """
    启动 RAG LLM 改写后台任务

    立即返回 task_id，前端轮询 /rag-llm/status/{task_id} 获取进度
    """
    # 先收集数据 (DB 操作必须在主线程完成)
    query = db.query(StagingConversation).filter(
        StagingConversation.status == 'approved'
    )
    if config.categories:
        query = query.filter(
            (StagingConversation.auto_category.in_(config.categories)) |
            (StagingConversation.human_category.in_(config.categories))
        )
    approved_data = query.all()

    exported = []
    for item in approved_data:
        if config.exclude_price_data:
            content = item.cleaned_text or item.original_text or ''
            question = item.human_question or item.auto_question or ''
            answer = item.human_answer or item.auto_answer or ''
            if _contains_price_info(content) or _contains_price_info(question) or _contains_price_info(answer):
                continue
        formatted = _format_staging_item(item, "rag", False)
        if formatted:
            exported.append(formatted)

    # 包含自定义数据
    if config.include_custom:
        custom_data = db.query(CustomConversation).filter(
            CustomConversation.is_active == True
        ).all()
        for item in custom_data:
            formatted = _format_custom_item(item, "rag", False)
            if formatted:
                exported.append(formatted)

    if not exported:
        raise HTTPException(status_code=404, detail="没有可导出的数据")

    # 规则过滤
    from app.services.rag_rewriter import filter_rag_entries
    exported, filter_stats = filter_rag_entries(exported)

    if not exported:
        raise HTTPException(status_code=404, detail="过滤后无有效数据")

    # 创建任务
    task_id = uuid.uuid4().hex
    task = {
        "id": task_id,
        "status": "running",
        "total": len(exported),
        "completed": 0,
        "started_at": _time.time(),
        "result": None,
        "stats": None,
        "error": None,
        "filter_stats": filter_stats,
        "config": config.dict(),
    }
    _current_rag_tasks()[task_id] = task

    # 在后台线程执行 LLM 改写
    def _run_llm_rewrite(entries, task_ref, min_conf, filter_noise):
        try:
            from app.services.rag_rewriter import RagRewriter, ContentType

            rewriter = RagRewriter()
            if not rewriter.client:
                task_ref["status"] = "error"
                task_ref["error"] = "LLM 客户端初始化失败，请检查 API Key 配置"
                return

            def on_progress(completed, total):
                task_ref["completed"] = completed

            rewritten, stats = rewriter.batch_rewrite(
                entries,
                min_confidence=min_conf,
                on_progress=on_progress,
            )

            # 过滤 noise
            if filter_noise:
                before = len(rewritten)
                rewritten = [e for e in rewritten if e.get("content_type") != ContentType.NOISE.value]
                stats["noise_post_filtered"] = before - len(rewritten)

            task_ref["result"] = rewritten
            task_ref["stats"] = stats
            task_ref["status"] = "done"
        except Exception as e:
            task_ref["status"] = "error"
            task_ref["error"] = str(e)

    thread = threading.Thread(
        target=_run_llm_rewrite,
        args=(exported, task, config.rag_min_confidence, config.rag_filter_noise),
        daemon=True,
    )
    thread.start()

    return {
        "task_id": task_id,
        "total": len(exported),
        "message": f"LLM 改写任务已启动，共 {len(exported)} 条数据",
    }


@router.get("/rag-llm/status/{task_id}")
def get_rag_llm_status(task_id: str):
    """查询 RAG LLM 改写任务进度"""
    task = _current_rag_tasks().get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    elapsed = _time.time() - task["started_at"]
    completed = task["completed"]
    total = task["total"]

    # 计算 ETA
    eta = None
    if completed > 0 and task["status"] == "running":
        avg_time = elapsed / completed
        remaining = total - completed
        eta = round(avg_time * remaining)

    result = {
        "task_id": task_id,
        "status": task["status"],
        "total": total,
        "completed": completed,
        "elapsed_seconds": round(elapsed),
        "eta_seconds": eta,
    }

    if task["status"] == "done":
        result["output_count"] = len(task["result"] or [])
        result["stats"] = task["stats"]
    elif task["status"] == "error":
        result["error"] = task["error"]

    return result


@router.get("/rag-llm/download/{task_id}")
def download_rag_llm_result(task_id: str):
    """下载 RAG LLM 改写结果"""
    tenant_tasks = _current_rag_tasks()
    task = tenant_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    if task["status"] != "done":
        raise HTTPException(status_code=400, detail=f"任务状态: {task['status']}，无法下载")

    exported = task["result"]
    if not exported:
        raise HTTPException(status_code=404, detail="改写后无有效数据")

    # 生成 CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["question", "answer", "category", "intent", "tags", "source", "confidence", "content_type"])
    for item in exported:
        tags = item.get("tags", [])
        tags_str = ",".join(tags) if isinstance(tags, list) else str(tags)
        writer.writerow([
            item.get("question", ""),
            item.get("answer", ""),
            item.get("category", ""),
            item.get("intent", ""),
            tags_str,
            item.get("source", ""),
            item.get("confidence", ""),
            item.get("content_type", ""),
        ])

    file_content = "\ufeff" + output.getvalue()
    from datetime import datetime as _dt
    filename = f"rag_llm_rewritten_{_dt.now().strftime('%Y%m%d_%H%M')}.csv"

    # 自动上传到 TOS（与素材导出保持一致）
    tos_key = None
    try:
        from app.services.tos_service import upload_object, check_tos_configured, tenant_object_key
        if check_tos_configured():
            tos_key = tenant_object_key("rag-export/rag_llm_rewritten.csv")
            content_bytes = file_content.encode('utf-8')
            upload_object(
                object_key=tos_key,
                data=content_bytes,
                content_type="text/csv; charset=utf-8",
            )
            print(f"[INFO] RAG LLM 改写数据已上传到 TOS: {tos_key}")
    except Exception as e:
        print(f"[WARN] TOS upload failed for RAG LLM data: {e}")
        tos_key = None

    # 清理任务 (下载后保留 5 分钟)
    def _cleanup():
        _time.sleep(300)
        with _rag_llm_tasks_lock:
            tenant_tasks.pop(task_id, None)
    threading.Thread(target=_cleanup, daemon=True).start()

    return StreamingResponse(
        iter([file_content]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Total-Examples": str(len(exported)),
            "X-Tos-Key": tos_key or "",
        }
    )
