FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY nl-parser/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared modules
COPY shared /app/shared

# Copy application files
COPY nl-parser/*.py .

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8003/health', timeout=5.0)" || exit 1

# Run service
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8003", "--workers", "1"]
