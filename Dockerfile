# syntax=docker/dockerfile:1
# Dockerfile for MeetsMatch Telegram Bot
# Used by Coolify for deployment

FROM oven/bun:1 AS base
WORKDIR /app

# Install buf for protobuf generation
RUN apt-get update && apt-get install -y curl && \
    curl -sSL "https://github.com/bufbuild/buf/releases/download/v1.47.2/buf-Linux-x86_64" -o /usr/local/bin/buf && \
    chmod +x /usr/local/bin/buf && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy the entire project to handle local dependencies
COPY . .

# Generate protobuf files
RUN buf generate

# Install dependencies for contracts package
WORKDIR /app/packages/contracts
RUN bun install

# Install dependencies for the bot service
WORKDIR /app/services/bot
RUN bun install --frozen-lockfile

# Final Stage
FROM oven/bun:1-alpine
WORKDIR /app

# Copy bot service with its dependencies
COPY --from=base /app/services/bot /app/services/bot
COPY --from=base /app/packages /app/packages

WORKDIR /app/services/bot
ENV NODE_ENV=production

# Health check for container orchestration
# Use 127.0.0.1 instead of localhost to avoid IPv6 resolution issues in Alpine
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

EXPOSE 3000

CMD ["bun", "run", "start"]
