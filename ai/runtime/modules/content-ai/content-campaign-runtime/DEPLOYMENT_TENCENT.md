# AI 内容运营助手 — 腾讯云轻量服务器部署指南

> 本文档记录了将 v1 版本部署到 **腾讯云轻量应用服务器** 的完整流程。
> 架构：**全 Docker 三容器**（Nginx + FastAPI + PostgreSQL），一条命令更新全部服务。

---

## 📐 部署架构

```
                        用户浏览器
                            │
                     http://your_server_ip
                            │
         ┌──────────────────▼──────────────────────┐
         │       腾讯云轻量应用服务器                  │
         │       your_server_ip                     │
         │       4核 / 4GB / 40GB SSD               │
         │                                          │
         │   宿主机 Nginx (:80)        ← 总入口     │
         │   ├── /api/*      → 127.0.0.1:8080      │
         │   ├── /static/*   → 127.0.0.1:8080      │
         │   ├── /health     → 127.0.0.1:8080      │
         │   ├── /           → 127.0.0.1:8080 (xhs)│
         │   └── /ark-h5/*   → 127.0.0.1:3001      │
         │                                          │
         │   Docker Compose (graph_xiaohongshu)     │
         │   ├── xhs-nginx (:8080)  ← 仅本地       │
         │   │   ├── 前端 SPA 静态文件               │
         │   │   └── 反代 → backend:8000            │
         │   ├── xhs-backend        ← 仅内部网络    │
         │   │   └── FastAPI 应用                    │
         │   └── xhs-postgres       ← 仅内部网络    │
         │       └── PostgreSQL 16                  │
         │                                          │
         │   Docker (ark-h5)                        │
         │   └── ark-backend (:3001) ← 仅本地       │
         │                                          │
         └──────────────────────────────────────────┘
```

### 与阿里云 SAE 方案的区别

| 维度 | 腾讯云轻量（本方案） | 阿里云 SAE（DEPLOYMENT.md） |
|------|--------------------|-----------------------------|
| 计算 | 固定规格 ECS | Serverless 弹性伸缩 |
| 数据库 | Docker 容器内 PostgreSQL | RDS Serverless（托管） |
| 前端 | Docker 多阶段构建 + Nginx 容器 | OSS + CDN |
| HTTPS | 需自行配置 Certbot | CLB + SSL 证书 |
| 成本 | ~¥50-100/月（固定） | ~¥150-200/月（按量） |
| 运维 | `docker compose up -d --build` 一条命令 | 全托管，零运维 |
| 适用 | 个人项目 / 开发测试 | 正式生产环境 |

---

## 1️⃣ 服务器环境准备

### 1.1 购买服务器

- **平台**：[腾讯云轻量应用服务器](https://cloud.tencent.com/product/lighthouse)
- **镜像**：Ubuntu 22.04 + Docker（官方应用镜像 `Docker26-m7u0`）
- **配置**：4 核 CPU / 4GB 内存 / 40GB SSD
- **地域**：广州

### 1.2 登录服务器

```bash
ssh ubuntu@your_server_ip
```

### 1.3 验证 Docker 环境

```bash
docker --version         # Docker 26+
docker compose version   # Docker Compose v2+
```

### 1.4 配置文件权限

```bash
sudo mkdir -p /opt/graph_xiaohongshu
sudo chown -R ubuntu:ubuntu /opt/graph_xiaohongshu
```

> ✅ 不需要安装 Node.js — 前端构建在 Docker 多阶段构建中自动完成。

---

## 2️⃣ 应用部署（Docker Compose 三容器）

### 2.1 拉取代码

```bash
cd /opt
git clone https://gitee.com/你的用户名/graph_xiaohongshu.git
cd graph_xiaohongshu
git checkout v1
```

> ⚠️ 如果 `git checkout v1` 时有文件冲突，先执行：
> ```bash
> git stash
> git checkout v1
> ```

### 2.2 创建 Dockerfile

```dockerfile
# /opt/graph_xiaohongshu/Dockerfile
FROM python:3.13-slim

WORKDIR /app

# 使用腾讯云镜像加速（国内服务器必须）
RUN sed -i 's|deb.debian.org|mirrors.cloud.tencent.com|g' /etc/apt/sources.list.d/debian.sources

# 安装系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖（利用 Docker 缓存层 + 腾讯云 PyPI 镜像）
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    -i https://mirrors.cloud.tencent.com/pypi/simple/ \
    --trusted-host mirrors.cloud.tencent.com

# 复制业务代码
COPY . .

# 创建日志目录
RUN mkdir -p logs

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 2.3 docker-compose.yml（已在仓库中）

仓库中已包含三容器版的 `docker-compose.yml`，无需手动创建。架构如下：

```yaml
services:
  postgres:    # 数据库（仅内部网络）
  backend:     # FastAPI 后端（仅内部网络）
  nginx:       # Nginx + 前端（对外暴露 80 端口）
    build:
      dockerfile: nginx.dockerfile  # 多阶段构建：Node 编译前端 → Nginx 镜像
```

> **关键设计**：
> - `nginx.dockerfile` 多阶段构建：Stage 1 用 Node.js 编译前端，Stage 2 将产物放入 Nginx 镜像
> - backend 和 postgres **不暴露端口到宿主机**，仅通过 Docker 内部网络通信
> - 只有 Nginx 的 80 端口对外可访问

### 2.4 创建生产环境配置

```bash
cat > /opt/graph_xiaohongshu/.env.production << 'EOF'
# ===== 数据库 =====
DATABASE_URL=postgresql+asyncpg://postgres:${POSTGRES_PASSWORD}@postgres:5432/langgraph_db
POSTGRES_URI=postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/langgraph_db

# ===== 应用配置 =====
APP_ENV=production
DEBUG=false
LOG_LEVEL=INFO

# ===== JWT =====
JWT_SECRET_KEY=替换为强随机字符串   # 用 openssl rand -hex 32 生成
JWT_ALGORITHM=HS256

# ===== LLM API Keys =====
LLM_API_KEY=你的火山引擎API密钥

# ===== 图片生成 =====
IMAGE_API_KEY=你的Gemini密钥

# ===== CORS =====
CORS_ORIGINS=http://your_server_ip,http://localhost:5173
EOF
```

> ⚠️ `.env.production` 已在 `.gitignore` 中，不会被提交到 Git。

### 2.5 构建并启动

```bash
cd /opt/graph_xiaohongshu
docker compose up -d --build
```

> 首次构建约需 5-8 分钟（包含前端 npm install + 后端 pip install）。

### 2.6 验证

```bash
# 检查容器状态（三个都应该是 running）
docker ps
# 期望看到: xhs-nginx、xhs-backend、xhs-postgres

# 通过 Nginx 测试健康检查（Docker Nginx 监听 8080）
curl http://localhost:8080/health
# 期望输出: {"status":"healthy","service":"AI内容运营助手"}

# 测试前端页面
curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/
# 期望: 200
```

### 2.7 数据库字段补齐（如需要）

如果登录/注册时出现 `column users.xxx does not exist` 错误：

```bash
docker exec -it xhs-postgres psql -U postgres -d langgraph_db -c "
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(100) DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
"
docker restart xhs-backend
```

---

## 3️⃣ 前端与 Nginx（自动构建，无需手动操作）

> ✅ 前端构建已集成到 Docker 多阶段构建中，**不需要在服务器上手动执行任何前端构建命令**。

`nginx.dockerfile` 会自动完成：
1. **Stage 1**：使用 `node:20-alpine` 执行 `npm ci` + `npm run build`
2. **Stage 2**：将构建产物拷入 `nginx:alpine` 镜像，并加载 `nginx/default.conf` 配置

Nginx 配置文件位于 `nginx/default.conf`，核心逻辑：
- `/` → 服务前端 SPA 静态文件（含 `try_files` 路由回退）
- `/api/*` → 反向代理到 `backend:8000`（Docker 内部网络）
- `/static/*` → 反向代理到 `backend:8000`（生成的配图）
- SSE 流式支持（`proxy_buffering off`）

### 3.1 开放防火墙

在 [腾讯云轻量应用服务器控制台](https://console.cloud.tencent.com/lighthouse) → 实例 → **防火墙** → 添加规则：

| 协议 | 端口 | 说明 |
|------|------|------|
| TCP  | 80   | HTTP |
| TCP  | 443  | HTTPS（后续绑域名时用） |

> ⚠️ **不要开放** 5432（数据库）和 8000（直连后端）端口。这些端口仅在 Docker 内部网络中使用。

### 3.2 更新宿主机 Nginx 配置

因为服务器上还有 **ark-h5** 等其他应用依赖宿主机 Nginx，所以保留宿主机 Nginx 作为总入口（80 端口），Docker Nginx 监听 `127.0.0.1:8080`，宿主机 Nginx 将 xhs 流量反向代理到 Docker Nginx。

更新 `/etc/nginx/sites-available/xhs`（或 `api`），将 xhs 相关的 location 块改为代理到 `127.0.0.1:8080`：

```nginx
# ====== graph_xiaohongshu（反向代理到 Docker Nginx） ======
location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
}

location /static/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    expires 7d;
}

location /health {
    proxy_pass http://127.0.0.1:8080;
}

location /docs {
    proxy_pass http://127.0.0.1:8080;
}

location /openapi.json {
    proxy_pass http://127.0.0.1:8080;
}

# ====== ark-h5（保持原有 location 块不动） ======

# ====== xhs 前端 SPA（兜底，放在最后） ======
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

修改后执行：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

> **要点**：
> - 宿主机 Nginx 保持 80 端口对外服务（ark-h5 + xhs 共用）
> - xhs 的所有流量代理到 Docker Nginx 的 `127.0.0.1:8080`
> - ark-h5 的 `/ark-h5/*` location 块保持不动

### 3.3 验证

```bash
# 后端健康检查
curl http://your_server_ip/health
# 期望输出: {"status":"healthy","service":"AI内容运营助手"}

# 前端页面
curl -I http://your_server_ip/
# 期望: HTTP/1.1 200 OK

# SPA 路由
curl -I http://your_server_ip/workflow
# 期望: HTTP/1.1 200 OK（非 404）

# ark-h5 健康检查（确认不受影响）
curl http://your_server_ip/ark-h5/health
# 期望: 正常返回
```

浏览器打开 `http://your_server_ip` 即可访问完整应用。

---

## 4️⃣ 安全与端口规划

### 端口规划

| 端口 | 暴露方式 | 用途 | 外网可访问 |
|------|---------|------|-----------|
| 80 | 宿主机 Nginx | 总入口（xhs + ark-h5） | ✅ |
| 443 | 预留（绑域名后） | HTTPS | ✅ |
| 8080 | Docker → 127.0.0.1 | xhs Docker Nginx 容器 | ❌（仅本地） |
| 3001 | Docker → 127.0.0.1 | ark-h5 后端容器 | ❌（仅本地） |
| 8000 | Docker 内部网络 | xhs FastAPI 后端 | ❌ |
| 5432 | Docker 内部网络 | PostgreSQL | ❌ |

### 安全清单

- [x] 数据库端口仅 Docker 内部网络可达（未暴露到宿主机）
- [x] xhs 后端端口仅 Docker 内部网络可达（仅 Docker Nginx 可访问）
- [x] 所有应用通过宿主机 Nginx 统一入口，前后端同源
- [ ] JWT 密钥替换为强随机字符串（`openssl rand -hex 32`）
- [ ] 绑定域名 + HTTPS
- [ ] 数据库定期备份

---

## 5️⃣ HTTPS 配置（绑域名后）

> 宿主机 Nginx 作为总入口，推荐直接在宿主机上配置 SSL，或使用 Caddy 做 SSL 终止。

### 5.1 添加 DNS 记录

在域名服务商（如腾讯云 DNSPod）添加 A 记录：

```
xhs.yourdomain.com → your_server_ip
```

### 5.2 方案一：宿主机 Nginx + Certbot（推荐）

```bash
# 安装 certbot
sudo apt install -y certbot python3-certbot-nginx

# 申请证书（会自动修改 Nginx 配置）
sudo certbot --nginx -d xhs.yourdomain.com

# 验证自动续期
sudo certbot renew --dry-run
```

### 5.3 方案二：Caddy 替代宿主机 Nginx

如果不想用宿主机 Nginx，可以用 Caddy 替代（自动 HTTPS）：

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

```bash
sudo tee /etc/caddy/Caddyfile << 'EOF'
xhs.yourdomain.com {
    reverse_proxy localhost:8080
}
EOF

# 停用宿主机 Nginx，启用 Caddy
sudo systemctl stop nginx && sudo systemctl disable nginx
sudo systemctl enable caddy && sudo systemctl start caddy
```

> ⚠️ 注意：切换到 Caddy 前，需要将 ark-h5 的路由也迁移到 Caddyfile 中。

### 5.4 更新 CORS

更新 `.env.production` 中的 CORS_ORIGINS 为 HTTPS 域名：

```bash
# .env.production
CORS_ORIGINS=https://xhs.yourdomain.com,http://localhost:5173
```

然后重建：

```bash
docker compose up -d --build
```

---

## 6️⃣ 多应用扩展

当前已在同一服务器部署两个应用（xhs + ark-h5），通过宿主机 Nginx 做路由分发：

### 当前架构（路径路由）

```nginx
server {
    listen 80 default_server;

    # 应用1：小红书助手 → Docker Nginx
    location / { proxy_pass http://127.0.0.1:8080; ... }
    location /api/ { proxy_pass http://127.0.0.1:8080; ... }

    # 应用2：ark-h5 → 独立 Docker 容器
    location /ark-h5/ { ... }  # 前端静态文件 + API 代理到 3001
}
```

### 扩展第三个应用

```bash
# 1. 在 /opt/new-app/ 部署新应用，Docker 监听 127.0.0.1:PORT
# 2. 在宿主机 Nginx 配置中添加 location 块
location /new-app/ {
    proxy_pass http://127.0.0.1:PORT;
    proxy_set_header Host $host;
}
# 3. sudo nginx -t && sudo systemctl reload nginx
```

**要点**：每个应用独立目录 + 独立 docker-compose + 不同端口，可共享 PostgreSQL（不同数据库）。

---

## 7️⃣ 运维手册

### 7.1 代码更新与部署（完整流程）

```bash
cd /opt/graph_xiaohongshu

# 1. 拉取最新代码
git pull origin v1

# ⚠️ 若报 "insufficient permission"，修复 .git 目录权限：
# sudo chown -R $(whoami):$(whoami) /opt/graph_xiaohongshu/.git

# 2. 一条命令重建并重启全部服务（前端 + 后端 + Nginx）
docker compose up -d --build

# 3. 验证
docker ps
curl http://localhost/health
```

> ✅ 不再需要手动执行 `npm install`、`npm run build`、`cp dist/` 等操作。

### 7.2 容器管理

```bash
# 查看容器状态
docker ps

# 查看所有容器（含已停止）
docker ps -a

# 重启单个容器（不重新构建）
docker restart xhs-backend

# 重新构建并启动（代码有更新时使用）
cd /opt/graph_xiaohongshu
docker compose up -d --build

# 停止所有容器
docker compose down

# 停止并删除数据卷（⚠️ 会清除数据库！慎用）
# docker compose down -v

# 查看容器资源占用（CPU / 内存）
docker stats --no-stream
```

### 7.3 日志查看与排查

```bash
# ===== 后端日志 =====
docker logs xhs-backend --tail 100 -f       # 实时跟踪最近 100 行
docker logs xhs-backend --since 1h           # 最近 1 小时日志
docker logs xhs-backend 2>&1 | grep "ERROR"  # 筛选错误日志

# ===== Nginx 日志 =====
sudo tail -f /var/log/nginx/error.log        # 错误日志
sudo tail -f /var/log/nginx/access.log       # 访问日志
sudo tail -100 /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head 20  # Top IP

# ===== 数据库日志 =====
docker logs xhs-postgres --tail 50

# ===== 系统日志 =====
sudo journalctl -u docker --since "1 hour ago"  # Docker 服务日志
sudo dmesg | tail -20                           # 内核日志（OOM 等）
```

### 7.4 数据库运维

```bash
# ===== 连接数据库 =====
docker exec -it xhs-postgres psql -U postgres -d langgraph_db

# ===== 备份 =====
docker exec xhs-postgres pg_dump -U postgres langgraph_db > backup_$(date +%Y%m%d_%H%M%S).sql

# ===== 恢复（从备份文件） =====
# cat backup_20260430.sql | docker exec -i xhs-postgres psql -U postgres -d langgraph_db

# ===== 查看数据库大小 =====
docker exec xhs-postgres psql -U postgres -d langgraph_db \
  -c "SELECT pg_size_pretty(pg_database_size('langgraph_db'));"

# ===== 查看各表大小 =====
docker exec xhs-postgres psql -U postgres -d langgraph_db \
  -c "SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass)) AS size FROM pg_tables WHERE schemaname='public' ORDER BY pg_total_relation_size(tablename::regclass) DESC;"

# ===== 自动备份（crontab） =====
# crontab -e 添加：
# 0 3 * * * docker exec xhs-postgres pg_dump -U postgres langgraph_db > /opt/backups/db_$(date +\%Y\%m\%d).sql && find /opt/backups -name "db_*.sql" -mtime +7 -delete
```

### 7.5 Nginx 管理

```bash
# 查看 Nginx 容器日志
docker logs xhs-nginx --tail 50 -f

# 重启 Nginx 容器
docker restart xhs-nginx

# 查看当前 Nginx 配置文件
cat nginx/default.conf

# 修改配置后重建
docker compose up -d --build nginx
```

### 7.6 磁盘清理

```bash
# 查看磁盘使用
df -h

# 查看大目录
du -sh /opt/graph_xiaohongshu/static/images/*

# Docker 空间占用分析
docker system df

# 清理未使用的镜像、容器、网络
docker system prune -a

# 清理生成的图片（保留最近 7 天）
find /opt/graph_xiaohongshu/static/images/generated -name "*.png" -mtime +7 -delete
find /opt/graph_xiaohongshu/static/images/posters -name "*.png" -mtime +7 -delete

# 清理日志文件（保留最近 7 天）
find /opt/graph_xiaohongshu/logs -name "*.log" -mtime +7 -delete
```

### 7.7 系统监控

```bash
# 系统概览（CPU / 内存 / 负载）
htop                                         # 交互式（需安装: sudo apt install htop）
free -h                                      # 内存使用
uptime                                       # 负载平均值

# 网络连接
ss -tlnp                                     # 查看监听端口
ss -s                                        # 连接统计

# 进程资源排行
ps aux --sort=-%mem | head -10               # 内存 Top 10
ps aux --sort=-%cpu | head -10               # CPU Top 10

# API 健康检查
curl -s http://127.0.0.1:8080/health | python3 -m json.tool
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/health
```

### 7.8 服务自愈与开机自启

```bash
# Docker 已默认开机自启，确认：
sudo systemctl is-enabled docker

# 容器已配置 restart: unless-stopped，重启后自动恢复

# 手动验证重启恢复：
# sudo reboot
# （等待 1 分钟后重连）
# docker ps                   # 应看到三个容器 running
# curl http://localhost:8080/health  # 应返回 200（通过 Docker Nginx）
# curl http://localhost/health       # 应返回 200（通过宿主机 Nginx）
```

### 7.9 紧急回滚

```bash
cd /opt/graph_xiaohongshu

# 查看最近提交
git log --oneline -10

# 回滚到指定版本
# git checkout <commit-hash> .
# docker compose up -d --build    # 一条命令回滚前后端
```

---

## 8️⃣ 后续待办

| 优先级 | 事项 | 说明 |
|-------|------|------|
| 🔴 高 | 替换 JWT 密钥 | `openssl rand -hex 32` 生成强随机字符串 |
| 🔴 高 | 绑定域名 + HTTPS | `certbot --nginx`，参考第 6 节 |
| 🟡 中 | 配置 Swap | `sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| 🟡 中 | 数据库自动备份 | `crontab -e` 添加每日备份任务 |
| 🟢 低 | 监控告警 | uptime-kuma 或腾讯云自带监控 |
| 🟢 低 | CI/CD | Gitee WebHook + 自动构建部署 |

---

## 常见问题

### Q1: Docker 构建时 pip install 很慢或报错

腾讯云 PyPI 镜像可能同步延迟。解决方案：

```dockerfile
# Dockerfile 中改用阿里云镜像
RUN pip install --no-cache-dir -r requirements.txt \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --trusted-host mirrors.aliyun.com
```

### Q2: 浏览器刷新后页面 404

Docker Nginx `nginx/default.conf` 中已配置 SPA 回退（`try_files`）。如果仍出现 404，检查宿主机 Nginx 是否正确代理到 Docker Nginx：

```bash
# 直连 Docker Nginx 测试
curl -I http://127.0.0.1:8080/workflow
# 应返回 200
```

### Q3: 图片不显示（配图 1/2/3 为空白）

检查宿主机 Nginx 是否将 `/static/` 代理到 Docker Nginx：

```bash
curl -I http://127.0.0.1:8080/static/images/
# 如果返回 502，检查后端容器是否运行
docker logs xhs-backend --tail 20
```

### Q4: 后端返回 500，日志显示 `column xxx does not exist`

数据库表结构与代码不匹配。执行 2.7 步骤补齐缺失字段。

### Q5: 502 Bad Gateway

宿主机 Nginx 返回 502 通常说明 Docker Nginx 未运行或端口不匹配：

```bash
# 检查容器状态
docker ps

# 确认 Docker Nginx 监听 8080
curl http://127.0.0.1:8080/health

# 如果容器未运行，重启
docker compose up -d
```

### Q6: Vercel 方案的局限性（为什么不用 Vercel）

最初尝试过 Vercel 托管前端，但遇到两个问题：

1. **Mixed Content**：Vercel 强制 HTTPS，但后端 API 是 HTTP（IP 模式无法配 HTTPS），浏览器拦截请求
2. **Rewrites 超时**：通过 Vercel Rewrites 代理 API 请求（绕过 Mixed Content），但免费版有 **10 秒超时限制**，LLM 生成等长时间请求会失败（`ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR`）

因此最终改为 Nginx 同时服务前端和 API，前后端同源，彻底避免跨域和协议问题。

> ✅ **绑定域名 + HTTPS 后**，可以重新考虑 Vercel 方案：前端部署到 Vercel + 后端 HTTPS API 直连。

### Q7: docker compose 提示 `version` 属性过时警告

新版 Docker Compose 不再需要 `version: "3.9"`。可删除 docker-compose.yml 第一行，或忽略警告（不影响运行）。

---

*最后更新：2026-04-30*
