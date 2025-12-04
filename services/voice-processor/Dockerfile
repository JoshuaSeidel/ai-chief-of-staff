FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for audio processing and TLS
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    openssl \
    bash \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies
COPY voice-processor/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared modules
COPY shared /app/shared

# Copy application files
COPY voice-processor/*.py .

# Copy certificate generation script
COPY voice-processor/generate-service-cert.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/generate-service-cert.sh

# Health check (HTTPS)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider --no-check-certificate https://localhost:8004/health || exit 1

# Expose port
EXPOSE 8004

# Generate certificates and run service
CMD ["/bin/bash", "-c", "generate-service-cert.sh aicos-voice-processor && uvicorn main:app --host 0.0.0.0 --port 8004 --ssl-keyfile /app/certs/aicos-voice-processor.key --ssl-certfile /app/certs/aicos-voice-processor.crt --workers 2"]
