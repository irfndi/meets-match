# syntax=docker/dockerfile:1
# Dockerfile for MeetsMatch Telegram Bot
# Used by Coolify for deployment

FROM oven/bun:1 AS base
WORKDIR /app

# Copy the entire project to handle local dependencies
COPY . .

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

# Health check endpoint (bot exposes HTTP health on port 3000)
EXPOSE 3000

CMD ["bun", "run", "start"]
