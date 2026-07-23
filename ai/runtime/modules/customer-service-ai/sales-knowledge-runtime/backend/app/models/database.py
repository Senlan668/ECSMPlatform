# -*- coding: utf-8 -*-
"""
数据库连接配置
"""
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker
from contextvars import ContextVar, Token
from hashlib import sha256
from pathlib import Path
from threading import RLock
from typing import Optional

# 延迟初始化。默认实例供 CLI 使用；HTTP 请求由上下文选择租户实例。
_engine = None
_SessionLocal = None
_tenant_engines = {}
_tenant_sessions = {}
_registry_lock = RLock()
_tenant_context: ContextVar[str] = ContextVar("sales_knowledge_tenant", default="default")
Base = declarative_base()


def set_tenant_context(tenant_id: str) -> Token:
    return _tenant_context.set(tenant_id)


def reset_tenant_context(token: Token) -> None:
    _tenant_context.reset(token)


def current_tenant_id() -> str:
    return _tenant_context.get()


def _tenant_database_url(database_url: str, tenant_id: str) -> str:
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite" or tenant_id == "default" or url.database == ":memory:":
        return database_url
    database = Path(url.database or "./.runtime/aiwxchat.db")
    tenant_key = sha256(tenant_id.encode("utf-8")).hexdigest()[:32]
    tenant_database = database.parent / "tenants" / tenant_key / database.name
    return str(url.set(database=str(tenant_database)))


def get_engine(tenant_id: Optional[str] = None):
    """获取数据库引擎 (延迟初始化)"""
    global _engine
    from app.config import get_settings

    tenant = tenant_id or current_tenant_id()
    settings = get_settings()
    database_url = _tenant_database_url(settings.database_url, tenant)
    backend = make_url(database_url).get_backend_name()
    if tenant != "default" and backend != "sqlite":
        raise RuntimeError("多租户销售知识运行时当前只允许本地 SQLite 隔离模式")

    if tenant == "default" and _engine is not None:
        return _engine
    if tenant != "default" and tenant in _tenant_engines:
        return _tenant_engines[tenant]

    with _registry_lock:
        if tenant == "default" and _engine is not None:
            return _engine
        if tenant != "default" and tenant in _tenant_engines:
            return _tenant_engines[tenant]

        if backend == "sqlite":
            database = make_url(database_url).database
            if database and database != ":memory:":
                Path(database).parent.mkdir(parents=True, exist_ok=True)
            engine = create_engine(database_url, connect_args={"check_same_thread": False})
        else:
            engine = create_engine(
                database_url,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=20,
            )

        if tenant == "default":
            _engine = engine
        else:
            _tenant_engines[tenant] = engine
            Base.metadata.create_all(bind=engine)
        return engine


def get_session_local(tenant_id: Optional[str] = None):
    """获取会话工厂"""
    global _SessionLocal
    tenant = tenant_id or current_tenant_id()
    if tenant == "default":
        if _SessionLocal is None:
            _SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=get_engine(tenant))
        return _SessionLocal
    if tenant not in _tenant_sessions:
        with _registry_lock:
            if tenant not in _tenant_sessions:
                _tenant_sessions[tenant] = sessionmaker(
                    autocommit=False,
                    autoflush=False,
                    bind=get_engine(tenant),
                )
    return _tenant_sessions[tenant]


def dispose_runtime_databases() -> None:
    """释放本地运行时引擎，供测试和受控停机使用。"""
    global _engine, _SessionLocal
    engines = ([_engine] if _engine is not None else []) + list(_tenant_engines.values())
    for engine in engines:
        engine.dispose()
    _engine = None
    _SessionLocal = None
    _tenant_engines.clear()
    _tenant_sessions.clear()


# 兼容性别名
@property
def engine():
    return get_engine()


@property  
def SessionLocal():
    return get_session_local()


def get_db():
    """获取数据库会话"""
    SessionLocal = get_session_local()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
