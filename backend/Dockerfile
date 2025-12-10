# Backend Dockerfile for Microservices Architecture
FROM node:20-alpine

WORKDIR /app

# Install build dependencies for sqlite3 (native module) and runtime deps
# Note: --no-scripts avoids post-install scripts that fail under QEMU ARM64 emulation
RUN apk add --no-cache --no-scripts \
    python3 \
    make \
    g++ \
    openssl \
    bash \
    curl \
    && ln -sf python3 /usr/bin/python

# Set Python environment variable for node-gyp
ENV PYTHON=/usr/bin/python3

# Install backend dependencies
COPY package*.json ./
RUN npm install --production --omit=dev

# Copy backend files
COPY . .

# Copy certificate generation script (must be in build context)
COPY generate-service-cert.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/generate-service-cert.sh

# Get version and commit hash from build args
ARG VERSION=1.0.0
ARG COMMIT_HASH=unknown
ARG BUILD_DATE
ENV VERSION=$VERSION
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_DATE=$BUILD_DATE

# Create necessary directories
RUN mkdir -p /app/uploads /app/data

# Set environment variables
ENV NODE_ENV=production
ENV CONFIG_DIR=/app/data
ENV PORT=3001

# Volume for persistent data
VOLUME ["/app/data"]

# Expose ports
EXPOSE 3001

# Health check (still HTTP for backend as it handles external traffic)
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Generate certificates and start the application
CMD ["/bin/bash", "-c", "generate-service-cert.sh aicos-backend && node server.js"]

