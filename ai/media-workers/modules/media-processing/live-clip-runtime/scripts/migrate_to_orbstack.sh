#!/bin/bash
# ============================================================
# ai-slice: 从 Docker Desktop 迁移 PostgreSQL 数据到 OrbStack
# ============================================================
set -e

DUMP_FILE="$(cd "$(dirname "$0")/.." && pwd)/ai_slice_backup.sql"
DB_NAME="ai_slice"
DB_USER="slice"
DB_PASS="slice_dev"
DOCKER_CMD="/usr/local/bin/docker"
COMPOSE_FILE="$(cd "$(dirname "$0")/.." && pwd)/docker-compose.yml"

echo "=========================================="
echo "  ai-slice 数据迁移: Docker Desktop → OrbStack"
echo "=========================================="
echo ""

# ------ 第 1 步：从 Docker Desktop 导出数据 ------
echo "[1/5] 确认 Docker Desktop 上下文..."
$DOCKER_CMD context use desktop-linux 2>/dev/null || $DOCKER_CMD context use default 2>/dev/null || true

OLD_CONTAINER="ai-slice-postgres-1"
echo "   目标容器: $OLD_CONTAINER"

echo ""
echo "[2/5] 启动旧容器并导出数据..."
$DOCKER_CMD start "$OLD_CONTAINER" 2>/dev/null || true
sleep 3

echo "   等待数据库就绪..."
for i in $(seq 1 15); do
    if $DOCKER_CMD exec "$OLD_CONTAINER" pg_isready -U $DB_USER -d $DB_NAME 2>/dev/null; then
        break
    fi
    echo "   等待中... ($i/15)"
    sleep 2
done

echo "   执行 pg_dump..."
$DOCKER_CMD exec "$OLD_CONTAINER" pg_dump -U $DB_USER -d $DB_NAME --clean --if-exists > "$DUMP_FILE"
DUMP_SIZE=$(ls -lh "$DUMP_FILE" | awk '{print $5}')
echo "   ✅ 导出完成: $DUMP_FILE ($DUMP_SIZE)"

echo ""
echo "[3/5] 停止 Docker Desktop 旧容器..."
$DOCKER_CMD stop "$OLD_CONTAINER" 2>/dev/null || true

# ------ 第 2 步：切换到 OrbStack 并导入 ------
echo ""
echo "[4/5] 切换到 OrbStack 上下文..."
$DOCKER_CMD context use orbstack 2>/dev/null

echo "   启动 OrbStack 服务..."
$DOCKER_CMD compose -f "$COMPOSE_FILE" up -d
sleep 3

echo "   等待新数据库就绪..."
NEW_CONTAINER=$($DOCKER_CMD compose -f "$COMPOSE_FILE" ps --format '{{.Name}}' | grep postgres | head -1)
echo "   新容器: $NEW_CONTAINER"

for i in $(seq 1 15); do
    if $DOCKER_CMD exec "$NEW_CONTAINER" pg_isready -U $DB_USER -d $DB_NAME 2>/dev/null; then
        break
    fi
    echo "   等待中... ($i/15)"
    sleep 2
done

echo ""
echo "[5/5] 导入数据到 OrbStack..."
$DOCKER_CMD exec -i "$NEW_CONTAINER" psql -U $DB_USER -d $DB_NAME < "$DUMP_FILE"
echo "   ✅ 数据导入完成!"

# 验证
echo ""
echo "   验证数据..."
$DOCKER_CMD exec "$NEW_CONTAINER" psql -U $DB_USER -d $DB_NAME -c "\dt" 2>/dev/null
echo ""

# 显示最终状态
$DOCKER_CMD compose -f "$COMPOSE_FILE" ps

echo ""
echo "=========================================="
echo "  ✅ ai-slice 迁移完成！"
echo "  备份文件: $DUMP_FILE"
echo "  当前上下文: orbstack"
echo "  可以关闭 Docker Desktop 了"
echo "=========================================="
