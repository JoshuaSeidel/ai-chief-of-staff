# All-in-One Dockerfile for Unraid
# This builds both frontend and backend in a single container

FROM node:18-alpine as frontend-build

# Build frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./

# Generate app icons
RUN npm run generate-icons || echo "Icon generation failed, using placeholders"

# Build React app
RUN npm run build

# Final stage - Backend with built frontend
FROM node:18-alpine

WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy backend files
COPY backend/ ./

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
