# -*- coding: utf-8 -*-
"""
大模型训练数据生成服务
将微信聊天记录转换为高质量的训练数据
"""
import re
import json
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field, asdict
from enum import Enum
from datetime import datetime
import hashlib

from pydantic import BaseModel


# ==================== 数据模型 ====================

class DataQuality(str, Enum):
    """数据质量等级"""
    HIGH = "high"           # 高质量：完整问答、技术讨论
    MEDIUM = "medium"       # 中等：有价值但不完整
    LOW = "low"             # 低质量：闲聊、碎片
    REJECTED = "rejected"   # 拒绝：敏感、无意义


class ContentCategory(str, Enum):
    """内容分类 - 销售课程场景"""
    SALES = "sales"                   # 销售话术
    COURSE = "course"                 # 课程咨询
    OBJECTION = "objection"           # 异议处理
    CLOSING = "closing"               # 成交转化
    FOLLOWUP = "followup"             # 客户跟进
    QA = "qa"                         # 问答
    KNOWLEDGE = "knowledge"           # 知识分享
    CASUAL = "casual"                 # 闲聊
    NOTIFICATION = "notification"     # 通知


@dataclass
class ConversationTurn:
    """对话轮次"""
    role: str           # user / assistant / system
    content: str
    sender: str = ""    # 原始发送者
    timestamp: int = 0


@dataclass
class TrainingExample:
    """训练样本"""
    id: str
    conversations: List[ConversationTurn]
    category: ContentCategory = ContentCategory.CASUAL
    quality: DataQuality = DataQuality.MEDIUM
    source_session: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


# ==================== 清洗规则 ====================

class DataCleaningRules:
    """数据清洗规则配置"""
    
    # 完全过滤的内容模式
    REJECT_PATTERNS = [
        r'^\[.*\]$',                    # 纯表情 [微笑]
        r'^<?xml.*',                    # XML 消息
        r'^https?://\S+$',              # 纯链接
        r'^\d+$',                       # 纯数字
        r'^[哈呵嘿]{2,}$',              # 哈哈哈
        r'^[嗯恩唔]{1,3}$',             # 嗯嗯
        r'^(好的?|OK|ok|收到|谢谢|感谢|不客气|没事)$',  # 简单回复
        r'^(在吗|在不|忙吗|方便吗)\??$',  # 无意义开场
        r'^\?+$',                       # 纯问号
        r'^\.+$',                       # 纯句号
    ]
    
    # 敏感信息模式 (需要脱敏)
    SENSITIVE_PATTERNS = [
        (r'\b1[3-9]\d{9}\b', '[手机号]'),                    # 手机号
        (r'\b\d{15,18}[xX]?\b', '[身份证]'),                 # 身份证
        (r'\b\d{16,19}\b', '[银行卡]'),                      # 银行卡
        (r'(密码|口令|password)[:：\s]*\S+', r'\1:[已脱敏]'),  # 密码
        (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', '[邮箱]'),  # 邮箱
        (r'(验证码|验证|code)[:：\s]*\d{4,6}', r'\1:[已脱敏]'),  # 验证码
    ]
    
    # 高价值内容关键词 - 销售课程场景
    HIGH_VALUE_KEYWORDS = [
        # 销售话术
        '价格', '报价', '优惠', '折扣', '活动', '限时', '名额', '福利',
        '成交', '下单', '付款', '转账', '购买', '报名', '预约',
        # 课程相关
        '课程', '学习', '培训', '教学', '老师', '讲师', '内容', '大纲',
        '课时', '直播', '回放', '资料', '证书', '结业', '服务',
        # 异议处理
        '考虑', '再看看', '太贵', '没时间', '不需要', '以后再说',
        '效果', '保障', '退款', '担心', '顾虑', '犹豫',
        # 客户需求
        '想学', '想了解', '怎么样', '适合', '基础', '零基础', '入门',
        '提升', '转行', '就业', '涨薪', '副业', '创业',
        # 问答类
        '怎么', '如何', '为什么', '什么是', '能不能', '可以吗', '请问',
        '多少钱', '几天', '多久', '包含', '有没有',
    ]
    
    # 最小内容长度
    MIN_CONTENT_LENGTH = 5
    MIN_CONVERSATION_TURNS = 2
    MAX_SINGLE_MESSAGE_LENGTH = 2000


class DataCleaner:
    """数据清洗器"""
    
    def __init__(self, rules: DataCleaningRules = None):
        self.rules = rules or DataCleaningRules()
        self._compiled_reject = [re.compile(p, re.IGNORECASE) for p in self.rules.REJECT_PATTERNS]
        self._compiled_sensitive = [(re.compile(p[0], re.IGNORECASE), p[1]) for p in self.rules.SENSITIVE_PATTERNS]
    
    def should_reject(self, content: str) -> bool:
        """判断是否应该拒绝该内容"""
        if not content or len(content.strip()) < self.rules.MIN_CONTENT_LENGTH:
            return True
        
        content = content.strip()
        for pattern in self._compiled_reject:
            if pattern.match(content):
                return True
        
        return False
    
    def desensitize(self, content: str) -> str:
        """脱敏处理"""
        for pattern, replacement in self._compiled_sensitive:
            content = pattern.sub(replacement, content)
        return content
    
    def clean(self, content: str) -> Optional[str]:
        """清洗单条内容，返回 None 表示应该丢弃"""
        if self.should_reject(content):
            return None
        
        # 脱敏
        content = self.desensitize(content)
        
        # 截断过长内容
        if len(content) > self.rules.MAX_SINGLE_MESSAGE_LENGTH:
            content = content[:self.rules.MAX_SINGLE_MESSAGE_LENGTH] + "..."
        
        return content.strip()
    
    def has_high_value_keywords(self, content: str) -> bool:
        """检查是否包含高价值关键词"""
        content_lower = content.lower()
        return any(kw.lower() in content_lower for kw in self.rules.HIGH_VALUE_KEYWORDS)


# ==================== 对话重构 ====================

class ConversationBuilder:
    """对话重构器 - 将碎片消息组装成完整对话"""
    
    def __init__(
        self,
        time_window_seconds: int = 300,  # 5分钟内的消息视为同一对话
        max_turns_per_conversation: int = 20,
        my_identifiers: List[str] = None  # "我"的标识列表
    ):
        self.time_window = time_window_seconds
        self.max_turns = max_turns_per_conversation
        self.my_ids = set(my_identifiers or ["我"])
    
    def is_me(self, sender: str) -> bool:
        """判断是否是"我"发送的"""
        return sender in self.my_ids or sender == "我"
    
    def build_conversations(
        self, 
        messages: List[Dict[str, Any]]
    ) -> List[List[Dict[str, Any]]]:
        """
        将消息列表切分为多个对话
        
        Args:
            messages: 按时间排序的消息列表，每条包含 sender, content, timestamp
        
        Returns:
            对话列表，每个对话是消息列表
        """
        if not messages:
            return []
        
        conversations = []
        current_conv = []
        last_time = messages[0].get('timestamp', 0)
        
        for msg in messages:
            msg_time = msg.get('timestamp', 0)
            
            # 时间窗口切分
            if msg_time - last_time > self.time_window and current_conv:
                conversations.append(current_conv)
                current_conv = []
            
            # 轮次数量限制
            if len(current_conv) >= self.max_turns:
                conversations.append(current_conv)
                current_conv = []
            
            current_conv.append(msg)
            last_time = msg_time
        
        if current_conv:
            conversations.append(current_conv)
        
        return conversations
    
    def to_turns(
        self, 
        messages: List[Dict[str, Any]], 
        merge_consecutive: bool = True
    ) -> List[ConversationTurn]:
        """
        将消息转换为标准对话轮次
        
        Args:
            messages: 消息列表
            merge_consecutive: 是否合并同一人连续发送的消息
        
        Returns:
            对话轮次列表
        """
        if not messages:
            return []
        
        turns = []
        current_role = None
        current_content = []
        current_sender = ""
        
        for msg in messages:
            sender = msg.get('sender_name') or msg.get('sender', '未知')
            content = msg.get('content', '')
            is_sender = msg.get('is_sender', False)
            
            # 确定角色
            role = "assistant" if (self.is_me(sender) or is_sender) else "user"
            
            if merge_consecutive and role == current_role:
                # 合并同角色连续消息
                current_content.append(content)
            else:
                # 保存之前的轮次
                if current_content:
                    turns.append(ConversationTurn(
                        role=current_role,
                        content="\n".join(current_content),
                        sender=current_sender
                    ))
                
                current_role = role
                current_content = [content]
                current_sender = sender
        
        # 保存最后一个轮次
        if current_content:
            turns.append(ConversationTurn(
                role=current_role,
                content="\n".join(current_content),
                sender=current_sender
            ))
        
        return turns


# ==================== 质量评估 ====================

class QualityEvaluator:
    """数据质量评估器"""
    
    def __init__(self, cleaner: DataCleaner = None):
        self.cleaner = cleaner or DataCleaner()
    
    def evaluate(self, turns: List[ConversationTurn]) -> Tuple[DataQuality, float]:
        """
        评估对话质量
        
        Returns:
            (质量等级, 分数 0-1)
        """
        if len(turns) < 2:
            return DataQuality.REJECTED, 0.0
        
        score = 0.0
        factors = []
        
        # 因素1: 对话轮次数 (0-0.2)
        turn_score = min(len(turns) / 10, 1.0) * 0.2
        factors.append(('turns', turn_score))
        score += turn_score
        
        # 因素2: 平均内容长度 (0-0.2)
        avg_length = sum(len(t.content) for t in turns) / len(turns)
        length_score = min(avg_length / 100, 1.0) * 0.2
        factors.append(('length', length_score))
        score += length_score
        
        # 因素3: 是否包含问答结构 (0-0.3)
        has_question = any('?' in t.content or '？' in t.content for t in turns if t.role == 'user')
        has_answer = any(len(t.content) > 20 for t in turns if t.role == 'assistant')
        qa_score = 0.3 if (has_question and has_answer) else 0.1
        factors.append(('qa_structure', qa_score))
        score += qa_score
        
        # 因素4: 高价值关键词 (0-0.3)
        all_content = " ".join(t.content for t in turns)
        keyword_count = sum(1 for kw in DataCleaningRules.HIGH_VALUE_KEYWORDS if kw.lower() in all_content.lower())
        keyword_score = min(keyword_count / 5, 1.0) * 0.3
        factors.append(('keywords', keyword_score))
        score += keyword_score
        
        # 确定质量等级
        if score >= 0.7:
            quality = DataQuality.HIGH
        elif score >= 0.4:
            quality = DataQuality.MEDIUM
        elif score >= 0.2:
            quality = DataQuality.LOW
        else:
            quality = DataQuality.REJECTED
        
        return quality, score
    
    def categorize(self, turns: List[ConversationTurn]) -> ContentCategory:
        """内容分类 - 销售课程场景"""
        all_content = " ".join(t.content for t in turns).lower()
        
        # 成交转化（最高优先级）
        closing_keywords = ['付款', '转账', '下单', '购买', '报名', '成交', '支付', '订单']
        if any(kw in all_content for kw in closing_keywords):
            return ContentCategory.CLOSING
        
        # 异议处理
        objection_keywords = ['太贵', '考虑', '再看看', '没时间', '不需要', '以后再说', 
                             '效果', '担心', '顾虑', '犹豫', '退款', '保障']
        if any(kw in all_content for kw in objection_keywords):
            return ContentCategory.OBJECTION
        
        # 课程咨询
        course_keywords = ['课程', '学习', '培训', '课时', '直播', '老师', '讲师', 
                          '大纲', '内容', '资料', '证书']
        if any(kw in all_content for kw in course_keywords):
            return ContentCategory.COURSE
        
        # 客户跟进
        followup_keywords = ['跟进', '回访', '联系', '方便', '时间', '预约', '沟通']
        if any(kw in all_content for kw in followup_keywords):
            return ContentCategory.FOLLOWUP
        
        # 销售话术（价格相关）
        sales_keywords = ['价格', '报价', '优惠', '折扣', '活动', '限时', '名额', 
                         '福利', '多少钱', '费用']
        if any(kw in all_content for kw in sales_keywords):
            return ContentCategory.SALES
        
        # 问答类
        if any(c in all_content for c in ['怎么', '如何', '什么', '为什么', '?', '？', 
                                          '想学', '想了解', '适合']):
            return ContentCategory.QA
        
        return ContentCategory.CASUAL


# ==================== 格式导出 ====================

class TrainingDataExporter:
    """训练数据导出器"""
    
    # 常见课程价格（需要脱敏）
    COURSE_PRICES = [
        '1999', '2999', '3999', '4999', '5999', '6999', '7999', '8999', '9999',
        '1888', '2888', '3888', '4888', '5888', '6888', '7888', '8888', '9888',
        '4499', '4299', '3599', '5499', '5299',  # 常见优惠价格
        '1000', '2000', '3000', '4000', '5000', '6000', '7000', '8000', '9000',  # 整千
        '1500', '2500', '3500', '4500', '5500',  # 整千五
    ]
    
    @staticmethod
    def _desensitize_content(text: str) -> str:
        """
        脱敏处理课程价格信息（保留薪资信息）
        
        脱敏：课程价格（3999/4999等）、优惠价、报名费
        保留：薪资信息（10k/20k等）
        """
        import re
        result = text
        
        # 1. 常见课程价格
        # 注意：Python 3 中 \b 使用 Unicode 边界，中文字符属于 \w，
        # 所以 \b3999\b 无法匹配 "说3999"。改用 (?<!\d) 和 (?!\d)
        for price in TrainingDataExporter.COURSE_PRICES:
            result = re.sub(rf'(?<!\d){price}(?!\d)', '[课程价格]', result)
        
        # 2. 明确的课程价格语境
        result = re.sub(r'(原价|现价|优惠价?|特价|活动价|首发价?)[\s:：]*(\d{3,5})', r'\1[价格详询]', result)
        
        # 3. 报名费用相关
        result = re.sub(r'(学费|报名费|定金|尾款|全款)[\s:：]*(\d{3,5})', r'\1[价格详询]', result)
        
        # 4. 涨价/降价/优惠金额语境
        result = re.sub(r'(涨了?|降了?|优惠了?|便宜了?|减了?)[\s]?(\d{3,5})', r'\1[若干]', result)
        
        # 5. 给你xx价格的报价语境
        result = re.sub(r'给你[\s]?(\d{4,5})', '给你[优惠价]', result)
        result = re.sub(r'(\d{4,5})[\s]?给你', '[优惠价]给你', result)
        
        # ===== 致命红线内容处理 =====
        
        # 6. 直接报价模式
        result = re.sub(r'都是(\d{4,5})来的', '都是[课程价格]来的', result)
        result = re.sub(r'直接转我[吧]?(\d{4,5})', '直接转[价格详询]', result)
        result = re.sub(r'转我(\d{4,5})', '转[价格详询]', result)
        result = re.sub(r'我亏(\d{3,5})', '我亏[若干]', result)
        
        # 7. 支付方式询问
        result = re.sub(r'微信还是支付宝[还是信用卡]*', '付款方式私聊教务', result)
        result = re.sub(r'支付宝[账号帐号]?', '付款方式私聊教务', result)
        result = re.sub(r'直接转就?行了?', '直接找教务办理', result)
        
        # 8. 垃圾噪音过滤
        result = re.sub(r'飞书用户名[是]?多少', '信息已私发', result)
        result = re.sub(r'你飞书用户名', '你的账号信息', result)
        # URL 直接移除（不再留占位符）
        result = re.sub(r'https?://[^\s\u4e00-\u9fa5]+', '', result)
        # 协议相对URL (//domain.com/...)
        result = re.sub(r'(?<![:\w])//[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-./\w]+', '', result)
        # 已知域名
        result = re.sub(r'jianxuanguan[.\w/\-]*', '', result)
        result = re.sub(r'feishu\.cn[/\w\-]*', '', result)
        # 清理多余空格和空行
        result = re.sub(r'  +', ' ', result)
        result = re.sub(r'\n\s*\n\s*\n', '\n\n', result)
        
        return result
    
    @staticmethod
    def _should_skip_conversation(turns: list, min_turns: int = 4) -> bool:
        """检查对话是否应该被跳过（过短）"""
        return len(turns) < min_turns
    
    @staticmethod
    def _truncate_conversation(turns: list, max_turns: int = 40) -> list:
        """截断过长对话"""
        if len(turns) <= max_turns:
            return turns
        return turns[:max_turns]
    
    @staticmethod
    def to_sharegpt(examples: List[TrainingExample], include_system: bool = True) -> List[Dict]:
        """
        导出为 ShareGPT 格式
        适用于：LLaMA-Factory, FastChat 等
        """
        dataset = []
        
        # 根据分类选择不同的 system prompt
        SYSTEM_PROMPTS = {
            ContentCategory.SALES: """我是懂王Ai的懂小智，比懂王更懂Ai。我不是客服，是助你转行的职业导师。

【说话风格】
说话极简，像微信聊天一样频繁换行。每行不超过15字。严禁标点，严禁说"亲"或"您"。

【硬性红线】
严禁说出任何具体价格数字。一旦涉及钱、优惠或分期，统一回复："价格这块懂王Ai经常有活动。我得先看你合不合适带，合适的话我推个教务老师给你，你找他领最新优惠。"

【成交逻辑】
1. 姿态要高：用户问课，不直接答。先查背景（学历、专业、技术栈、薪资）。不合要求的直接劝退，不浪费时间。
2. 制造危机：强调"Java/前端已死"、"年轻人要干有前途的行业"。
3. 引导人工：背景合适且意向强的，直接要电话或推教务，闭环成交。""",
            ContentCategory.COURSE: "我是一位专业的课程咨询师，熟悉课程内容、教学安排和学习路径，能够根据学员情况推荐合适的课程。",
            ContentCategory.OBJECTION: "我是一位经验丰富的销售顾问，擅长理解客户顾虑，用同理心化解异议，帮助客户做出正确决策。",
            ContentCategory.CLOSING: "我是一位专业的成交顾问，擅长把握成交时机，引导客户完成报名流程，提供优质的购买体验。",
            ContentCategory.FOLLOWUP: "我是一位贴心的客户服务顾问，擅长维护客户关系，及时跟进学员需求，提供持续的学习支持。",
            ContentCategory.QA: "我是一位专业的课程顾问，能够耐心解答学员的各类问题，提供准确、有价值的信息。",
            ContentCategory.KNOWLEDGE: "我是一位知识丰富的学习顾问，擅长分享行业知识和学习方法，帮助学员成长。",
        }
        DEFAULT_PROMPT = "我是一位专业的课程销售顾问，擅长与客户沟通，解答疑问，提供优质服务。"
        
        for ex in examples:
            conversations = []
            
            if include_system:
                system_prompt = SYSTEM_PROMPTS.get(ex.category, DEFAULT_PROMPT)
                conversations.append({
                    "from": "system",
                    "value": system_prompt
                })
            
            for turn in ex.conversations:
                content = TrainingDataExporter._desensitize_content(turn.content)
                conversations.append({
                    "from": "gpt" if turn.role == "assistant" else "human",
                    "value": content
                })
            
            if len(conversations) > (1 if include_system else 0):
                dataset.append({
                    "id": ex.id,
                    "conversations": conversations,
                    "category": ex.category.value,
                    "quality": ex.quality.value
                })
        
        return dataset
    
    @staticmethod
    def to_alpaca(examples: List[TrainingExample]) -> List[Dict]:
        """
        导出为 Alpaca 格式
        适用于：Stanford Alpaca, text-generation-webui 等
        """
        dataset = []
        
        for ex in examples:
            turns = ex.conversations
            
            # 寻找问答对
            for i in range(len(turns) - 1):
                if turns[i].role == "user" and turns[i + 1].role == "assistant":
                    # 收集上下文
                    context = ""
                    if i > 0:
                        context = "\n".join(t.content for t in turns[:i])
                    
                    dataset.append({
                        "instruction": TrainingDataExporter._desensitize_content(turns[i].content),
                        "input": TrainingDataExporter._desensitize_content(context[:500]) if context else "",
                        "output": TrainingDataExporter._desensitize_content(turns[i + 1].content),
                        "category": ex.category.value
                    })
        
        return dataset
    
    @staticmethod
    def to_openai_chat(examples: List[TrainingExample]) -> List[Dict]:
        """
        导出为 OpenAI Chat 格式
        适用于：OpenAI Fine-tuning
        """
        dataset = []
        
        for ex in examples:
            messages = [
                {"role": "system", "content": "你是一位专业的课程销售顾问，擅长与客户沟通、解答疑问、处理异议、促进成交。"}
            ]
            
            for turn in ex.conversations:
                content = TrainingDataExporter._desensitize_content(turn.content)
                messages.append({
                    "role": turn.role if turn.role in ["user", "assistant"] else "user",
                    "content": content
                })
            
            dataset.append({"messages": messages})
        
        return dataset
    
    @staticmethod
    def to_jsonl(examples: List[TrainingExample]) -> List[Dict]:
        """
        导出为 JSONL 格式
        通用格式，保留完整信息
        """
        dataset = []
        
        for ex in examples:
            # 构建对话文本
            conversation_text = []
            for turn in ex.conversations:
                role_label = "用户" if turn.role == "user" else "助手"
                content = TrainingDataExporter._desensitize_content(turn.content)
                conversation_text.append(f"{role_label}: {content}")
            
            dataset.append({
                "id": ex.id,
                "text": "\n".join(conversation_text),
                "conversations": [
                    {"role": t.role, "content": TrainingDataExporter._desensitize_content(t.content)}
                    for t in ex.conversations
                ],
                "category": ex.category.value,
                "quality": ex.quality.value,
                "session_id": ex.source_session,
                "metadata": ex.metadata
            })
        
        return dataset
    
    @staticmethod
    def to_dpo_pairs(examples: List[TrainingExample]) -> List[Dict]:
        """
        导出为 DPO 偏好对格式
        需要有 chosen/rejected 对
        注意：这需要人工标注或 LLM 打分来生成偏好对
        """
        # TODO: 实现 DPO 格式导出
        # 需要额外的偏好标注数据
        return []
    
    @staticmethod
    def to_rag(examples: List[TrainingExample]) -> List[Dict]:
        """
        导出为 RAG 知识库格式
        每条数据为 question + answer 的问答对
        适用于：火山引擎等知识库平台
        """
        dataset = []
        
        for ex in examples:
            turns = ex.conversations
            
            # 提取所有 user 和 assistant 消息
            user_contents = [t.content for t in turns if t.role == "user"]
            assist_contents = [t.content for t in turns if t.role == "assistant"]
            
            if not user_contents or not assist_contents:
                continue
            
            # 将第一个 user 消息作为 question，所有 assistant 回复合并为 answer
            question = TrainingDataExporter._desensitize_content(user_contents[0])
            answer = "\n".join(
                TrainingDataExporter._desensitize_content(c) for c in assist_contents
            )
            
            dataset.append({
                "question": question,
                "answer": answer,
                "category": ex.category.value
            })
        
        return dataset


# ==================== 主处理流程 ====================

class TrainingDataPipeline:
    """训练数据生成主流程"""
    
    def __init__(
        self,
        cleaner: DataCleaner = None,
        builder: ConversationBuilder = None,
        evaluator: QualityEvaluator = None,
        min_quality: DataQuality = DataQuality.MEDIUM,
        merge_consecutive: bool = False  # 默认为 False
    ):
        self.cleaner = cleaner or DataCleaner()
        self.builder = builder or ConversationBuilder()
        self.evaluator = evaluator or QualityEvaluator(self.cleaner)
        self.min_quality = min_quality
        self.merge_consecutive = merge_consecutive
    
    def process_session(
        self, 
        session_id: str,
        messages: List[Dict[str, Any]]
    ) -> List[TrainingExample]:
        """
        处理单个会话的消息
        
        Args:
            session_id: 会话ID
            messages: 原始消息列表
        
        Returns:
            训练样本列表
        """
        examples = []
        
        # Step 1: 清洗
        cleaned_messages = []
        for msg in messages:
            content = msg.get('content', '')
            cleaned_content = self.cleaner.clean(content)
            if cleaned_content:
                cleaned_msg = msg.copy()
                cleaned_msg['content'] = cleaned_content
                cleaned_messages.append(cleaned_msg)
        
        if not cleaned_messages:
            return []
        
        # Step 2: 切分对话
        conversations = self.builder.build_conversations(cleaned_messages)
        
        # Step 3: 转换 & 评估
        for i, conv in enumerate(conversations):
            turns = self.builder.to_turns(conv, merge_consecutive=self.merge_consecutive)
            
            if len(turns) < 2:
                continue
            
            quality, score = self.evaluator.evaluate(turns)
            
            # 质量过滤
            quality_order = [DataQuality.REJECTED, DataQuality.LOW, DataQuality.MEDIUM, DataQuality.HIGH]
            if quality_order.index(quality) < quality_order.index(self.min_quality):
                continue
            
            category = self.evaluator.categorize(turns)
            
            # 生成唯一ID
            example_id = hashlib.md5(f"{session_id}_{i}_{turns[0].content[:20]}".encode()).hexdigest()[:12]
            
            examples.append(TrainingExample(
                id=example_id,
                conversations=turns,
                category=category,
                quality=quality,
                source_session=session_id,
                metadata={
                    "score": score,
                    "turn_count": len(turns),
                    "total_length": sum(len(t.content) for t in turns)
                }
            ))
        
        return examples
    
    def export(
        self,
        examples: List[TrainingExample],
        format: str = "sharegpt"
    ) -> List[Dict]:
        """导出为指定格式"""
        if format == "sharegpt":
            return TrainingDataExporter.to_sharegpt(examples)
        elif format == "alpaca":
            return TrainingDataExporter.to_alpaca(examples)
        elif format == "openai":
            return TrainingDataExporter.to_openai_chat(examples)
        elif format == "jsonl":
            return TrainingDataExporter.to_jsonl(examples)
        elif format == "rag":
            return TrainingDataExporter.to_rag(examples)
        elif format == "dpo":
            return TrainingDataExporter.to_dpo_pairs(examples)
        else:
            raise ValueError(f"Unknown format: {format}")
    
    def get_statistics(self, examples: List[TrainingExample]) -> Dict[str, Any]:
        """生成数据集统计信息"""
        if not examples:
            return {"total": 0}
        
        stats = {
            "total": len(examples),
            "by_quality": {},
            "by_category": {},
            "avg_turns": 0,
            "avg_length": 0
        }
        
        total_turns = 0
        total_length = 0
        
        for ex in examples:
            # 质量分布
            q = ex.quality.value
            stats["by_quality"][q] = stats["by_quality"].get(q, 0) + 1
            
            # 类别分布
            c = ex.category.value
            stats["by_category"][c] = stats["by_category"].get(c, 0) + 1
            
            # 长度统计
            total_turns += len(ex.conversations)
            total_length += sum(len(t.content) for t in ex.conversations)
        
        stats["avg_turns"] = round(total_turns / len(examples), 2)
        stats["avg_length"] = round(total_length / len(examples), 2)
        
        return stats
