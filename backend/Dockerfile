# Production Dockerfile (reproducible + Docker-safe)
#
# Financial System Design Decisions:
# - **No host `node_modules/`**: Containers must build from declared deps only.
#   Copying host `node_modules/` causes environment drift (OS/CPU/Node ABI differences),
#   which is unacceptable for high-integrity financial backends.
# - **Layer caching strategy**: Copy `package*.json` first, install deps, then copy source.
#   This makes rebuilds deterministic and fast: code changes do not invalidate dependency layers.
# - **Non-root runtime**: Reduces blast radius if the process is compromised.

FROM node:18-alpine AS deps
WORKDIR /app

# Install dependencies inside the container based on the lockfile.
# This enforces reproducible builds across CI/Docker machines.
COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

FROM node:18-alpine

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
