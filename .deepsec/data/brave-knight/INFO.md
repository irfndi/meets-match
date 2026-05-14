# brave-knight (MeetMatch)

## What this codebase does

Telegram matchmaking bot. Three services: **Go API** (Fiber HTTP + gRPC, PostgreSQL, Redis), **TypeScript/Bun Bot** (grammy framework), **Go Worker** (Redis-backed job scheduler for re-engagement + DLQ). Services communicate via gRPC. Protobuf contracts in `packages/contracts/`. Sentry for error tracking across all services.

## Auth shape

- **No traditional auth middleware** — user identity derives from Telegram's built-in token auth (`BOT_TOKEN` env var)
- `loadConfig()` in `services/bot/src/lib/config.ts` validates `BOT_TOKEN` at startup; supports `TELEGRAM_TOKEN` fallback
- gRPC between services (API↔Bot↔Worker) has **no auth** — assumed internal/trusted network
- HTTP health endpoints (`/health`, `/`) are intentionally public
- `createHealthServer()` exposes port 3000 (bot) / 8080 (api) for container health checks

## Threat model

1. **User data exposure** — profiles contain personal info (age, gender, bio, location, interests). Match data links users. IDOR on match/profile viewing could leak private data.
2. **Telegram token compromise** — the bot token is the key to all bot functionality. Exposure (logs, env, git) = attacker controls the bot.
3. **Service impersonation** — gRPC has no auth. If an attacker reaches the internal network, they can call any gRPC method.
4. **PII in error tracking** — Sentry captures full error context, which could include user data.

## Project-specific patterns to flag

- `BOT_TOKEN` / `TELEGRAM_TOKEN` in `loadConfig()` — check for hardcoded/committed tokens
- `DATABASE_URL` / `REDIS_URL` passed as raw env vars — connection strings in config
- `sentrypkg.Init()` / `initSentry()` — error tracking may log PII (user chat data, profile fields)
- `activityTrackerMiddleware` — fire-and-forget user tracking, check for data leakage
- `markdown.ts` / `escapeMarkdownV2()` — user input rendered in Telegram messages, XSS via markdown injection

## Known false-positives

- `/health` and `/` endpoints intentionally public (no auth)
- gRPC inter-service calls intentionally unauth'd (internal network)
- `config.ts` / `config.go` env var loading — deliberate, no hardcoded secrets
- `botToken` read from `process.env` — standard 12-factor pattern, not hardcoded
