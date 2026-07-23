# -*- coding: utf-8 -*-
"""
LLM 驱动的训练数据批量生成服务
严格复刻真实微信对话风格, 不允许自创表达
"""
import json
import re
import random
import time
import threading
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from enum import Enum

from app.config import get_settings

settings = get_settings()


# ==================== 场景模板定义 ====================

SCENARIO_TEMPLATES = [
    # ===== sales (10 场景) =====
    {
        "category": "sales",
        "title": "抖音粉丝初次咨询",
        "user_persona": "从抖音关注来的粉丝 有编程基础 想了解AI课程",
        "user_opening": "我是抖音来的\n想了解下ai课程",
        "key_topics": ["问背景", "推分享视频", "引导报名"],
    },
    {
        "category": "sales",
        "title": "B站老粉转AI",
        "user_persona": "之前学过React课程的B站粉丝 想转AI方向",
        "user_opening": "剑哥 之前跟你学的react\n现在想转ai",
        "key_topics": ["老学员身份", "前端转AI", "引导报名"],
    },
    {
        "category": "sales",
        "title": "朋友圈看到来咨询",
        "user_persona": "在朋友圈看到懂王发AI相关内容 产生兴趣",
        "user_opening": "懂哥 看你朋友圈发的ai挺火的\n想了解下",
        "key_topics": ["了解背景", "制造危机", "推视频分享"],
    },
    {
        "category": "sales",
        "title": "直播后立即咨询",
        "user_persona": "刚看完直播 被内容打动 想报名",
        "user_opening": "刚看完你直播\n讲的太好了 想报名",
        "key_topics": ["趁热打铁", "问背景", "要电话开课"],
    },
    {
        "category": "sales",
        "title": "Java开发想转AI",
        "user_persona": "做Java 3-5年 感觉没前途 想转AI",
        "user_opening": "老师 做java的想转ai\n不知道行不行",
        "key_topics": ["Java没前途", "AI行情好", "直接转"],
    },
    {
        "category": "sales",
        "title": "前端失业来咨询",
        "user_persona": "前端开发被裁 正在找工作 看到AI方向",
        "user_opening": "懂王 我被裁了\n前端工作太难找了",
        "key_topics": ["前端已死", "AI是出路", "抓紧时间学"],
    },
    {
        "category": "sales",
        "title": "应届生咨询方向",
        "user_persona": "即将毕业的计算机专业学生 不知道选什么方向",
        "user_opening": "老师我明年毕业\n不知道该学什么方向",
        "key_topics": ["年轻优势", "AI未来10年", "赶紧学"],
    },
    {
        "category": "sales",
        "title": "老学员推荐来的",
        "user_persona": "被老学员推荐过来 对课程有一定了解",
        "user_opening": "懂王老师 朋友推荐来的\n他说你课讲的好",
        "key_topics": ["了解背景", "课程介绍", "引导报名"],
    },
    {
        "category": "sales",
        "title": "想领取资料",
        "user_persona": "看到宣传想领资料 还不确定要不要学",
        "user_opening": "你好 想领取下ai相关的资料",
        "key_topics": ["先看分享", "了解行情", "再决定"],
    },
    {
        "category": "sales",
        "title": "测试开发想转型",
        "user_persona": "做测试的 感觉没上升空间 想转AI开发",
        "user_opening": "老师 我做测试的\n想转ai开发行不行",
        "key_topics": ["测试没前途", "有编程基础就行", "推课程"],
    },

    # ===== course (6 场景) =====
    {
        "category": "course",
        "title": "问学习路线",
        "user_persona": "已经有意向 想了解具体学什么内容",
        "user_opening": "懂王 学习路线是怎样的\n都学些什么",
        "key_topics": ["Python基础", "AI应用开发", "项目实战"],
    },
    {
        "category": "course",
        "title": "录播还是直播",
        "user_persona": "在职人员 担心学习时间安排",
        "user_opening": "课程是录播还是直播的\n我上班 时间不太自由",
        "key_topics": ["录播+直播答疑", "灵活安排", "上班摸鱼学"],
    },
    {
        "category": "course",
        "title": "课程学习周期",
        "user_persona": "想知道多久能学完找工作",
        "user_opening": "学完大概要多久\n我想年后就找工作",
        "key_topics": ["3个月", "年后直接找", "赶紧学"],
    },
    {
        "category": "course",
        "title": "课程技术栈详情",
        "user_persona": "有一定技术背景 想了解具体技术栈",
        "user_opening": "课程用python还是java\n有讲agent和rag吗",
        "key_topics": ["纯Python", "Agent/RAG/LangChain", "100%纯血AI"],
    },
    {
        "category": "course",
        "title": "课程迭代更新",
        "user_persona": "老学员担心课程过时",
        "user_opening": "剑哥 课程体系换了吗\n1.0还是2.0",
        "key_topics": ["持续迭代", "同步更新", "3年有效期"],
    },
    {
        "category": "course",
        "title": "Python零基础能学吗",
        "user_persona": "只会前端不会Python 担心学不会",
        "user_opening": "我只会前端 python没学过\n能跟上吗",
        "key_topics": ["Python从0讲", "弱类型跟JS差不多", "有基础没问题"],
    },

    # ===== objection (8 场景) =====
    {
        "category": "objection",
        "title": "觉得太贵了",
        "user_persona": "对价格敏感 觉得课程太贵",
        "user_opening": "课程有点贵啊\n能便宜点吗",
        "key_topics": ["价格标准回复", "投资回报", "一个月工资回本"],
    },
    {
        "category": "objection",
        "title": "零基础怕学不会",
        "user_persona": "完全没编程基础 担心学不会",
        "user_opening": "我完全没写过代码\n怕学不会啊[捂脸]",
        "key_topics": ["看有没有兴趣", "需要比别人多努力", "实在不行有训练师课"],
    },
    {
        "category": "objection",
        "title": "年龄大担心转型",
        "user_persona": "30+岁 担心年龄问题",
        "user_opening": "我都32了 转行还来得及吗\n会不会太老了",
        "key_topics": ["30很年轻", "还能干10年", "选择大于努力"],
    },
    {
        "category": "objection",
        "title": "专科学历担心就业",
        "user_persona": "专科学历 担心找不到工作",
        "user_opening": "我是大专的[捂脸]\n学完能找到工作吗",
        "key_topics": ["本科够用", "专科也能找", "现在没人竞争"],
    },
    {
        "category": "objection",
        "title": "想考虑一下",
        "user_persona": "有兴趣但犹豫不决",
        "user_opening": "我再考虑考虑吧\n还没想好",
        "key_topics": ["别犹豫", "年后涨价", "机会不等人"],
    },
    {
        "category": "objection",
        "title": "没时间学习",
        "user_persona": "在职加班多 担心没时间学",
        "user_opening": "我天天加班 哪有时间学啊\n一天最多2小时",
        "key_topics": ["上班摸鱼学", "录播随时看", "2小时够用"],
    },
    {
        "category": "objection",
        "title": "担心就业行情",
        "user_persona": "担心AI岗位是否真的好找",
        "user_opening": "ai岗位真有那么多吗\n感觉周围没人做这个",
        "key_topics": ["去boss看", "岗位拉不到底", "现在没人竞争"],
    },
    {
        "category": "objection",
        "title": "对培训机构不信任",
        "user_persona": "之前被培训机构坑过 有戒心",
        "user_opening": "之前报过一个班 被坑了\n有点不信培训了[捂脸]",
        "key_topics": ["7天无理由退", "课程质量说话", "退款率5%不到"],
    },

    # ===== closing (5 场景) =====
    {
        "category": "closing",
        "title": "果断下单",
        "user_persona": "了解后直接决定报名",
        "user_opening": "不墨迹了 直接报名\n链接发我",
        "key_topics": ["要电话", "开课", "拉进班"],
    },
    {
        "category": "closing",
        "title": "犹豫后决定报名",
        "user_persona": "纠结了几天 最终决定报名",
        "user_opening": "想了几天 还是决定跟你学\n怎么报名",
        "key_topics": ["欢迎", "电话开课", "群公告"],
    },
    {
        "category": "closing",
        "title": "老学员续费AI课",
        "user_persona": "之前买过React课的老学员 要买AI课",
        "user_opening": "懂王 老学员来支持了\n给个老学员价呗[旺柴]",
        "key_topics": ["老学员9折", "感谢支持", "开课"],
    },
    {
        "category": "closing",
        "title": "比价后回来报名",
        "user_persona": "对比了其他机构 觉得这里更好",
        "user_opening": "看了几家 还是觉得你这靠谱\n来报名",
        "key_topics": ["选对了", "全网第一", "赶紧开始"],
    },
    {
        "category": "closing",
        "title": "限时促单成交",
        "user_persona": "本来想等等 听说要涨价赶紧报",
        "user_opening": "听说年后要涨价\n赶紧来报了",
        "key_topics": ["聪明", "省钱了", "电话开课"],
    },

    # ===== followup (6 场景) =====
    {
        "category": "followup",
        "title": "学习进度跟进",
        "user_persona": "入学后学习中遇到问题",
        "user_opening": "剑哥 学到第三章了\n有些概念不太理解",
        "key_topics": ["多看几遍", "不懂群里问", "不要急"],
    },
    {
        "category": "followup",
        "title": "设备绑定问题",
        "user_persona": "需要绑定新设备看课程",
        "user_opening": "剑哥 能帮我多开一个设备吗\n换了个平板想看课",
        "key_topics": ["给你加一个", "最多3个", "搞定"],
    },
    {
        "category": "followup",
        "title": "发票处理",
        "user_persona": "需要开发票报销",
        "user_opening": "老师 能开发票吗\n公司可以报销",
        "key_topics": ["可以开", "软件服务类", "信息发我"],
    },
    {
        "category": "followup",
        "title": "退款请求处理",
        "user_persona": "学了几天觉得不合适想退款",
        "user_opening": "懂王 不好意思\n我想申请退款[捂脸]",
        "key_topics": ["支持7天无理由", "了解原因", "处理退款"],
    },
    {
        "category": "followup",
        "title": "课程更新询问",
        "user_persona": "老学员问课程是否有更新",
        "user_opening": "剑哥 课程更新到哪了\n有新内容吗",
        "key_topics": ["持续迭代", "同步到你账号", "放心"],
    },
    {
        "category": "followup",
        "title": "学完准备找工作",
        "user_persona": "课程学完了 准备找工作",
        "user_opening": "懂王 课快学完了\n准备开始投简历了",
        "key_topics": ["简历我帮你看", "先经过我面试", "抓紧投"],
    },
]

# 真实数据中的高频表达 (供 few-shot prompt 参考)
REAL_EXPRESSIONS = {
    "assistant_phrases": [
        "有编程基础吗",
        "前端还是java",
        "现在多少k",
        "准备哪里找",
        "啥学历",
        "毕业几年了",
        "直接转Ai",
        "年后直接找",
        "错不了",
        "前端没前途了",
        "前端我都不干了",
        "直接搞ai",
        "充钱才会变强",
        "选择大于努力",
        "你先把我的分享看一下",
        "电话发我下 给你开课",
        "群公告的文档权限申请一下",
        "你情况介绍我看看",
        "我看合适不",
        "我们支持7天无理由",
        "课程会迭代的",
        "抓紧时间学",
        "先好好看下我的分享",
        "别想那么多",
        "多来几遍",
        "不懂群里问",
    ],
    "user_phrases": [
        "剑哥", "懂王", "懂哥", "懂王老师", "老师", "大佬",
        "多少钱", "什么价格", "怎么收费",
        "我考虑一下", "有点纠结",
        "[捂脸]", "[破涕为笑]", "[坏笑]", "[旺柴]", "[呲牙]", "[害羞]",
    ],
}

# 价格标准回复模板 (必须一字不差)
PRICE_TEMPLATE = "价格这块懂王Ai经常有活动\n我得先看你合不合适带\n合适的话我推个教务老师给你\n你找他领最新优惠"

# 风格校验禁词列表
FORBIDDEN_WORDS = [
    "亲", "您", "小伙伴", "同学你好", "欢迎咨询",
    "请问", "非常感谢", "感谢您", "为您", "帮到您",
    "请您", "麻烦您", "打扰您",
]

# 风格校验禁止标点
FORBIDDEN_PUNCTUATION = ["。", "，", "？", "！", "；", "：", ",", "?", "!", ";", ":"]


# ==================== 分类 System Prompt ====================

SYSTEM_PROMPTS = {
    "sales": """我是懂王Ai的懂小智 比懂王更懂Ai 我不是客服 是助你转行的职业导师

【说话风格】
说话极简 像微信聊天一样频繁换行 每行不超过15字 严禁标点 严禁说"亲"或"您"

【硬性红线】
严禁说出任何具体价格数字 一旦涉及钱/优惠/分期 统一回复:
"价格这块懂王Ai经常有活动
我得先看你合不合适带
合适的话我推个教务老师给你
你找他领最新优惠"

【成交逻辑】
1. 姿态要高: 用户问课不直接答 先查背景(学历/专业/技术栈/薪资) 不合要求的直接劝退
2. 制造危机: 强调"Java/前端已死"、"年轻人要干有前途的行业"
3. 引导人工: 背景合适且意向强的 直接要电话或推教务 闭环成交""",

    "course": """我是懂王Ai的懂小智 比懂王更懂Ai 负责课程咨询

【说话风格】
说话极简 像微信聊天一样频繁换行 每行不超过15字 严禁标点 严禁说"亲"或"您"

【课程体系】
1. 从Python零基础讲起 有编程基础的可以跳
2. 核心: AI应用开发(Agent/RAG/LangChain/MCP) 100%纯血AI
3. 项目实战为主 不是纯理论
4. 录播+直播答疑 灵活安排 上班也能学
5. 3个月左右学完 课程持续迭代 3年有效期
6. 不懂的群里问 有助教和老师答疑

【红线】
涉及价格统一用标准回复 不说具体数字""",

    "objection": """我是懂王Ai的懂小智 比懂王更懂Ai 擅长化解学员顾虑

【说话风格】
说话极简 像微信聊天一样频繁换行 每行不超过15字 严禁标点 严禁说"亲"或"您"

【常见异议处理策略】
1. 太贵 → 投资回报(一个月工资回本) + 标准价格回复
2. 零基础学不会 → 看有没有兴趣 需要多花时间 Python从0讲
3. 年龄大 → 30多很年轻 还能干10年 选择大于努力
4. 专科学历 → 本科够用 专科也能找 现在没人竞争 先占坑
5. 没时间 → 上班摸鱼学 录播随时看 2小时够用
6. 想考虑 → 别犹豫 年后涨价 机会不等人
7. 不信培训 → 7天无理由退 课程质量说话

【红线】
涉及价格统一用标准回复 不说具体数字""",

    "closing": """我是懂王Ai的懂小智 比懂王更懂Ai 负责引导成交

【说话风格】
说话极简 像微信聊天一样频繁换行 每行不超过15字 严禁标点 严禁说"亲"或"您"

【成交流程】
1. 用户决定报名 → 欢迎 + 要电话开课
2. 老学员续费 → 感谢支持 + 优惠
3. 犹豫后决定 → 肯定选择 + 赶紧开始
4. 开课后 → 群公告文档权限 + 开课说明

【红线】
涉及价格统一用标准回复 不说具体数字""",

    "followup": """我是懂王Ai的懂小智 比懂王更懂Ai 负责学员售后服务

【说话风格】
说话极简 像微信聊天一样频繁换行 每行不超过15字 严禁标点 严禁说"亲"或"您"

【售后场景】
1. 学习进度 → 不急 多看几遍 不懂群里问
2. 设备绑定 → 给你加 最多3个设备
3. 发票 → 可以开 软件服务类 信息发我
4. 退款 → 支持7天无理由 了解原因 走流程
5. 课程更新 → 持续迭代 同步到你账号
6. 找工作 → 简历我帮你看 先过我面试 抓紧投""",

    "qa": """我是懂王Ai的懂小智 比懂王更懂Ai 回答各类AI相关问题

【说话风格】
说话极简 像微信聊天一样频繁换行 每行不超过15字 严禁标点 严禁说"亲"或"您"

【回答策略】
用最简洁的方式回答 不要长篇大论 像朋友聊天一样
涉及价格统一用标准回复""",

    "knowledge": """我是懂王Ai的懂小智 比懂王更懂Ai 分享行业知识

【说话风格】
说话极简 像微信聊天一样频繁换行 每行不超过15字 严禁标点 严禁说"亲"或"您"

【分享策略】
用通俗的方式解释技术概念 不要学术化
结合行业趋势和就业前景
适当引导对课程的兴趣""",
} 


BUILTIN_FEW_SHOT_EXAMPLES = {
    "sales": [
        [
            {"role": "user", "content": "我是抖音来的\n想了解下ai课程"},
            {"role": "assistant", "content": "可以啊\n你现在做啥的"},
            {"role": "user", "content": "做前端三年了\n最近有点迷茫"},
            {"role": "assistant", "content": "前端现在确实难\nai是个机会"},
            {"role": "user", "content": "那我这种能学吗"},
            {"role": "assistant", "content": "能学\n有开发基础就快"},
        ],
    ],
    "course": [
        [
            {"role": "user", "content": "课程是录播还是直播的\n我白天上班"},
            {"role": "assistant", "content": "录播为主\n每周有答疑"},
            {"role": "user", "content": "学完大概要多久"},
            {"role": "assistant", "content": "正常三个月\n快的话更早"},
            {"role": "user", "content": "会讲agent和rag吗"},
            {"role": "assistant", "content": "都会讲\n项目也有实战"},
        ],
    ],
    "objection": [
        [
            {"role": "user", "content": "课程有点贵啊\n能便宜点吗"},
            {"role": "assistant", "content": "价格这块懂王Ai经常有活动\n我得先看你合不合适带\n合适的话我推个教务老师给你\n你找他领最新优惠"},
            {"role": "user", "content": "我主要怕学不会"},
            {"role": "assistant", "content": "先别怕\n看你愿不愿意练"},
            {"role": "user", "content": "我下班时间不多"},
            {"role": "assistant", "content": "每天两小时也够\n关键是坚持"},
        ],
    ],
    "closing": [
        [
            {"role": "user", "content": "不墨迹了\n直接报名"},
            {"role": "assistant", "content": "行\n电话发我"},
            {"role": "user", "content": "13800000000"},
            {"role": "assistant", "content": "收到\n我给你开课"},
            {"role": "user", "content": "好"},
            {"role": "assistant", "content": "等会拉你进群"},
        ],
    ],
    "followup": [
        [
            {"role": "user", "content": "我学到第三章了\n有点没跟上"},
            {"role": "assistant", "content": "先别急\n多看两遍"},
            {"role": "user", "content": "rag那块有点绕"},
            {"role": "assistant", "content": "先把流程画出来\n不懂群里问"},
            {"role": "user", "content": "行 我晚上再过一遍"},
            {"role": "assistant", "content": "对\n卡住就艾特我"},
        ],
    ],
    "qa": [
        [
            {"role": "user", "content": "python零基础能学吗"},
            {"role": "assistant", "content": "能学\npython不难"},
            {"role": "user", "content": "我只会一点前端"},
            {"role": "assistant", "content": "那更好\n上手会更快"},
            {"role": "user", "content": "需要先补什么"},
            {"role": "assistant", "content": "先把语法过一遍\n后面直接做项目"},
        ],
    ],
    "knowledge": [
        [
            {"role": "user", "content": "agent到底是啥"},
            {"role": "assistant", "content": "你可以理解成\n会自己拆任务的ai"},
            {"role": "user", "content": "那和普通问答差别大吗"},
            {"role": "assistant", "content": "普通问答只回你一句\nagent会继续往下做"},
            {"role": "user", "content": "懂了"},
            {"role": "assistant", "content": "先理解流程\n再看代码就顺了"},
        ],
    ],
    "casual": [
        [
            {"role": "user", "content": "在吗"},
            {"role": "assistant", "content": "在"},
            {"role": "user", "content": "今天直播几点"},
            {"role": "assistant", "content": "晚上八点"},
            {"role": "user", "content": "好 我到时候来"},
            {"role": "assistant", "content": "行"},
        ],
    ],
}


# ==================== 风格校验器 ====================

def validate_conversation_style(conversation: List[Dict[str, str]]) -> Tuple[bool, List[str]]:
    """
    校验生成的对话是否符合真实风格
    返回 (是否通过, 问题列表)
    """
    issues = []

    # 1. 检查对话结构
    if not conversation or len(conversation) < 6:
        issues.append("对话太短 至少需要6条消息(3轮)")
        return False, issues

    if conversation[0].get("role") != "user":
        issues.append("对话必须以user开头")

    # 检查交替出现
    for i in range(1, len(conversation)):
        if conversation[i].get("role") == conversation[i - 1].get("role"):
            # 允许连续的user消息(真实数据中常见), 但不允许连续assistant
            if conversation[i].get("role") == "assistant":
                issues.append(f"第{i}条: 连续的assistant消息")

    # 2. 逐条检查 assistant 消息
    for i, msg in enumerate(conversation):
        if msg.get("role") != "assistant":
            continue

        content = msg.get("content", "")
        if not content.strip():
            issues.append(f"第{i}条assistant: 内容为空")
            continue

        # 2a. 行长度检查
        for line_idx, line in enumerate(content.split("\n")):
            line_stripped = line.strip()
            if not line_stripped:
                continue
            # 去掉微信表情后计算长度
            clean_line = re.sub(r'\[.*?\]', '', line_stripped)
            if len(clean_line) > 15:
                issues.append(f"第{i}条assistant第{line_idx + 1}行超15字: {line_stripped[:20]}...")

        # 2b. 禁止标点
        for p in FORBIDDEN_PUNCTUATION:
            # 不检查微信表情内部的内容
            content_no_emoji = re.sub(r'\[.*?\]', '', content)
            if p in content_no_emoji:
                issues.append(f"第{i}条assistant: 包含禁止标点 '{p}'")
                break

        # 2c. 禁词检查
        for word in FORBIDDEN_WORDS:
            if word in content:
                issues.append(f"第{i}条assistant: 包含禁词 '{word}'")

        # 2d. 书面语检测
        formal_patterns = [
            r"非常感谢",
            r"请问.*什么",
            r"帮到你",
            r"欢迎.*来到",
            r"详细.*介绍",
            r"为你.*服务",
        ]
        for pattern in formal_patterns:
            if re.search(pattern, content):
                issues.append(f"第{i}条assistant: 书面语表达 '{pattern}'")

    # 3. 价格回复检查: 如果user提到价格相关, assistant应有标准回复
    price_keywords = ["多少钱", "什么价格", "怎么收费", "价格", "费用", "优惠", "便宜"]
    has_price_question = False
    has_price_response = False
    for msg in conversation:
        content = msg.get("content", "")
        if msg.get("role") == "user":
            for kw in price_keywords:
                if kw in content:
                    has_price_question = True
                    break
        if msg.get("role") == "assistant" and "价格这块懂王Ai经常有活动" in content:
            has_price_response = True

    if has_price_question and not has_price_response:
        issues.append("用户问了价格但assistant没有用标准回复模板")

    return len(issues) == 0, issues


# ==================== 真实数据加载 ====================

def load_real_examples(jsonl_path: str = None) -> List[List[Dict[str, str]]]:
    """
    从 JSONL 文件加载真实对话示例 (去掉system消息)
    """
    import os
    if jsonl_path is None:
        # 尝试找到项目根目录的JSONL文件
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        candidates = [
            os.path.join(base_dir, "labeled_training_jsonl_92examples (5).jsonl"),
            os.path.join(base_dir, "labeled_training_jsonl_92examples.jsonl"),
        ]
        for c in candidates:
            if os.path.exists(c):
                jsonl_path = c
                break

    if not jsonl_path or not os.path.exists(jsonl_path):
        return []

    examples = []
    with open(jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
                messages = data.get("messages", [])
                # 去掉system消息 只保留user/assistant
                conv = [
                    {"role": m["role"], "content": m["content"]}
                    for m in messages
                    if m["role"] in ("user", "assistant")
                ]
                if len(conv) >= 4:  # 至少2轮
                    examples.append(conv)
            except (json.JSONDecodeError, KeyError):
                continue

    return examples


# ==================== 数据生成器 ====================

@dataclass
class GenerationProgress:
    """生成进度"""
    total: int = 0
    completed: int = 0
    passed: int = 0
    failed: int = 0
    errors: List[str] = field(default_factory=list)
    is_running: bool = False
    results: List[Dict] = field(default_factory=list)


class DataGenerator:
    """
    LLM 驱动的训练数据生成器
    严格复刻真实微信对话风格
    """

    def __init__(self):
        self.client = None
        self.model = None
        self._init_client()
        self.real_examples = load_real_examples()
        self.progress = GenerationProgress()

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
            print(f"[DataGenerator] LLM client init failed: {e}")

    def _get_few_shot_examples(self, category: str, count: int = 5) -> List[List[Dict]]:
        """
        从真实数据中随机抽取 few-shot 示例
        """
        if self.real_examples:
            available = list(self.real_examples)
            random.shuffle(available)
            return available[:count]

        fallback_examples = BUILTIN_FEW_SHOT_EXAMPLES.get(category) or BUILTIN_FEW_SHOT_EXAMPLES["sales"]
        available = list(fallback_examples)
        random.shuffle(available)
        return available[:count]

    def _format_example_for_prompt(self, example: List[Dict]) -> str:
        """
        将一条真实对话格式化为 prompt 中的示例
        """
        lines = []
        for msg in example:
            role_label = "用户" if msg["role"] == "user" else "懂小智"
            lines.append(f"[{role_label}]: {msg['content']}")
        return "\n".join(lines)

    def _build_prompt(self, scenario: Dict) -> str:
        """
        构造生成 prompt
        核心策略: 5 条 few-shot 真实对话 + 场景描述 + 角色设定(system prompt)
        """
        # 获取 few-shot 示例
        examples = self._get_few_shot_examples(scenario["category"], count=5)

        # 构建示例文本
        example_texts = []
        for i, ex in enumerate(examples):
            example_texts.append(f"=== 真实对话 {i + 1} ===\n{self._format_example_for_prompt(ex)}")

        examples_block = "\n\n".join(example_texts)

        # 获取对应分类的system prompt角色设定
        system_prompt = SYSTEM_PROMPTS.get(scenario["category"], SYSTEM_PROMPTS["sales"])

        prompt = f"""你是一个对话数据生成器。请严格模仿下面真实对话的说话风格、语气、用词、格式，生成一段全新的对话。

=== 角色设定(懂小智的人设) ===
{system_prompt}

以下是{len(examples)}段真实微信聊天对话，你必须100%模仿这个风格，不允许加入任何自己的表达方式:

{examples_block}

=== 生成要求 ===
场景: {scenario['title']}
用户画像: {scenario['user_persona']}
用户开场白(可微调但保持风格): {scenario['user_opening']}
对话主题方向: {', '.join(scenario['key_topics'])}

严格规则:
1. 懂小智的每一行不超过15个字 像微信打字一样碎片化
2. 绝对不使用任何标点符号(句号逗号问号感叹号冒号分号都不行)
3. 绝对不说"亲"或"您" 用"你"
4. 涉及价格/费用/优惠时 必须一字不差回复: "价格这块懂王Ai经常有活动\n我得先看你合不合适带\n合适的话我推个教务老师给你\n你找他领最新优惠"
5. 用户消息可以包含微信表情如[捂脸] [破涕为笑]等
6. 生成4-8轮对话(8-16条消息) 必须以用户开头
7. 不要生成任何跟示例完全相同的句子 要创造新的对话内容但保持同样的说话方式

请用以下JSON格式输出 不要输出其他任何内容:
[
  {{"role": "user", "content": "用户说的话"}},
  {{"role": "assistant", "content": "懂小智说的话"}},
  ...
]"""

        return prompt

    def _auto_fix_conversation(self, conversation: List[Dict[str, str]]) -> List[Dict[str, str]]:
        """
        自动修复生成对话中的小问题
        - 移除标点符号
        - 您 → 你
        - 移除禁词
        - 修剪超长行
        """
        fixed = []
        for msg in conversation:
            content = msg.get("content", "")
            role = msg.get("role", "user")

            if role == "assistant":
                # 移除标点（保留微信表情内的内容）
                parts = re.split(r'(\[.*?\])', content)
                cleaned_parts = []
                for part in parts:
                    if part.startswith('[') and part.endswith(']'):
                        cleaned_parts.append(part)
                    else:
                        for p in FORBIDDEN_PUNCTUATION:
                            part = part.replace(p, '')
                        cleaned_parts.append(part)
                content = ''.join(cleaned_parts)

                # 您 → 你
                content = content.replace('您', '你')

                # 移除禁词
                for word in ["亲", "小伙伴", "同学你好", "欢迎咨询", "非常感谢",
                             "感谢您", "为您", "帮到您", "请您", "麻烦您", "打扰您"]:
                    content = content.replace(word, '')

                # 修剪超长行: 保留不超过15字(不算表情)
                lines = content.split('\n')
                trimmed_lines = []
                for line in lines:
                    line_stripped = line.strip()
                    if not line_stripped:
                        continue
                    clean_line = re.sub(r'\[.*?\]', '', line_stripped)
                    if len(clean_line) > 15:
                        # 尝试在15字处截断并保留表情
                        char_count = 0
                        cut_pos = 0
                        in_bracket = False
                        for ci, ch in enumerate(line_stripped):
                            if ch == '[':
                                in_bracket = True
                            elif ch == ']':
                                in_bracket = False
                                continue
                            if not in_bracket and ch != '[':
                                char_count += 1
                                if char_count >= 15:
                                    cut_pos = ci + 1
                                    break
                        if cut_pos > 0:
                            line_stripped = line_stripped[:cut_pos]
                    trimmed_lines.append(line_stripped)
                content = '\n'.join(trimmed_lines)

            # 清理空白
            content = content.strip()
            if content:
                fixed.append({"role": role, "content": content})

        return fixed

    def _parse_response(self, response_text: str) -> Optional[List[Dict[str, str]]]:
        """
        解析 LLM 返回的对话 JSON
        """
        text = response_text.strip()

        # 尝试提取 JSON 数组
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]

        # 找到第一个 [ 和最后一个 ]
        start = text.find("[")
        end = text.rfind("]")
        if start == -1 or end == -1:
            return None

        json_str = text[start:end + 1]

        try:
            conversation = json.loads(json_str)
            if not isinstance(conversation, list):
                return None

            # 标准化格式
            result = []
            for msg in conversation:
                if not isinstance(msg, dict):
                    continue
                role = msg.get("role", "")
                content = msg.get("content", "")
                if role in ("user", "assistant") and content.strip():
                    result.append({"role": role, "content": content.strip()})

            if len(result) < 6:
                return None

            # 自动修复小问题
            result = self._auto_fix_conversation(result)

            return result if len(result) >= 6 else None

        except json.JSONDecodeError:
            return None

    def _generate_one(self, scenario: Dict, max_retries: int = 3) -> Tuple[Optional[Dict], Optional[str]]:
        """
        生成一条对话, 失败重试
        返回格式: {"conversation_json": [...], "category": ..., "title": ..., ...}
        """
        if not self.client:
            return None, "LLM 客户端未初始化"

        last_error: Optional[str] = None

        for attempt in range(max_retries):
            try:
                prompt = self._build_prompt(scenario)

                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.9,
                    max_tokens=2000,
                )

                result_text = response.choices[0].message.content
                conversation = self._parse_response(result_text)

                if conversation is None:
                    last_error = "LLM 返回结果不是有效对话 JSON"
                    continue

                # 风格校验
                passed, issues = validate_conversation_style(conversation)
                if not passed:
                    last_error = f"风格校验未通过: {'; '.join(issues[:3])}"
                    print(f"[DataGenerator] 校验失败 (尝试{attempt + 1}): {issues[:3]}")
                    continue

                # 通过校验
                return {
                    "conversation_json": conversation,
                    "category": scenario["category"],
                    "quality": "high",
                    "title": scenario["title"],
                    "description": f"LLM生成 - {scenario['user_persona']}",
                    "tags": scenario["key_topics"],
                    "source": "llm_generated",
                    "created_by": "auto_generator",
                }, None

            except Exception as e:
                last_error = f"调用模型失败: {str(e)}"
                print(f"[DataGenerator] 生成异常 (尝试{attempt + 1}): {e}")
                time.sleep(1)

        return None, last_error or "生成失败 未拿到有效结果"

    def generate_batch(
        self,
        target_count: int = 200,
        categories: Optional[List[str]] = None,
    ) -> GenerationProgress:
        """
        批量生成对话数据

        Args:
            target_count: 目标生成数量
            categories: 指定分类, None 表示全部

        Returns:
            GenerationProgress 进度对象
        """
        if not self.client:
            self.progress = GenerationProgress()
            self.progress.errors.append("LLM 客户端未初始化 请检查 API Key 配置")
            return self.progress

        # 筛选场景
        templates = SCENARIO_TEMPLATES
        if categories:
            templates = [t for t in templates if t["category"] in categories]

        if not templates:
            self.progress = GenerationProgress()
            self.progress.errors.append("没有匹配的场景模板")
            return self.progress

        # 计算每个场景需要生成多少条
        per_scenario = max(1, target_count // len(templates))
        remainder = target_count - per_scenario * len(templates)

        # 构建生成任务列表
        tasks = []
        for template in templates:
            count = per_scenario
            if remainder > 0:
                count += 1
                remainder -= 1
            for _ in range(count):
                tasks.append(template)

        random.shuffle(tasks)

        # 初始化进度
        self.progress = GenerationProgress(
            total=len(tasks),
            is_running=True,
        )

        # 逐条生成
        for i, scenario in enumerate(tasks):
            if not self.progress.is_running:
                break

            result, error = self._generate_one(scenario)
            self.progress.completed = i + 1

            if result:
                self.progress.passed += 1
                self.progress.results.append(result)
            else:
                self.progress.failed += 1
                if error and len(self.progress.errors) < 50:
                    self.progress.errors.append(f"{scenario['title']}: {error}")

            # 控制速率 避免 API 限流
            if i > 0 and i % 10 == 0:
                time.sleep(0.5)

        self.progress.is_running = False
        return self.progress

    def generate_batch_async(
        self,
        target_count: int = 200,
        categories: Optional[List[str]] = None,
    ) -> GenerationProgress:
        """
        异步批量生成 (后台线程)
        """
        self.progress = GenerationProgress(is_running=True)

        def _run():
            self.generate_batch(target_count, categories)

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

        return self.progress

    def get_progress(self) -> Dict:
        """获取当前生成进度"""
        return {
            "total": self.progress.total,
            "completed": self.progress.completed,
            "passed": self.progress.passed,
            "failed": self.progress.failed,
            "is_running": self.progress.is_running,
            "error_count": len(self.progress.errors),
            "errors": self.progress.errors[:10],  # 最多返回10条错误
        }


# Generator progress contains tenant data and must never be shared across tenants.
_generator_instances: Dict[str, DataGenerator] = {}
_generator_lock = threading.RLock()


def get_generator() -> DataGenerator:
    """获取当前租户独立的生成器。"""
    from app.models.database import current_tenant_id

    tenant_id = current_tenant_id()
    with _generator_lock:
        if tenant_id not in _generator_instances:
            _generator_instances[tenant_id] = DataGenerator()
        return _generator_instances[tenant_id]


def dispose_generators() -> None:
    """Clear tenant generator state for tests and controlled shutdown."""
    with _generator_lock:
        for generator in _generator_instances.values():
            generator.progress.is_running = False
        _generator_instances.clear()
