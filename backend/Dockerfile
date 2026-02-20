# Multi-stage Dockerfile for production-grade Node.js application
# 
# Financial System Design Decisions:
# 1. Multi-stage Build: Reduces final image size
#    - Smaller images = faster deployments
#    - Better security (fewer layers)
#    - Lower resource usage
# 
# 2. Alpine Linux: Lightweight base image
#    - Smaller attack surface
#    - Faster image pulls
#    - Sufficient for Node.js applications
# 
# 3. Non-root User: Runs as non-root for security
#    - Reduces impact of security vulnerabilities
#    - Best practice for production containers
# 
# 4. Layer Caching: Optimized layer ordering
#    - Dependencies copied before code
#    - Faster rebuilds when only code changes
# 
# 5. Health Check: Built-in health check
#    - Allows Docker/Kubernetes to monitor container health
#    - Critical for production deployments

# Stage 1: Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production stage
FROM node:18-alpine

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy dependencies from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "server.js"]
