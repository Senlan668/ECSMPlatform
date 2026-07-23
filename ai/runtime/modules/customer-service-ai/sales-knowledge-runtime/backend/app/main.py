# -*- coding: utf-8 -*-
"""
AiWxChat 后端主入口
"""
from fastapi import FastAPI
from contextlib import asynccontextmanager
import sqlalchemy

from app.config import get_settings
from app.models.database import get_engine, Base
# 导入所有模型以确保表被创建
from app.models.chat import RawChat, KnowledgeChunk, Session, Contact, LabeledConversation, StagingConversation, CustomConversation, Material, KnowledgeArticle, Quiz, QuizAttempt
from app.models.user import User
from app.models.student import Student
from app.models.student_report_binding import StudentReportBinding  # noqa: F401  确保 create_all 创建绑定表
from app.routers import chats, search, knowledge, export, filter, labeling, admin, custom, materials, auth, students, extractor, quiz
from app.services.schema_sync import ensure_legacy_material_schema, ensure_legacy_raw_chat_schema, ensure_legacy_student_schema
from app.runtime_security import RuntimeSecurityMiddleware

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # 启动时创建数据库表
    print("[INFO] Creating database tables...")
    try:
        engine = get_engine()
        # pgvector is a PostgreSQL extension; SQLite uses the JSON/cosine fallback.
        if engine.dialect.name == "postgresql":
            try:
                with engine.connect() as conn:
                    conn.execute(sqlalchemy.text("CREATE EXTENSION IF NOT EXISTS vector"))
                    conn.commit()
                    print("[INFO] pgvector extension enabled")
            except Exception as e:
                print(f"[INFO] pgvector extension unavailable: {e}")
        # 无论 pgvector 是否成功，都要创建表
        Base.metadata.create_all(bind=engine)
        added_columns = ensure_legacy_raw_chat_schema(engine)
        if added_columns:
            print(f"[INFO] Patched legacy raw_chats columns: {', '.join(added_columns)}")
        added_material_columns = ensure_legacy_material_schema(engine)
        if added_material_columns:
            print(f"[INFO] Patched legacy materials columns: {', '.join(added_material_columns)}")
        added_student_columns = ensure_legacy_student_schema(engine)
        if added_student_columns:
            print(f"[INFO] Patched legacy students columns: {', '.join(added_student_columns)}")
        print("[INFO] Database tables ready")
    except Exception as e:
        print(f"[WARN] Database init failed: {e}")
        print("[INFO] Some features may not work without database")
    yield
    # 关闭时清理
    print("[INFO] Shutting down...")


# 创建应用
app = FastAPI(
    title="AiWxChat API",
    description="微信聊天记录知识库 API",
    version="1.0.0",
    lifespan=lifespan
)

# React never calls this runtime directly. Java supplies both headers.
app.add_middleware(RuntimeSecurityMiddleware)

# 注册路由
app.include_router(chats.router)
app.include_router(search.router)
app.include_router(knowledge.router)
app.include_router(export.router)
app.include_router(filter.router)
app.include_router(labeling.router)
app.include_router(admin.router)
app.include_router(custom.router)
app.include_router(materials.router)
app.include_router(auth.router)
app.include_router(students.router)
app.include_router(extractor.router)
app.include_router(quiz.router)


@app.get("/")
def root():
    """根路径"""
    return {
        "name": "AiWxChat API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": "sales-knowledge-runtime",
        "capabilities": {
            "tenant_storage": "sqlite",
            "vector_index": False,
            "llm": bool(settings.deepseek_api_key or settings.openai_api_key),
            "embedding": bool(settings.ark_api_key),
            "object_storage": bool(
                settings.tos_access_key
                and settings.tos_secret_key
                and settings.tos_endpoint
                and settings.tos_bucket
            ),
            "vision": bool(settings.ark_vision_api_key),
        },
    }


@app.get("/api/runtime/capabilities")
def runtime_capabilities():
    """Return tenant-scoped capability availability to the control plane."""
    return {
        "service": "sales-knowledge-runtime",
        "storage": {
            "mode": "tenant_sqlite",
            "ready": True,
        },
        "capabilities": {
            "wechat_etl": True,
            "cleaning_and_labeling": True,
            "training_export": True,
            "student_management": True,
            "rag_search": bool(settings.ark_api_key),
            "rag_answer": bool(settings.deepseek_api_key or settings.openai_api_key),
            "object_storage": bool(
                settings.tos_access_key
                and settings.tos_secret_key
                and settings.tos_endpoint
                and settings.tos_bucket
            ),
            "vision_import": bool(settings.ark_vision_api_key),
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=settings.debug
    )
