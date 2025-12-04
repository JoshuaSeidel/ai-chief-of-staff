FROM python:3.11-slim

WORKDIR /app

# Install OpenSSL and bash for certificate generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    bash \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY ai-intelligence/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared modules
COPY shared /app/shared

# Copy application files
COPY ai-intelligence/*.py .

# Copy certificate generation script
COPY ai-intelligence/generate-service-cert.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/generate-service-cert.sh

# Health check (HTTPS)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider --no-check-certificate https://localhost:8001/health || exit 1

# Expose port
EXPOSE 8001

# Generate certificates and run service
CMD ["/bin/bash", "-c", "generate-service-cert.sh aicos-ai-intelligence && uvicorn main:app --host 0.0.0.0 --port 8001 --ssl-keyfile /app/certs/aicos-ai-intelligence.key --ssl-certfile /app/certs/aicos-ai-intelligence.crt --workers 2"]
