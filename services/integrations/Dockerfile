FROM node:20-alpine

# Install OpenSSL for certificate generation
# Note: --no-scripts avoids post-install scripts that fail under QEMU ARM64 emulation
RUN apk add --no-cache --no-scripts openssl bash

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Copy certificate generation script (must be in build context)
COPY generate-service-cert.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/generate-service-cert.sh

# Health check (HTTPS)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider --no-check-certificate https://localhost:8006/health || exit 1

# Expose port
EXPOSE 8006

# Generate certificates and run service
CMD ["/bin/bash", "-c", "generate-service-cert.sh aicos-integrations && node server.js"]
