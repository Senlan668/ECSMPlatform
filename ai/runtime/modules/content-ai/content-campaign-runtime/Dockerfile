# ============================================================
# AI content campaign runtime - production Dockerfile
# ============================================================
# 
# Build:
#   docker build --platform linux/amd64 -t ai-content-assistant:v1.0.0 .
#
# Run locally:
#   docker run --env-file .env -p 8000:8000 ai-content-assistant:v1.0.0
#
# ============================================================

FROM python:3.13-slim

# Prefer binary Python wheels. psycopg[binary,pool] does not require
# libpq-dev or gcc, so no operating-system package layer is needed.

# ---- Working directory ----
WORKDIR /app

# ---- Install dependencies in a cacheable layer ----
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://mirrors.cloud.tencent.com/pypi/simple/ --trusted-host mirrors.cloud.tencent.com

# ---- Copy application code ----
COPY app/ ./app/
COPY scripts/ ./scripts/

# ---- Runtime directories ----
# static: generated images
# logs: application logs
RUN mkdir -p /app/static /app/logs

# ---- Environment defaults ----
# Service port
ENV PORT=8000
# Disable debug mode
ENV DEBUG=false
# Logging
ENV LOG_LEVEL=INFO
# Emit logs to stdout
ENV LOG_CONSOLE=true
ENV LOG_JSON=true

# ---- Health check ----
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT}/health')" || exit 1

# ---- Port ----
EXPOSE ${PORT}

# ---- Start command ----
# Batch task state is process-local, so use one worker until a shared
# task store is configured.
CMD uvicorn app.main:app \
    --host 0.0.0.0 \
    --port ${PORT} \
    --workers 1 \
    --log-level info
