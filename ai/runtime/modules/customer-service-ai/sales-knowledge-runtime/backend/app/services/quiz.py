# -*- coding: utf-8 -*-
"""
AI 考核出题 & 评判服务
基于知识库内容生成销售场景题目，AI 评判答案合理性
"""
import json
import re
from typing import List, Dict, Optional
from sqlalchemy.orm import Session as DBSession

from app.config import get_settings
from app.models.chat import KnowledgeArticle, KnowledgeChunk

settings = get_settings()


def _get_llm_client():
    """获取 LLM 客户端"""
    from openai import OpenAI
    if settings.deepseek_api_key:
        return OpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
        ), "deepseek-chat"
    if settings.openai_api_key:
        return OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url,
        ), "gpt-4o-mini"
    return None, None


def _load_knowledge_context(db: DBSession, category: Optional[str] = None, limit: int = 30) -> str:
    """从知识库加载参考素材"""
    articles = db.query(KnowledgeArticle)
    if category:
        articles = articles.filter(KnowledgeArticle.scene_category == category)
    articles = articles.order_by(KnowledgeArticle.confidence.desc()).limit(limit).all()

    if articles:
        lines = []
        for a in articles:
            lines.append(f"场景: {a.scene}")
            if a.customer_says:
                lines.append(f"客户说: {a.customer_says}")
            if a.recommended_response:
                lines.append(f"推荐回复: {a.recommended_response}")
            lines.append("---")
        return "\n".join(lines)

    chunks = db.query(KnowledgeChunk).limit(limit).all()
    if chunks:
        return "\n---\n".join(c.content_block for c in chunks if c.content_block)

    return ""


def generate_quiz_questions(
    db: DBSession,
    category: str = "sales",
    count: int = 10,
) -> List[Dict]:
    """
    AI 生成考核题目
    返回 [{id, question, reference_answer, category, difficulty}]
    """
    client, model = _get_llm_client()
    if not client:
        raise RuntimeError("LLM 客户端未初始化，请检查 API Key 配置")

    context = _load_knowledge_context(db, category)

    category_labels = {
        "sales": "销售话术",
        "objection": "异议处理",
        "closing": "成交转化",
        "course": "课程咨询",
        "followup": "客户跟进",
    }
    cat_label = category_labels.get(category, "销售话术")

    system_prompt = f"""你是一位资深销售培训考官 负责出题考核销售人员的{cat_label}能力

请基于以下知识库素材 出{count}道开放式销售场景题 考察销售人员的实战应对能力

【出题要求】
1. 每道题模拟一个真实客户场景 给出客户的具体说法
2. 题目应覆盖不同难度: 简单(3题) 中等(4题) 困难(3题)
3. 每道题提供参考答案(基于知识库中的推荐话术)
4. 题目要贴近实战 不要太学术化

【输出格式】
严格输出 JSON 数组 不要输出其他内容:
[
  {{
    "id": 1,
    "question": "客户说: xxx 你应该如何回复",
    "reference_answer": "推荐的回复话术",
    "difficulty": "easy/medium/hard"
  }}
]"""

    user_prompt = f"以下是知识库中的销售素材:\n\n{context}\n\n请基于以上素材出{count}道{cat_label}考核题"

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.7,
        max_tokens=4000,
    )

    content = response.choices[0].message.content.strip()
    json_match = re.search(r'\[.*\]', content, re.DOTALL)
    if json_match:
        content = json_match.group()

    questions = json.loads(content)

    for i, q in enumerate(questions):
        q["id"] = i + 1
        q["category"] = category
        if "difficulty" not in q:
            q["difficulty"] = "medium"

    return questions[:count]


def ai_grade_answers(
    questions: List[Dict],
    user_answers: List[Dict],
) -> List[Dict]:
    """
    AI 评判每道题的答案
    返回 [{question_id, score, feedback, is_reasonable}]
    """
    client, model = _get_llm_client()
    if not client:
        raise RuntimeError("LLM 客户端未初始化，请检查 API Key 配置")

    answer_map = {a["question_id"]: a["answer"] for a in user_answers}

    qa_text = []
    for q in questions:
        qid = q["id"]
        user_ans = answer_map.get(qid, "(未作答)")
        qa_text.append(
            f"题目{qid}: {q['question']}\n"
            f"参考答案: {q.get('reference_answer', '无')}\n"
            f"学员回答: {user_ans}"
        )

    system_prompt = """你是一位资深销售培训评审专家 负责评判销售人员的考核答案

【评判标准】
1. 回复是否贴近实战(不要太书面化)
2. 是否抓住了客户的核心需求/顾虑
3. 是否有正确的销售策略(如: 先了解背景再推方案)
4. 话术是否自然 不像机器人
5. 是否触犯红线(如: 直接报价格 用"亲"等客服用语)

【评分规则】
- 每题 0-10 分
- 8-10: 优秀 可直接使用
- 5-7: 合格 有改进空间
- 0-4: 不合格 需要重新学习

【输出格式】
严格输出 JSON 数组:
[
  {
    "question_id": 1,
    "score": 8,
    "feedback": "具体点评 指出优点和不足",
    "is_reasonable": true
  }
]"""

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "\n\n".join(qa_text)},
        ],
        temperature=0.3,
        max_tokens=4000,
    )

    content = response.choices[0].message.content.strip()
    json_match = re.search(r'\[.*\]', content, re.DOTALL)
    if json_match:
        content = json_match.group()

    return json.loads(content)
