# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./

# Copy package files for all workspaces
COPY packages/common/package.json ./packages/common/
COPY apps/web/package.json ./apps/web/

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/common ./packages/common/
COPY apps/web ./apps/web/

# Build common package first
WORKDIR /app/packages/common
RUN pnpm build

# Build web app
WORKDIR /app/apps/web
RUN pnpm build

# Production stage
FROM nginx:alpine AS production

# Copy built assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY apps/web/nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]