# Frontend Dockerfile for Microservices Architecture (Vite Build)
FROM node:20-alpine AS build

# Update Alpine packages for security patches
RUN apk update && apk upgrade --no-cache

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Get version and commit hash for build-time injection
ARG VERSION=1.0.0
ARG COMMIT_HASH=unknown
ARG BUILD_DATE
ENV VERSION=$VERSION
ENV COMMIT_HASH=$COMMIT_HASH
ENV BUILD_DATE=$BUILD_DATE

# Build with Vite (prebuild script will inject version)
# VITE_API_URL can be set at build time if needed
RUN npm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Copy built app to nginx
COPY --from=build /app/build /usr/share/nginx/html

# Copy nginx configuration for API proxying
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 3000

# Health check (install wget for health checks)
RUN apk add --no-cache wget

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

