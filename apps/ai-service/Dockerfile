# syntax=docker/dockerfile:1

FROM python:3.11-slim AS runtime

ARG GIT_SHA=dev
ARG BUILD_TIME=unknown

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/app/models/cache \
    EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2 \
    GIT_SHA=$GIT_SHA \
    BUILD_TIME=$BUILD_TIME \
    PIPELINE_VERSION=2026-11-17-v3

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system jobpilot \
  && useradd --system --gid jobpilot --create-home jobpilot

WORKDIR /app

COPY apps/ai-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
  && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
  && pip install --no-cache-dir -r requirements.txt

# Pre-download the embedding model at build time to bake weights into the image
RUN mkdir -p /app/models/cache \
  && python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')" \
  && chown -R jobpilot:jobpilot /app/models

COPY apps/ai-service/app ./app

USER jobpilot
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=12 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
