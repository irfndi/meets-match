# syntax=docker/dockerfile:1

FROM oven/bun:1 AS base
WORKDIR /app

# Copy the entire project to handle potential local dependencies
COPY . .

# Install dependencies
WORKDIR /app/services/bot
RUN bun install

# Build (if necessary, though bun can run ts directly)
# RUN bun run build

# Final Stage
FROM oven/bun:1-alpine
WORKDIR /app

COPY --from=base /app/services/bot /app/services/bot
COPY --from=base /app/packages /app/packages

WORKDIR /app/services/bot
ENV NODE_ENV=production

CMD ["bun", "run", "start"]
