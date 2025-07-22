# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./

# Copy package files for all workspaces
COPY packages/common/package.json ./packages/common/
COPY apps/api/package.json ./apps/api/

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/common ./packages/common/
COPY apps/api ./apps/api/

# Build common package first
WORKDIR /app/packages/common
RUN pnpm build

# Build API
WORKDIR /app/apps/api

# Generate Prisma client before building
RUN pnpm db:generate

# Now build the TypeScript code
RUN pnpm build

# Production stage
FROM node:18-alpine AS production

WORKDIR /app

# Install OpenSSL and pnpm
RUN apk add --no-cache openssl
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY packages/common/package.json ./packages/common/
COPY apps/api/package.json ./apps/api/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Install Prisma CLI and tsx for generating client and seeding
RUN npm install -g prisma@^5.8.1 tsx@^4.7.0

# Copy built application
COPY --from=builder /app/packages/common/dist ./packages/common/dist/
COPY --from=builder /app/packages/common/package.json ./packages/common/
COPY --from=builder /app/apps/api/dist ./apps/api/dist/
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma/

# Set working directory to API
WORKDIR /app/apps/api

# Generate Prisma client in production stage
RUN pnpm db:generate

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["pnpm", "start"]