# ============================================================
# Nginx + 前端构建 — 多阶段 Dockerfile
# ============================================================
#
# Stage 1: 使用 Node.js 构建前端
# Stage 2: 将构建产物放入 Nginx 镜像
#
# 使用方法（由 docker-compose 自动调用）：
#   docker compose up -d --build
#
# ============================================================

# ===== Stage 1: 构建前端 =====
FROM node:20-alpine AS builder

WORKDIR /build

# 先拷贝依赖清单，利用 Docker 缓存层
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com

# 拷贝前端源码
COPY frontend/ ./

# 构建（VITE_API_BASE_URL 留空，走相对路径）
ENV VITE_API_BASE_URL=
RUN npm run build

# ===== Stage 2: Nginx 运行时 =====
FROM nginx:alpine

# 拷贝构建产物
COPY --from=builder /build/dist /usr/share/nginx/html

# 拷贝 Nginx 配置
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# 删除默认配置，避免冲突
RUN rm -f /etc/nginx/conf.d/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
