FROM python:3.11-slim

WORKDIR /app

# Install OpenSSL and bash for certificate generation
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    bash \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY pattern-recognition/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared modules
COPY shared /app/shared

# Copy application files
COPY pattern-recognition/*.py .

# Copy certificate generation script
COPY pattern-recognition/generate-service-cert.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/generate-service-cert.sh

# Health check (HTTPS)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider --no-check-certificate https://localhost:8002/health || exit 1

# Expose port
EXPOSE 8002

# Generate certificates and run service
CMD ["/bin/bash", "-c", "generate-service-cert.sh aicos-pattern-recognition && uvicorn main:app --host 0.0.0.0 --port 8002 --ssl-keyfile /app/certs/aicos-pattern-recognition.key --ssl-certfile /app/certs/aicos-pattern-recognition.crt --workers 2"]
