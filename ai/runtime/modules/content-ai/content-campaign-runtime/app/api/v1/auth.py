"""认证 API - 登录。"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.security import verify_password, create_access_token
from app.models.user import User
from app.dependencies.auth import get_current_user
from app.services.admin_service import admin_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


# ============== 请求/响应模型 ==============

class LoginRequest(BaseModel):
    """登录请求"""
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")


class TokenResponse(BaseModel):
    """Token 响应"""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token 类型")


class UserInfoResponse(BaseModel):
    """用户信息响应"""
    id: str = Field(..., description="用户ID")
    username: str = Field(..., description="用户名")
    is_admin: bool = Field(False, description="是否为管理员")


# ============== API 接口 ==============


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_async_session)
) -> TokenResponse:
    """
    用户登录
    
    Args:
        request: 包含 username 和 password 的请求体
        db: 数据库会话
        
    Returns:
        JWT access token
    """
    # 查询用户
    result = await db.execute(
        select(User).where(User.username == request.username)
    )
    user = result.scalar_one_or_none()
    
    # 验证用户和密码
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not bool(getattr(user, "is_active", True)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号已停用，请联系管理员",
        )
    
    # 创建 token
    access_token = create_access_token(data={"sub": str(user.id)})
    
    return TokenResponse(access_token=access_token)


@router.get("/me", response_model=UserInfoResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_async_session),
) -> UserInfoResponse:
    """
    获取当前登录用户信息
    
    Args:
        current_user: 当前登录用户
        
    Returns:
        用户信息
    """
    return UserInfoResponse(
        id=str(current_user.id),
        username=current_user.username,
        is_admin=await admin_service.is_admin(db, current_user),
    )
