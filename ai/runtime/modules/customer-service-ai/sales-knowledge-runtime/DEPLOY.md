# AiWxChat 部署指南

## 📋 前置条件

- 一台 Linux 服务器（推荐 2 核 4GB 以上）
- 已安装 Docker 和 Docker Compose
- 已安装 Git
- 服务器 80 端口已在安全组中放开

### 安装 Docker（如未安装）

```bash
# CentOS / Alibaba Cloud Linux
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# 验证
docker --version
docker compose version
```

---

## 🚀 快速部署

### 1. 克隆项目

```bash
cd /opt
git clone https://gitee.com/leejersey/ai-wx-chat.git
cd ai-wx-chat
```

### 2. 配置环境变量

```bash
cp backend/env.example backend/.env
vi backend/.env
```

编辑 `backend/.env`，填入以下关键配置：

```ini
# 环境标识（区分本地/线上，TOS 路径前缀隔离）
APP_ENV=prod

# AI 模型 API（至少配置一个）
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# 火山引擎 TOS 对象存储（素材库功能需要）
TOS_ACCESS_KEY=your_access_key
TOS_SECRET_KEY=your_secret_key
TOS_ENDPOINT=https://tos-cn-beijing.volces.com
TOS_REGION=cn-beijing
TOS_BUCKET=your_bucket_name
```

> ⚠️ `DATABASE_URL` 不需要在 `.env` 中配置，`docker-compose.yml` 已通过 `environment` 覆盖。

### 3. 上传微信数据

将本地微信 SQLite 数据上传到服务器：

```bash
# 在服务器上创建目录
mkdir -p /opt/ai-wx-chat/Msg/Msg

# 在本地电脑执行上传（替换为你的数据路径）
rsync -avz --progress /path/to/Msg/Msg/ root@<SERVER_IP>:/opt/ai-wx-chat/Msg/Msg/
```

### 4. 构建并启动

```bash
cd /opt/ai-wx-chat
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

首次构建约 2-3 分钟（已配置国内镜像源加速）。

### 5. 导入数据

启动完成后，触发 ETL 将微信数据导入 PostgreSQL：

```bash
# 等待后端完全启动（约 10 秒）
sleep 10

# 触发数据导入
curl -X POST http://localhost:8000/api/admin/etl
```

### 6. 访问

打开浏览器访问：`http://<SERVER_IP>`

---

## 🏗️ 架构说明

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │     │   Backend        │     │   Database      │
│   Nginx :80     │────▶│   FastAPI :8000   │────▶│  PostgreSQL     │
│   React + Vite  │     │   Python 3.11    │     │  + pgvector     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  微信 SQLite 数据  │
                    │  /data/wechat (ro)│
                    └──────────────────┘
```

| 服务 | 容器名 | 端口 | 镜像 |
|------|--------|------|------|
| 前端 | aiwxchat-frontend | 80 | node:20-alpine + nginx |
| 后端 | aiwxchat-backend | 8000 | python:3.11-slim |
| 数据库 | aiwxchat-db | 5432 | pgvector/pgvector:pg16 |

---

## 📝 常用运维命令

```bash
# 查看容器状态
docker ps -a

# 查看后端日志
docker logs -f aiwxchat-backend

# 重启单个服务
docker compose restart backend

# 更新代码并重新部署
cd /opt/ai-wx-chat && git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 只重建后端（不影响前端和数据库）
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend

# 进入数据库
docker exec -it aiwxchat-db psql -U postgres -d aiwxchat

# 查看数据库表
docker exec aiwxchat-db psql -U postgres -d aiwxchat -c "\dt"

# 清理 Docker 缓存
docker system prune -a -f
```

---

## 🔧 常见问题

### Q: 构建速度很慢？

Dockerfile 已配置国内镜像源（阿里云 apt + 清华 pip + 淘宝 npm）。如果仍然慢，检查服务器网络或考虑使用代理。

### Q: 访问不了网站？

1. 确认容器运行中：`docker ps`
2. 确认 80 端口开放：`lsof -i :80`
3. 检查云服务商安全组是否放开 80 端口入站规则

### Q: ETL 导入报错 `relation "contacts" does not exist`？

重启后端让 pgvector 扩展和表自动创建：

```bash
docker compose restart backend
sleep 5
curl -X POST http://localhost:8000/api/admin/etl
```

### Q: 如何备份数据库？

```bash
docker exec aiwxchat-db pg_dump -U postgres aiwxchat > backup_$(date +%Y%m%d).sql
```

### Q: 如何恢复数据库？

```bash
cat backup_20260324.sql | docker exec -i aiwxchat-db psql -U postgres -d aiwxchat
```

---

## 🔒 安全建议

1. **修改默认数据库密码**：在 `docker-compose.yml` 中修改 `POSTGRES_PASSWORD` 和 `DATABASE_URL`
2. **限制端口暴露**：生产环境不要暴露 5432（数据库）和 8000（API）端口
3. **配置 HTTPS**：使用 Nginx 反向代理 + Let's Encrypt 证书
4. **保护 .env 文件**：确保 `.env` 在 `.gitignore` 中，不要提交到仓库
