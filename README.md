# MeetMatch -- Telegram Matchmaking Bot

MeetMatch is a Telegram bot that connects people based on shared interests, location proximity, and personal preferences. Users set up a profile, browse curated matches, and start conversations directly in Telegram. No apps to install, no websites to visit.

## Architecture

The application runs entirely on Cloudflare Workers, split across three independently deployed services:

- **cf-api** -- HTTP API backed by D1 and KV. Handles user profiles, match queries, preference management, and all CRUD operations. Exposes endpoints consumed by the bot and by scheduled background jobs.
- **cf-bot** -- Telegram webhook bot powered by Grammy. Receives inline commands and callback queries, calls cf-api via service bindings, and renders match results, profile cards, and menus inline.
- **cf-worker** -- Background job processor triggered by cron triggers and Cloudflare Queues. Runs periodic match scoring, notification delivery, and housekeeping tasks.

All three Workers share logic through an internal package (`cf-shared`) and communicate via Cloudflare Service Bindings. Queues handle async work that doesn't need to block a webhook response.

## Tech Stack

- **Effect TS** -- typed, composable effects for error handling, dependency injection, and structured concurrency
- **Cloudflare Workers** -- serverless compute at the edge
- **D1** -- SQLite-compatible relational database (binding: `meetsmatch-db`)
- **KV** -- low-latency key-value store (binding: `meetsmatch-kv`)
- **Queues** -- async message delivery between cf-bot and cf-worker
- **Service Bindings** -- zero-latency internal RPC between Workers
- **Grammy** -- Telegram Bot API framework
- **vitest** -- unit and integration testing

## Local Development

### Prerequisites

- Node 20+
- pnpm
- Wrangler CLI (`npm install -g wrangler`)

### Setup

```bash
pnpm install

# Copy environment template and fill in your values
cp .dev.vars.example services/cf-bot/.dev.vars
cp .dev.vars.example services/cf-worker/.dev.vars

# Apply D1 migrations locally
cd services/cf-api && npx wrangler d1 migrations apply meetsmatch-db --local
```

Minimal required env var: `BOT_TOKEN`.

### Run Services

Start all three Workers locally (each in its own terminal):

```bash
pnpm dev:api      # cf-api on port 8787
pnpm dev:bot      # cf-bot on port 8788
pnpm dev:worker   # cf-worker on port 8789
```

For local Telegram webhook testing, expose cf-bot with a tunnel (e.g. ngrok) and register the URL with Telegram's `setWebhook` API.

## Project Structure

```
services/
  cf-api/           # HTTP API Worker (D1 + KV)
    src/
      index.ts      # Entry point
      http/         # Route handlers
      models/       # Data models
      services/     # Business logic
    migrations/     # D1 SQL migrations
  cf-bot/           # Telegram webhook Worker
    src/
      index.ts      # Entry point
      handlers/     # Telegram update handlers
      menus/        # Inline keyboard menus
      services/     # Bot-specific services
  cf-worker/        # Background job Worker
    src/
      index.ts      # Entry point
      jobs/         # Cron + Queue job handlers
      notifications/ # Notification delivery logic
packages/
  cf-shared/        # Shared Effect TS schemas, services, config, and utils
docs/               # Project documentation
.github/workflows/  # CI/CD pipelines
```

## Deployment

Deploy each Worker independently:

```bash
pnpm deploy:api
pnpm deploy:bot
pnpm deploy:worker
```

Set required environment variables in the Cloudflare dashboard or via `wrangler secret put`.

## Environment Variables

| Variable                  | Required | Description                                          |
| ------------------------- | -------- | ---------------------------------------------------- |
| `BOT_TOKEN`               | Yes      | Telegram Bot API token from @BotFather               |
| `TELEGRAM_WEBHOOK_SECRET` | No       | Secret token for verifying Telegram webhook requests |
| `ADMIN_CHAT_ID`           | No       | Telegram chat ID for admin error reports             |

### Observability

Error tracking and distributed tracing are handled natively via **Cloudflare Workers OpenTelemetry export**. No SDK bundling or env vars required.

To connect to Sentry, Honeycomb, Datadog, or any OTLP backend:

1. Go to **Cloudflare Dashboard → Workers & Pages → Observability**
2. Add a destination (traces + logs) with your provider's OTLP endpoint
3. Uncomment the `destinations` arrays in each service's `wrangler.toml`
4. Redeploy

See [Cloudflare OTel docs](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/) for provider-specific endpoints.

## Testing

```bash
pnpm test          # Run the full test suite with vitest
pnpm lint          # Type-check the entire monorepo (tsc --build --force)
```
