# Backend Dockerfile for Microservices Architecture
FROM node:20-alpine

WORKDIR /app

# Update Alpine packages and install Python3 and build tools needed for native modules (sqlite3)
RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache \
    python3 \
    make \
    g++ \
    && ln -sf python3 /usr/bin/python

# Set Python environment variable for node-gyp
ENV PYTHON=/usr/bin/python3

# Install backend dependencies
COPY package*.json ./
RUN npm install --production

# Copy backend files
COPY . .

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

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]

