# MeetMatch -- Telegram Matchmaking Bot

MeetMatch is a Telegram bot that connects people based on shared interests, location proximity, and personal preferences. Users set up a profile, browse curated matches, and start conversations directly in Telegram. No apps to install, no websites to visit.

## Architecture

The application runs entirely on Cloudflare Workers, split across three independently deployed services:

- **cf-api** -- HTTP API backed by D1 and KV. Handles user profiles, match queries, preference management, and all CRUD operations. Exposes endpoints consumed by the bot and by scheduled background jobs.
- **cf-bot** -- Telegram webhook bot powered by Grammy. Receives inline commands and callback queries, calls cf-api via service bindings, and renders match results, profile cards, and menus inline.
- **cf-worker** -- Background job processor triggered by cron triggers and Cloudflare Queues. Runs periodic match scoring, notification delivery, and housekeeping tasks.
- **cf-tail** -- Tail consumer that writes execution traces to Analytics Engine.

All services share logic through an internal package (`cf-shared`) and communicate via Cloudflare Service Bindings. Queues handle async work that doesn't need to block a webhook response.

## Tech Stack

- **Effect TS v4** -- typed, composable effects for error handling, dependency injection, and structured concurrency
- **Alchemy** -- Infrastructure-as-Effects: `alchemy.run.ts` declares the Workers and every Cloudflare resource (D1, KV, R2, Queues, Analytics Engine) as one typed stack. Deploys replace the old per-service `wrangler.toml` flow.
- **Cloudflare Workers** -- serverless compute at the edge
- **D1** -- SQLite-compatible relational database (`meetsmatch` / `meetsmatch-dev`)
- **KV** -- low-latency key-value store
- **Queues** -- async message delivery (`notification-queue` + `dlq`)
- **Service Bindings** -- zero-latency internal RPC between Workers
- **Grammy** -- Telegram Bot API framework
- **oxlint + oxfmt** -- linting and formatting (with `effect-tsgo`-patched type-aware linting)
- **vitest** -- unit and integration testing

## Local Development

### Prerequisites

- Node 20+
- pnpm
- A Cloudflare account with Workers/D1/KV/R2/Queues access

### Setup

```bash
pnpm install

# Copy environment template and fill in your values
cp .env.example .env
```

Minimal required env var: `BOT_TOKEN` (and `TELEGRAM_WEBHOOK_SECRET` for webhook verification).

### Run Services

```bash
pnpm dev          # alchemy dev — runs all Workers locally with hot reloading
```

For local Telegram webhook testing, expose cf-bot with a tunnel (e.g. ngrok) and register the URL with Telegram's `setWebhook` API.

## Project Structure

```
alchemy.run.ts    # Infrastructure-as-Effects stack (Workers + resources + bindings)
services/
  cf-api/           # HTTP API Worker (D1 + KV)
    src/
      index.ts      # Entry point
      http/         # Route handlers
      models/       # Data models
      services/     # Business logic
    migrations/     # D1 SQL migrations (applied automatically on alchemy deploy)
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

Deployment is driven by alchemy — one command deploys the whole stack (builds Workers, applies D1 migrations, uploads bindings):

```bash
pnpm plan          # Preview prod changes (no apply)
pnpm deploy:dev    # Deploy dev stage
pnpm deploy:prod   # Deploy prod stage (adopts existing resources: --adopt)
```

First prod deploy adopts the pre-existing cloud resources (D1 `meetsmatch`, R2 `meetsmatch-media`, queues `notification-queue`/`dlq`, Analytics Engine datasets) — run `pnpm plan` first to review, then `pnpm deploy:prod`.

KV namespaces are NOT adopted (their titles are ambiguous): fresh namespaces are created per stage. KV only holds cache/session data, which is disposable. Delete the old namespaces from the Cloudflare dashboard once the new ones are confirmed working.

Secrets (`BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `API_SECRET`) are read from the environment at deploy time and bound as `secret_text`. In CI they come from GitHub Actions secrets.

`services/cf-api/wrangler.toml` is kept solely for D1 dev tooling (`wrangler d1 execute` in `scripts/seed-dev-db.ts` and `make db-check`) — deploys go through alchemy.

## Environment Variables

| Variable                  | Required | Description                                          |
| ------------------------- | -------- | ---------------------------------------------------- |
| `BOT_TOKEN`               | Yes      | Telegram Bot API token from @BotFather               |
| `TELEGRAM_WEBHOOK_SECRET` | No       | Secret token for verifying Telegram webhook requests |
| `API_SECRET`              | No       | Shared secret for internal API routes                |
| `ADMIN_CHAT_ID`           | No       | Telegram chat ID for admin error reports (dev stage) |
| `ENVIRONMENT`             | No       | `development` / `production` (default: per stage)    |
| `CLOUDFLARE_ACCOUNT_ID`   | CI       | Cloudflare account ID for `alchemy deploy`           |
| `CLOUDFLARE_API_TOKEN`    | CI       | Cloudflare API token for `alchemy deploy`            |

### Observability

Error tracking and distributed tracing are handled natively via **Cloudflare Workers OpenTelemetry export**. No SDK bundling or env vars required.

To connect to Sentry, Honeycomb, Datadog, or any OTLP backend:

1. Go to **Cloudflare Dashboard → Workers & Pages → Observability**
2. Add a destination (traces + logs) with your provider's OTLP endpoint
3. Configure the destination in `alchemy.run.ts` (`Cloudflare.Worker` observability props)
4. Redeploy

See [Cloudflare OTel docs](https://developers.cloudflare.com/workers/observability/exporting-opentelemetry-data/) for provider-specific endpoints.

## Testing

```bash
pnpm test          # Run the full test suite with vitest
pnpm lint          # Lint with oxlint (type-aware via effect-tsgo)
pnpm format        # Format with oxfmt
pnpm typecheck:fast   # Fast type check with tsgo (per project)
pnpm typecheck:safe   # Full type check (tsc --build --force)
```
