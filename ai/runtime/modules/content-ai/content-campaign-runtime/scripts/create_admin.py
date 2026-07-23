#!/usr/bin/env python3
"""创建或恢复管理员账号。密码仅通过交互式输入读取。"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from sqlalchemy import select

from app.core.db import async_session_factory
from app.core.security import get_password_hash
from app.models.user import User


def read_password() -> str:
    password = getpass.getpass("密码（至少 6 位）: ")
    confirmation = getpass.getpass("确认密码: ")
    if len(password) < 6 or len(password) > 100:
        raise ValueError("密码长度必须为 6 至 100 个字符")
    if password != confirmation:
        raise ValueError("两次输入的密码不一致")
    return password


async def create_or_restore_admin(username: str) -> None:
    username = username.strip()
    if len(username) < 3 or len(username) > 50:
        raise ValueError("用户名长度必须为 3 至 50 个字符")

    async with async_session_factory() as session:
        result = await session.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if user is None:
            password = read_password()
            user = User(
                username=username,
                password_hash=get_password_hash(password),
                is_admin=True,
                is_active=True,
            )
            session.add(user)
        else:
            user.is_admin = True
            user.is_active = True
            reset = input("账号已存在，是否同时重置密码？[y/N]: ").strip().lower()
            if reset == "y":
                user.password_hash = get_password_hash(read_password())
        await session.commit()
    print(f"管理员账号 {username} 已就绪")


def main() -> None:
    parser = argparse.ArgumentParser(description="创建或恢复管理员账号")
    parser.add_argument("username", help="管理员用户名")
    args = parser.parse_args()
    asyncio.run(create_or_restore_admin(args.username))


if __name__ == "__main__":
    main()
