FROM python:3.11-slim

WORKDIR /app

# Install uv for fast dependency resolution
RUN pip install --no-cache-dir uv

# Copy dependencies and application source from build context (repo root)
COPY backend/pyproject.toml ./
COPY backend/src/ ./src/
COPY data/ ./data/

# Install dependencies into system Python
RUN uv pip install --system --no-cache -e .

EXPOSE 8000

ENV SNAPSHOT_DIR=/app/data/snapshot
ENV PORT=8000

HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request, os; port = os.environ.get('PORT', '8000'); urllib.request.urlopen(f'http://127.0.0.1:{port}/health/ready')"

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
