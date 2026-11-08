# RevertLens Production Containerfile
# Single multi-stage container build for Node 22 LTS

FROM node:22-alpine AS builder
WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy source files
COPY tsconfig*.json vite.config.ts index.html ./
COPY src ./src

# Build server and client
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/revertlens.sqlite

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled artifacts from builder stage
COPY --from=builder /app/dist ./dist

# Create persistent data volume mountpoint
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/server/index.js"]
