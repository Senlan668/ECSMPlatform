# -*- coding: utf-8 -*-
"""
数据过滤和脱敏服务
用于过滤不适合作为知识库/训练数据的内容
"""
import re
import threading
from typing import List, Dict, Optional, Tuple
from enum import Enum


class ContentCategory(Enum):
    """内容分类"""
    VALUABLE = "valuable"           # 有价值内容（技术讨论、需求确认等）
    CHITCHAT = "chitchat"           # 闲聊
    SENSITIVE = "sensitive"         # 敏感信息
    SPAM = "spam"                   # 广告/垃圾
    SYSTEM = "system"               # 系统消息
    MEDIA = "media"                 # 纯媒体（图片、视频等）
    SHORT = "short"                 # 过短无意义


class DataFilter:
    """数据过滤器"""
    
    # 敏感信息正则模式
    SENSITIVE_PATTERNS = {
        'phone': r'1[3-9]\d{9}',                          # 手机号
        'id_card': r'\d{17}[\dXx]',                       # 身份证号
        'bank_card': r'\d{16,19}',                        # 银行卡号
        'password': r'(?:密码|pwd|password)[：:\s]*\S+',  # 密码
        'email': r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}',  # 邮箱
        'ip_address': r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}',  # IP地址
        'api_key': r'(?:sk-|ak-|api[_-]?key)[a-zA-Z0-9]{20,}',  # API Key
    }
    
    # 无意义内容模式
    CHITCHAT_PATTERNS = [
        r'^[哈嘿呵嗯啊哦噢嘻]{2,}$',           # 纯语气词
        r'^[。\.]{1,}$',                        # 纯标点
        r'^(ok|OK|好的?|收到|嗯+|哦+|啊+|是的?|对的?|行|可以|谢谢|感谢|不客气|没事)$',
        r'^\[.+\]$',                           # 纯表情 [微笑]
        r'^@\S+\s*$',                          # 纯@某人
    ]
    
    # 垃圾/广告关键词（注意：销售课程场景下，部分词汇可能是正常内容）
    SPAM_KEYWORDS = [
        '兼职', '日赚', '月入', '躺赚', '刷单', '返利', '博彩', '赌',
        # 注意：'优惠券'、'扫码'、'加微信' 在销售场景是正常用语，不过滤
    ]
    
    # 销售场景高价值关键词（优先保留这些内容）
    SALES_VALUABLE_KEYWORDS = [
        # 价格/优惠
        '价格', '报价', '优惠', '折扣', '活动', '限时', '福利', '赠送',
        # 课程
        '课程', '学习', '培训', '课时', '直播', '回放', '资料', '老师',
        # 成交
        '报名', '付款', '转账', '购买', '下单', '订单', '支付',
        # 异议
        '考虑', '太贵', '效果', '担心', '顾虑', '保障', '退款',
        # 需求
        '想学', '想了解', '怎么样', '适合', '基础', '提升',
    ]
    
    # 黑名单会话（可配置）
    BLACKLIST_SESSIONS: List[str] = []
    
    # 白名单会话（如果配置，只处理白名单内的）
    WHITELIST_SESSIONS: List[str] = []
    
    def __init__(self):
        # Configuration is mutable, so every tenant instance owns independent copies.
        self.BLACKLIST_SESSIONS = []
        self.WHITELIST_SESSIONS = []
        self.SPAM_KEYWORDS = list(type(self).SPAM_KEYWORDS)
        self.sensitive_compiled = {
            k: re.compile(v, re.IGNORECASE) 
            for k, v in self.SENSITIVE_PATTERNS.items()
        }
        self.chitchat_compiled = [
            re.compile(p, re.IGNORECASE) for p in self.CHITCHAT_PATTERNS
        ]
    
    def classify_content(self, content: str, msg_type: int = 1) -> ContentCategory:
        """
        对内容进行分类
        """
        if not content:
            return ContentCategory.SHORT
        
        content = content.strip()
        
        # 1. 系统消息
        if msg_type == 10000:
            return ContentCategory.SYSTEM
        
        # 2. 非文本消息（图片、视频等）
        if msg_type != 1:
            return ContentCategory.MEDIA
        
        # 3. 过短内容
        if len(content) < 5:
            return ContentCategory.SHORT
        
        # 4. XML/系统消息
        if content.startswith('<?xml') or content.startswith('<msg>'):
            return ContentCategory.SYSTEM
        
        # 5. 检查敏感信息
        for name, pattern in self.sensitive_compiled.items():
            if pattern.search(content):
                return ContentCategory.SENSITIVE
        
        # 6. 检查闲聊
        for pattern in self.chitchat_compiled:
            if pattern.match(content):
                return ContentCategory.CHITCHAT
        
        # 7. 优先检查销售高价值关键词
        content_lower = content.lower()
        for keyword in self.SALES_VALUABLE_KEYWORDS:
            if keyword in content_lower:
                return ContentCategory.VALUABLE
        
        # 8. 检查垃圾/广告
        for keyword in self.SPAM_KEYWORDS:
            if keyword in content_lower:
                return ContentCategory.SPAM
        
        # 默认为有价值内容（销售场景倾向于保留更多内容）
        return ContentCategory.VALUABLE
    
    def should_include(self, content: str, msg_type: int = 1, 
                       include_chitchat: bool = False) -> Tuple[bool, ContentCategory]:
        """
        判断内容是否应该包含在知识库/训练数据中
        返回: (是否包含, 分类)
        """
        category = self.classify_content(content, msg_type)
        
        if category == ContentCategory.VALUABLE:
            return True, category
        
        if category == ContentCategory.CHITCHAT and include_chitchat:
            return True, category
        
        return False, category
    
    def desensitize(self, content: str) -> str:
        """
        对敏感信息进行脱敏处理
        """
        result = content
        
        # 手机号脱敏: 138****1234
        result = re.sub(
            r'(1[3-9]\d)\d{4}(\d{4})',
            r'\1****\2',
            result
        )
        
        # 身份证脱敏: 110***********1234
        result = re.sub(
            r'(\d{3})\d{11}(\d{4})',
            r'\1***********\2',
            result
        )
        
        # 银行卡脱敏: 6222****1234
        result = re.sub(
            r'(\d{4})\d{8,12}(\d{4})',
            r'\1****\2',
            result
        )
        
        # 邮箱脱敏: a***@example.com
        result = re.sub(
            r'([a-zA-Z0-9])[a-zA-Z0-9._%+-]*(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})',
            r'\1***\2',
            result
        )
        
        # API Key 脱敏
        result = re.sub(
            r'((?:sk-|ak-|api[_-]?key)[a-zA-Z0-9]{4})[a-zA-Z0-9]+',
            r'\1***',
            result,
            flags=re.IGNORECASE
        )
        
        # 密码脱敏
        result = re.sub(
            r'((?:密码|pwd|password)[：:\s]*)\S+',
            r'\1******',
            result,
            flags=re.IGNORECASE
        )
        
        return result
    
    def filter_session(self, session_id: str) -> bool:
        """
        判断会话是否应该被过滤掉
        """
        # 黑名单检查
        if session_id in self.BLACKLIST_SESSIONS:
            return True
        
        # 白名单检查（如果配置了白名单，只允许白名单内的）
        if self.WHITELIST_SESSIONS and session_id not in self.WHITELIST_SESSIONS:
            return True
        
        return False
    
    def filter_messages(self, messages: List[Dict], 
                        desensitize: bool = True,
                        include_chitchat: bool = False) -> List[Dict]:
        """
        批量过滤消息
        返回过滤后的消息列表
        """
        filtered = []
        stats = {cat.value: 0 for cat in ContentCategory}
        
        for msg in messages:
            content = msg.get('content', '')
            msg_type = msg.get('msg_type', 1)
            
            should_include, category = self.should_include(
                content, msg_type, include_chitchat
            )
            stats[category.value] += 1
            
            if should_include:
                if desensitize:
                    msg = msg.copy()
                    msg['content'] = self.desensitize(content)
                filtered.append(msg)
        
        return filtered, stats


class LLMContentClassifier:
    """
    使用 LLM 进行内容分类
    更精准但速度较慢，适合高质量数据筛选
    针对销售课程场景优化
    """
    
    CLASSIFICATION_PROMPT = """请对以下销售聊天内容进行分类。

聊天内容：
{content}

请判断这段对话属于以下哪个类别（销售课程场景）：
1. sales - 销售话术（价格介绍、优惠活动、产品卖点）
2. course - 课程咨询（课程内容、教学安排、服务说明）
3. objection - 异议处理（客户顾虑、价格异议、效果担忧）
4. closing - 成交转化（促进下单、付款引导、报名确认）
5. followup - 客户跟进（回访、维护、售后服务）
6. chitchat - 闲聊（日常问候、无实质内容）
7. sensitive - 敏感信息（密码、个人隐私等）
8. spam - 垃圾内容（与销售无关的广告等）

只回复类别名称，如：sales"""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client
    
    def classify(self, content: str) -> str:
        """使用 LLM 分类内容"""
        if not self.llm_client:
            return "unknown"
        
        try:
            from app.config import get_settings
            settings = get_settings()
            
            from openai import OpenAI
            client = OpenAI(
                api_key=settings.deepseek_api_key or settings.openai_api_key,
                base_url=settings.deepseek_base_url or settings.openai_base_url
            )
            
            response = client.chat.completions.create(
                model="deepseek-chat" if settings.deepseek_api_key else "gpt-4o-mini",
                messages=[
                    {"role": "user", "content": self.CLASSIFICATION_PROMPT.format(content=content[:1000])}
                ],
                temperature=0,
                max_tokens=20
            )
            
            return response.choices[0].message.content.strip().lower()
        except Exception as e:
            print(f"LLM classification error: {e}")
            return "unknown"


# Tenant-scoped registry. Filter configuration is business data, not process config.
_data_filters: Dict[str, DataFilter] = {}
_data_filter_lock = threading.RLock()

def get_data_filter() -> DataFilter:
    """获取当前租户独立的数据过滤器。"""
    from app.models.database import current_tenant_id

    tenant_id = current_tenant_id()
    with _data_filter_lock:
        if tenant_id not in _data_filters:
            _data_filters[tenant_id] = DataFilter()
        return _data_filters[tenant_id]


def dispose_data_filters() -> None:
    with _data_filter_lock:
        _data_filters.clear()
