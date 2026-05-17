# MeetMatch — Agent Development Guide

> This file is the single source of truth for AI coding agents working on the MeetMatch codebase. If you modify build steps, testing strategies, or deployment processes, update this file.

## Project Overview

MeetMatch is a Telegram matchmaking bot that connects people based on shared interests, location proximity, and personal preferences. Users set up a profile, browse curated matches, and start conversations directly in Telegram.

The entire application runs on **Cloudflare Workers** as three independently deployed services that communicate via **Service Bindings** (zero-latency internal RPC) and **Queues** (async work).

## Architecture & Runtime

```
┌─────────────┐     Service Binding      ┌─────────────┐
│   cf-bot    │ ◄──────────────────────► │   cf-api    │
│  (Grammy)   │                        │  (D1 + KV)  │
└──────┬──────┘                        └──────┬──────┘
       │                                      │
       │ Queue (notification-queue)           │ R2 (media)
       ▼                                      ▼
┌─────────────┐                        ┌─────────────┐
│  cf-worker  │ ◄── Service Binding ──►│   D1 / KV   │
│ (cron/jobs) │                        │  (bindings) │
└─────────────┘                        └─────────────┘
```

- **cf-api** — HTTP API Worker. Handles user profiles, match queries, preference management, and all CRUD operations. Backed by D1 (SQLite) and KV. Exposes endpoints consumed by the bot and scheduled background jobs.
- **cf-bot** — Telegram webhook bot powered by [Grammy](https://grammy.dev/). Receives inline commands and callback queries, calls cf-api via service bindings, and renders match results, profile cards, and menus inline.
- **cf-worker** — Background job processor triggered by cron triggers and Cloudflare Queues. Runs periodic match scoring, notification delivery, re-engagement, birthday messages, subscription expiry checks, and housekeeping tasks.
- **cf-shared** — Internal shared package containing Effect TS schemas, API contracts, error types, structured logging utilities, test helpers, and media URL helpers.

### Cloudflare Platform Resources

| Resource | Binding | Purpose |
|----------|---------|---------|
| D1 Database | `DB` | SQLite-compatible relational data (users, matches, notifications, reports, feedback) |
| KV Namespace | `KV` | Session caching, conversation state, geocoding cache |
| Queue | `NOTIFICATION_QUEUE` | Async notification delivery (cf-api produces, cf-worker consumes) |
| R2 Bucket | `MEDIA_BUCKET` | Profile photos and videos |
| Service Bindings | `API_SERVICE`, `BOT_SERVICE` | Zero-latency RPC between Workers |

## Technology Stack

- **Runtime**: Cloudflare Workers (`compatibility_date = "2026-05-01"`, `nodejs_compat` flag)
- **Language**: TypeScript 6.0.3, ES2024 target, ES2022 modules, `"type": "module"`
- **Package Manager**: pnpm 11.1.2 (workspaces enabled)
- **Monorepo**: pnpm workspaces (`packages/*`, `services/cf-*`)
- **FP Framework**: [Effect TS](https://effect.website/) (^3.21.2) — used for typed error handling, schemas, and composable effects in cf-api models
- **Bot Framework**: [Grammy](https://grammy.dev/) (^1.42.0) with `@grammyjs/conversations` and `@grammyjs/menu`
- **HTTP Routing**: Custom request router in cf-api (no external framework)
- **Database**: Cloudflare D1 (SQLite) with raw SQL via `D1Database.prepare()`
- **Testing**: Vitest (^4.1.6) with `@vitest/coverage-v8`, `fast-check` for property-based tests
- **Build**: TypeScript compiler (`tsc`) only — no bundler
- **Dev Server**: Wrangler CLI (`wrangler dev`)
- **Formatting**: Prettier
- **Version Generation**: Custom `scripts/generate-version.ts` (git tag or short hash)

## Project Structure

```
.
├── package.json              # Root monorepo manifest
├── pnpm-workspace.yaml       # Workspace definitions
├── tsconfig.json             # Root TS project references (composite: true)
├── vitest.config.ts          # Shared vitest config (coverage thresholds: 60%)
├── Makefile                  # Common dev tasks (dev, test, lint, deploy, db-check)
├── scripts/
│   ├── generate-version.ts   # Auto-generates src/lib/version.ts per service
│   ├── setup-bot-commands.ts # Registers commands with BotFather
│   └── seed-dev-db.ts        # Seeds D1 with synthetic test users
├── packages/
│   └── cf-shared/
│       ├── src/
│       │   ├── contracts/    # Effect Schema API contracts (user, match, notification, health)
│       │   ├── errors.ts     # NotFoundError, ValidationError, DatabaseError, AppError
│       │   ├── structured-log.ts  # JSON structured logger (createLogger)
│       │   ├── media.ts      # R2 media key/url helpers
│       │   ├── config.ts     # Effect Config layer
│       │   ├── version.ts    # VersionInfo type + formatDuration
│       │   └── testing/      # Mock D1/KV/R2/Queue helpers + runEffect test util
│       └── tsconfig.json
├── services/
│   ├── cf-api/
│   │   ├── src/
│   │   │   ├── index.ts      # Worker fetch handler entry point
│   │   │   ├── http/router.ts # Route dispatch + request handlers
│   │   │   ├── models/       # D1 repositories (Effect.tryPromise wrappers)
│   │   │   ├── services/     # Business logic layers
│   │   │   └── lib/version.ts # Auto-generated version metadata
│   │   ├── migrations/       # D1 SQL migrations (0001_init.sql … 0021_add_cf_metadata.sql)
│   │   ├── wrangler.toml     # Worker config (D1, KV, R2, Queue bindings)
│   │   └── package.json
│   ├── cf-bot/
│   │   ├── src/
│   │   │   ├── index.ts      # Worker fetch + webhook handler, bot setup
│   │   │   ├── handlers/     # Command & callback handlers (start, profile, match, …)
│   │   │   ├── menus/        # Inline keyboard menus
│   │   │   ├── lib/          # Conversations, i18n, notifications, activity tracking
│   │   │   └── services/     # ApiServiceClient (service binding RPC wrapper)
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── cf-worker/
│       ├── src/
│       │   ├── index.ts      # Worker fetch + queue + scheduled handlers
│       │   ├── jobs/         # Cron job implementations (reengagement, cleanup, birthday, DLQ, subscription expiry)
│       │   ├── notifications/ # Queue consumer logic
│       │   └── services/     # ApiServiceClient
│       ├── wrangler.toml
│       └── package.json
```

## Build and Test Commands

All commands run from the repository root unless noted.

```bash
# Install dependencies
pnpm install

# Development (run each in its own terminal)
pnpm dev:api      # cf-api on port 8787
pnpm dev:bot      # cf-bot on port 8788
pnpm dev:worker   # cf-worker on port 8789

# Or use Make
make dev          # Runs all three in parallel (background processes)
make dev-api
make dev-bot
make dev-worker

# Testing
pnpm test         # Run full vitest suite across monorepo
make test

# Type checking
pnpm lint         # tsc --build --force (safe but slow)
pnpm typecheck:fast   # tsgo --noEmit (fast experimental checker)
pnpm typecheck:safe   # tsc --build --force
make lint

# Formatting
pnpm format       # Prettier write all TS/JSON/MD
make format

# Deployment
pnpm deploy:api
pnpm deploy:bot
pnpm deploy:worker
# Or
make deploy       # Deploys all three sequentially
make deploy-api
make deploy-bot
make deploy-worker

# Database
make db-check     # Verify local D1 connectivity

# Clean
make clean        # Remove node_modules, dist, .wrangler
```

### Pre-Dev Setup

1. `cp .dev.vars.example services/cf-bot/.dev.vars` and fill in `BOT_TOKEN`.
2. Apply D1 migrations locally:
   ```bash
   cd services/cf-api && pnpm exec wrangler d1 migrations apply meetsmatch-db --local
   ```
3. Register bot commands (one-time or after changes):
   ```bash
   BOT_TOKEN=<token> pnpm exec tsx scripts/setup-bot-commands.ts
   ```

## Code Style Guidelines

- **Language**: All code, comments, and documentation are in English.
- **Import style**: Use `.js` extensions for relative imports (TypeScript ES module resolution requires this).
- **Effect TS patterns** (cf-api models):
  - Wrap async D1 operations in `Effect.tryPromise({ try: …, catch: … })`.
  - Return typed effects: `Effect.Effect<A, NotFoundError | DatabaseError, never>`.
  - Use `Effect.runPromiseExit` + `Exit.isSuccess` / `Cause.failureOption` to unwrap in handlers.
  - Define schemas with `effect/Schema` (Struct, Literal, Array, optional, etc.).
- **Error types**: Use tagged error classes from `cf-shared`:
  - `NotFoundError(entity, id)` — 404 responses
  - `ValidationError(field, message)` — 400 responses
  - `DatabaseError(operation, cause)` — 500 responses
- **Logging**: Use `createLogger(serviceName)` from `cf-shared` for structured JSON logs. Never use bare `console.error` in cf-api route handlers.
- **Bot patterns** (cf-bot):
  - Use Grammy's `bot.command`, `bot.on("callback_query:data")`, `bot.on("message:text")` for routing.
  - Use KV for session and conversation state storage.
  - Call cf-api via `ApiServiceClient` which wraps `env.API_SERVICE.fetch()`.
- **Formatting**: Prettier with default config. No custom `.prettierrc` is present — use defaults.

## Testing Instructions

- **Framework**: Vitest with `globals: true`, `environment: "node"`.
- **Test location**: Co-located with source inside `__tests__` directories (e.g., `src/models/__tests__/user.test.ts`).
- **Coverage**: Threshold is **60%** for statements, branches, functions, and lines.
  - Coverage includes `packages/**/src/**/*.ts` and `services/**/src/**/*.ts`.
  - Excludes: `__tests__`, `*.test.ts`, `index.ts`, `lib/version.ts`, `testing/**`, `types.ts`.
- **Property-based testing**: Use `fast-check` for domain-heavy logic (match scoring, user preferences).
- **Mocking**: Use helpers from `@meetsmatch/cf-shared/testing`:
  - `createMockD1(handler)` — captures SQL + params, returns mock results
  - `createMockKV(initial)` — in-memory Map-backed KV
  - `createMockR2()` — in-memory object store
  - `createMockQueue()` — no-op send/sendBatch
  - `runEffect(effect)` — unwraps Effect in tests, throwing on failure
- **Race condition tests**: Tests ending in `-race.test.ts` exercise concurrent access patterns.
- **Integration tests**: Each service has integration tests (e.g., `services/cf-api/src/tests/integration.test.ts`).

### Running tests

```bash
pnpm test                    # All tests
pnpm test -- --run packages/cf-shared   # Specific package
pnpm test -- --run services/cf-api/src/models/__tests__/user.test.ts
```

## Security Considerations

- **Secrets**: `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `ADMIN_CHAT_ID` are stored as Wrangler secrets (never committed). Set via `wrangler secret put` or `.dev.vars` for local dev.
- **Webhook verification**: cf-bot validates `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET` when configured.
- **Media upload**: R2 keys are scoped per-user (`${userId}/…`). The API verifies URL ownership before R2 deletion.
- **SQL Injection**: D1 queries use parameterized `.bind()` values exclusively. No string concatenation into SQL.
- **Bot blocked errors**: Handlers silently swallow bot-blocked errors to avoid retry loops and log noise.
- **Error reports**: Sensitive fields (kvSession, cfMetadata, errorStack) are captured in dedicated `error_reports` table, not general logs.
- **CORS**: No public CORS configuration — the API is intended for internal service-binding and bot consumption only.

## Deployment Process

Deployments are automated via GitHub Actions (`.github/workflows/ci.yml`).

### Environments

- **Dev**: Auto-deployed on every push to `main` or pre-release tags (`v*-(pre|rc|beta|alpha|snapshot|nightly|canary|dev)`).
- **Production**: Deployed on release tags matching `v*` without pre-release suffixes.

### Deployment Order

1. Run tests and type checks.
2. Build `cf-shared` (`tsc -b packages/cf-shared`).
3. Generate version files (`scripts/generate-version.ts`).
4. Apply D1 migrations (`wrangler d1 migrations apply --remote`).
5. Deploy `cf-api` → `cf-bot` → `cf-worker`.

### Required Secrets

- `CLOUDFLARE_API_TOKEN` — GitHub Actions secret with Workers deploy and D1 permissions.

### Manual Deployment

```bash
# Dev
CF_ENV=development pnpm -w deploy:api
CF_ENV=development pnpm -w deploy:bot
CF_ENV=development pnpm -w deploy:worker

# Production
CF_ENV=production pnpm exec tsx scripts/generate-version.ts
cd services/cf-api && wrangler deploy --env production
cd services/cf-bot && wrangler deploy --env production
cd services/cf-worker && wrangler deploy --env production
```

## Development Conventions

### Version Files

Each service has an auto-generated `src/lib/version.ts` created by `scripts/generate-version.ts`:
- Runs automatically on `postinstall`, `pretest`, and before `dev`/`deploy`/`build`.
- Uses git tag for production releases, short commit hash for dev.
- **Do not edit `src/lib/version.ts` manually.**

### D1 Migrations

- Migrations live in `services/cf-api/migrations/` and are numbered sequentially (`0001_init.sql`, `0002_add_matches.sql`, …).
- Apply locally: `wrangler d1 migrations apply meetsmatch-db --local`
- Apply remotely: `wrangler d1 migrations apply meetsmatch --env production --remote`

### Bot Commands

Commands are registered once via `scripts/setup-bot-commands.ts` to avoid rate-limiting in the serverless handler. Do not register commands inside `cf-bot/src/index.ts`.

### Observability

Cloudflare Workers natively export OpenTelemetry logs and traces. No SDK bundling required.
- Configure destinations in the Cloudflare Dashboard → Workers & Pages → Observability.
- Uncomment `destinations` arrays in each `wrangler.toml` after adding backends (Sentry, Honeycomb, etc.).

### Commits

Use conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`.

## Important Notes for Agents

- **Do not trust `.github/copilot-instructions.md`** — it describes a legacy Python/Go stack that has been fully migrated to TypeScript/Cloudflare Workers.
- **Do not add a bundler** — the project uses `tsc` only. Wrangler handles bundling during deploy.
- **Do not change import extensions** — relative imports must use `.js` extensions for ESM compatibility.
- **When adding a new cf-api model**: Follow the existing `Effect.tryPromise` pattern, export typed `Effect.Effect<…>` signatures, and add `__tests__` alongside the model file.
- **When adding a new bot handler**: Register it in `cf-bot/src/index.ts` under the appropriate `bot.command`, `bot.on("callback_query:data")`, or `bot.on("message:text")` branch.
- **When adding a new cron job**: Add the implementation in `cf-worker/src/jobs/`, wire it into `cf-worker/src/index.ts` in the `scheduled` handler, and add the cron expression to `wrangler.toml`.
- **When modifying shared contracts**: Update the Effect Schema in `packages/cf-shared/src/contracts/`, then run `pnpm exec tsc -b packages/cf-shared` so dependent services pick up the changes.
