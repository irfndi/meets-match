# syntax=docker/dockerfile:1
# Dockerfile for MeetsMatch Telegram Bot
# Used by Coolify for deployment

FROM oven/bun:1@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS base
WORKDIR /app

# Install buf for protobuf generation with checksum verification
ARG BUF_VERSION=1.47.2
ARG BUF_CHECKSUM=3a0c4da8d46eea8136affa63db202c76a44f8112384160b73c3fffb1cf14b5d8
RUN apt-get update && apt-get install -y curl && \
    curl -sSL "https://github.com/bufbuild/buf/releases/download/v${BUF_VERSION}/buf-Linux-x86_64" -o /usr/local/bin/buf && \
    echo "${BUF_CHECKSUM}  /usr/local/bin/buf" | sha256sum -c - && \
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

# Final Stage - Use slim debian variant to avoid musl/glibc segfaults with Bun
FROM oven/bun:1-slim@sha256:d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04
WORKDIR /app

# Install curl for health checks (wget not available in debian-slim)
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy bot service with its dependencies
COPY --from=base /app/services/bot /app/services/bot
COPY --from=base /app/packages /app/packages

WORKDIR /app/services/bot
ENV NODE_ENV=production

# Health check for container orchestration
# Increased start-period for initial startup (buf generate, npm install, etc.)
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=5 \
  CMD curl -f http://127.0.0.1:3000/health || exit 1

EXPOSE 3000

# Run as non-root user for security (bun user exists in oven/bun images)
USER bun

CMD ["bun", "run", "start"]
