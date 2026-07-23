# -*- coding: utf-8 -*-
"""
数据标注 API
支持数据清洗、人工标注、批量操作
"""
from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func, and_
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import json

from app.models.database import get_db
from app.models.chat import RawChat, LabeledConversation, LabelStatus, DataCategory
from app.services.training_data import (
    TrainingDataPipeline, 
    ConversationBuilder,
    DataQuality
)

router = APIRouter(prefix="/api/labeling", tags=["labeling"])

# 时间过滤：只处理 2025年10月 及以后的数据
MIN_TIMESTAMP = 1759248000  # 2025-10-01 00:00:00 CST (秒级)


# ==================== 请求模型 ====================

class CleaningConfig(BaseModel):
    """清洗配置"""
    time_window_seconds: int = 300
    max_turns: int = 20
    min_quality: str = "low"  # 初次清洗用低门槛
    session_ids: Optional[List[str]] = None
    limit: int = 1000  # 每次处理数量


class LabelRequest(BaseModel):
    """标注请求"""
    category: str  # 分类
    quality: str = "medium"  # high/medium/low
    notes: Optional[str] = None  # 备注
    modified_text: Optional[str] = None  # 修改后的文本


class BatchLabelRequest(BaseModel):
    """批量标注请求"""
    ids: List[int]
    action: str  # approve/reject/set_category
    category: Optional[str] = None
    quality: Optional[str] = None


# ==================== 统计 API ====================

@router.delete("/clear")
def clear_all_labeled_data(db: DBSession = Depends(get_db)):
    """清空所有标注数据（重新开始）"""
    count = db.query(LabeledConversation).delete()
    db.commit()
    return {"message": f"已清空 {count} 条标注数据"}


@router.get("/stats")
def get_labeling_stats(db: DBSession = Depends(get_db)):
    """获取标注统计信息"""
    
    # 原始数据统计
    raw_count = db.query(RawChat).count()
    raw_sessions = db.query(func.count(func.distinct(RawChat.session_id))).scalar()
    
    # 已标注数据统计
    labeled_total = db.query(LabeledConversation).count()
    
    # 按状态统计
    status_counts = dict(
        db.query(
            LabeledConversation.status, 
            func.count(LabeledConversation.id)
        ).group_by(LabeledConversation.status).all()
    )
    
    # 按分类统计（已通过的）
    category_counts = dict(
        db.query(
            LabeledConversation.human_category, 
            func.count(LabeledConversation.id)
        ).filter(
            LabeledConversation.status == LabelStatus.APPROVED.value
        ).group_by(LabeledConversation.human_category).all()
    )
    
    return {
        "raw_messages": raw_count,
        "raw_sessions": raw_sessions,
        "labeled_total": labeled_total,
        "by_status": {
            "pending": status_counts.get(LabelStatus.PENDING.value, 0),
            "approved": status_counts.get(LabelStatus.APPROVED.value, 0),
            "rejected": status_counts.get(LabelStatus.REJECTED.value, 0),
            "modified": status_counts.get(LabelStatus.MODIFIED.value, 0),
        },
        "by_category": category_counts,
        "progress": {
            "total": labeled_total,
            "done": status_counts.get(LabelStatus.APPROVED.value, 0) + status_counts.get(LabelStatus.REJECTED.value, 0),
            "pending": status_counts.get(LabelStatus.PENDING.value, 0),
        }
    }


# ==================== 数据清洗 API ====================

@router.post("/clean")
def clean_raw_data(
    config: CleaningConfig,
    background_tasks: BackgroundTasks,
    db: DBSession = Depends(get_db)
):
    """
    清洗原始数据，生成待标注的对话
    这是第一步：把原始消息转换成对话块
    """
    # 检查是否已有未处理的数据
    pending_count = db.query(LabeledConversation).filter(
        LabeledConversation.status == LabelStatus.PENDING.value
    ).count()
    
    # 构建处理管道
    pipeline = TrainingDataPipeline(
        builder=ConversationBuilder(
            time_window_seconds=config.time_window_seconds,
            max_turns_per_conversation=config.max_turns
        ),
        min_quality=DataQuality(config.min_quality)
    )
    
    # 获取会话（只获取有 2025年10月 及以后消息的会话）
    session_query = db.query(RawChat.session_id).filter(
        RawChat.timestamp >= MIN_TIMESTAMP
    ).distinct()
    if config.session_ids:
        session_query = session_query.filter(RawChat.session_id.in_(config.session_ids))
    
    sessions = session_query.limit(50).all()  # 限制会话数
    
    created_count = 0
    
    for (session_id,) in sessions:
        # 检查该会话是否已处理过
        existing = db.query(LabeledConversation).filter(
            LabeledConversation.session_id == session_id
        ).first()
        if existing:
            continue
        
        # 获取消息（过滤 2025年10月 以前的数据）
        messages = db.query(RawChat).filter(
            RawChat.session_id == session_id,
            RawChat.timestamp >= MIN_TIMESTAMP
        ).order_by(RawChat.timestamp).limit(config.limit).all()
        
        if not messages:
            continue
        
        # 转换为字典
        msg_dicts = [
            {
                "id": m.id,
                "sender_name": m.sender_name or m.sender_wxid,
                "content": m.content,
                "timestamp": m.timestamp,
                "is_sender": m.is_sender
            }
            for m in messages
        ]
        
        # 处理
        examples = pipeline.process_session(session_id, msg_dicts)
        
        # 保存到标注表
        for ex in examples:
            # 构建对话文本
            conv_text = "\n".join([
                f"{'销售' if t.role == 'assistant' else '客户'}: {t.content}"
                for t in ex.conversations
            ])
            
            # 构建结构化数据
            conv_json = [
                {"role": t.role, "content": t.content, "sender": t.sender}
                for t in ex.conversations
            ]
            
            labeled = LabeledConversation(
                conversation_text=conv_text,
                conversation_json=json.dumps(conv_json, ensure_ascii=False) if not isinstance(conv_json, str) else conv_json,
                session_id=session_id,
                source_message_ids=json.dumps(ex.metadata.get("source_ids", [])),
                auto_category=ex.category.value,
                auto_quality_score=ex.metadata.get("score", 5.0),
                status=LabelStatus.PENDING.value,
                created_at=datetime.utcnow()
            )
            db.add(labeled)
            created_count += 1
        
        if created_count >= config.limit:
            break
    
    db.commit()
    
    return {
        "message": "清洗完成",
        "created": created_count,
        "pending_total": pending_count + created_count
    }


# ==================== 列表查询 API ====================

@router.get("/list")
def list_labeled_data(
    status: Optional[str] = Query(None, description="状态筛选"),
    category: Optional[str] = Query(None, description="分类筛选"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: DBSession = Depends(get_db)
):
    """获取待标注/已标注数据列表"""
    
    query = db.query(LabeledConversation)
    
    if status:
        query = query.filter(LabeledConversation.status == status)
    if category:
        query = query.filter(
            (LabeledConversation.human_category == category) | 
            (LabeledConversation.auto_category == category)
        )
    
    total = query.count()
    
    items = query.order_by(
        LabeledConversation.created_at.desc()
    ).offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": item.id,
                "conversation_text": item.conversation_text[:500] + "..." if len(item.conversation_text or "") > 500 else item.conversation_text,
                "session_id": item.session_id,
                "auto_category": item.auto_category,
                "auto_quality_score": item.auto_quality_score,
                "human_category": item.human_category,
                "human_quality": item.human_quality,
                "human_notes": item.human_notes,
                "status": item.status,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "labeled_at": item.labeled_at.isoformat() if item.labeled_at else None,
            }
            for item in items
        ]
    }


@router.get("/item/{item_id}")
def get_labeled_item(item_id: int, db: DBSession = Depends(get_db)):
    """获取单个标注项详情"""
    
    item = db.query(LabeledConversation).filter(
        LabeledConversation.id == item_id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="数据不存在")
    
    return {
        "id": item.id,
        "conversation_text": item.conversation_text,
        "conversation_json": json.loads(item.conversation_json) if isinstance(item.conversation_json, str) else item.conversation_json,
        "session_id": item.session_id,
        "auto_category": item.auto_category,
        "auto_quality_score": item.auto_quality_score,
        "auto_flags": item.auto_flags,
        "human_category": item.human_category,
        "human_quality": item.human_quality,
        "human_notes": item.human_notes,
        "modified_text": item.modified_text,
        "status": item.status,
        "labeled_by": item.labeled_by,
        "labeled_at": item.labeled_at.isoformat() if item.labeled_at else None,
        "created_at": item.created_at.isoformat() if item.created_at else None,
    }


# ==================== 标注操作 API ====================

@router.post("/item/{item_id}/label")
def label_item(
    item_id: int, 
    request: LabelRequest,
    db: DBSession = Depends(get_db)
):
    """对单个数据进行标注"""
    
    item = db.query(LabeledConversation).filter(
        LabeledConversation.id == item_id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="数据不存在")
    
    item.human_category = request.category
    item.human_quality = request.quality
    item.human_notes = request.notes
    item.status = LabelStatus.APPROVED.value
    item.labeled_at = datetime.utcnow()
    
    if request.modified_text:
        item.modified_text = request.modified_text
        item.status = LabelStatus.MODIFIED.value
    
    db.commit()
    
    return {"message": "标注成功", "id": item_id}


@router.post("/item/{item_id}/reject")
def reject_item(item_id: int, db: DBSession = Depends(get_db)):
    """拒绝/删除数据"""
    
    item = db.query(LabeledConversation).filter(
        LabeledConversation.id == item_id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="数据不存在")
    
    item.status = LabelStatus.REJECTED.value
    item.labeled_at = datetime.utcnow()
    db.commit()
    
    return {"message": "已拒绝", "id": item_id}


@router.post("/batch")
def batch_label(request: BatchLabelRequest, db: DBSession = Depends(get_db)):
    """批量操作"""
    
    items = db.query(LabeledConversation).filter(
        LabeledConversation.id.in_(request.ids)
    ).all()
    
    if not items:
        raise HTTPException(status_code=404, detail="未找到数据")
    
    count = 0
    for item in items:
        if request.action == "approve":
            item.status = LabelStatus.APPROVED.value
            if request.category:
                item.human_category = request.category
            if request.quality:
                item.human_quality = request.quality
        elif request.action == "reject":
            item.status = LabelStatus.REJECTED.value
        elif request.action == "set_category" and request.category:
            item.human_category = request.category
            item.status = LabelStatus.APPROVED.value
        
        item.labeled_at = datetime.utcnow()
        count += 1
    
    db.commit()
    
    return {"message": f"批量操作完成", "count": count}


# ==================== 导出已标注数据 ====================

@router.get("/export")
def export_labeled_data(
    format: str = Query("sharegpt", description="导出格式"),
    status: str = Query("approved", description="状态筛选"),
    categories: Optional[str] = Query(None, description="分类筛选，逗号分隔"),
    db: DBSession = Depends(get_db)
):
    """导出已标注的数据"""
    
    query = db.query(LabeledConversation).filter(
        LabeledConversation.status == status
    )
    
    if categories:
        cat_list = categories.split(",")
        query = query.filter(LabeledConversation.human_category.in_(cat_list))
    
    items = query.all()
    
    if not items:
        raise HTTPException(status_code=404, detail="没有符合条件的数据")
    
    # 根据分类选择 system prompt
    SYSTEM_PROMPTS = {
        "sales": """我是懂王Ai的懂小智，比懂王更懂Ai。我不是客服，是助你转行的职业导师。

【说话风格】
说话极简，像微信聊天一样频繁换行。每行不超过15字。严禁标点，严禁说"亲"或"您"。

【硬性红线】
严禁说出任何具体价格数字。一旦涉及钱、优惠或分期，统一回复："价格这块懂王Ai经常有活动。我得先看你合不合适带，合适的话我推个教务老师给你，你找他领最新优惠。"

【成交逻辑】
1. 姿态要高：用户问课，不直接答。先查背景（学历、专业、技术栈、薪资）。不合要求的直接劝退，不浪费时间。
2. 制造危机：强调"Java/前端已死"、"年轻人要干有前途的行业"。
3. 引导人工：背景合适且意向强的，直接要电话或推教务，闭环成交。""",
        "course": "我是一位专业的课程咨询师，熟悉课程内容和教学安排。",
        "objection": "我是一位经验丰富的销售顾问，擅长化解客户异议。",
        "closing": "我是一位专业的成交顾问，擅长引导客户完成报名。",
        "followup": "我是一位贴心的客户服务顾问，擅长维护客户关系。",
    }
    DEFAULT_PROMPT = "我是一位专业的课程销售顾问。"
    
    dataset = []
    
    for item in items:
        # 使用修改后的文本（如果有）
        text = item.modified_text or item.conversation_text
        category = item.human_category or item.auto_category
        
        if format == "sharegpt":
            # 解析对话
            conversations = [{"from": "system", "value": SYSTEM_PROMPTS.get(category, DEFAULT_PROMPT)}]
            
            for line in text.split("\n"):
                if ": " in line:
                    role, content = line.split(": ", 1)
                    from_role = "gpt" if role in ["销售", "助手", "我"] else "human"
                    conversations.append({"from": from_role, "value": content})
            
            dataset.append({
                "id": str(item.id),
                "conversations": conversations,
                "category": category,
                "quality": item.human_quality
            })
        
        elif format == "alpaca":
            # 提取问答对
            lines = text.split("\n")
            for i in range(len(lines) - 1):
                if "客户: " in lines[i] and "销售: " in lines[i+1]:
                    q = lines[i].replace("客户: ", "")
                    a = lines[i+1].replace("销售: ", "")
                    dataset.append({
                        "instruction": q,
                        "input": "",
                        "output": a,
                        "category": category
                    })
    
    return {
        "format": format,
        "count": len(dataset),
        "data": dataset
    }
