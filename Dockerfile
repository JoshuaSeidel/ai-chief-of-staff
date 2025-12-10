# All-in-One Dockerfile for Unraid
# This builds both frontend and backend in a single container

FROM node:20-alpine AS frontend-build

# Note: Skipping 'apk upgrade' due to QEMU emulation issues on ARM64 cross-compilation
# Security patches are handled by using recent base images

# Build frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./

# Get version and commit hash for build-time injection
ARG VERSION=1.0.0
ARG COMMIT_HASH=unknown
ARG BUILD_DATE
ENV VERSION=$VERSION
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_DATE=$BUILD_DATE

# Note: Icons should be generated manually using create-icons.html in browser
# or by running generate-icons.js locally with canvas installed
# This keeps the Docker image lightweight without Python/build dependencies

# Build React app (prebuild script will inject version into service-worker.js)
RUN npm run build

# Final stage - Backend with built frontend
FROM node:20-alpine

WORKDIR /app

# Install Python3 and build tools needed for native modules (sqlite3)
# Note: --no-scripts avoids post-install scripts that fail under QEMU ARM64 emulation
RUN apk add --no-cache --no-scripts \
    python3 \
    py3-setuptools \
    make \
    g++ \
    && ln -sf python3 /usr/bin/python

# Set Python environment variable for node-gyp
ENV PYTHON=/usr/bin/python3

# Install backend dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy backend files
COPY backend/ ./

# Get version and commit hash from build args
ARG VERSION=1.0.0
ARG COMMIT_HASH=unknown
ARG BUILD_DATE
ENV VERSION=$VERSION
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_DATE=$BUILD_DATE

# Copy frontend package.json so backend can read frontend version at runtime
COPY frontend/package.json ./frontend-package.json

# Copy built frontend to backend's public directory
RUN mkdir -p /app/public
COPY --from=frontend-build /app/frontend/build /app/public

# Create necessary directories
RUN mkdir -p /app/uploads /app/data

# Set environment variables
ENV NODE_ENV=production
ENV CONFIG_DIR=/app/data

# Volume for persistent data
VOLUME ["/app/data"]

# Expose ports
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]
