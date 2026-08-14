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

| Resource         | Binding                      | Purpose                                                                              |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------ |
| D1 Database      | `DB`                         | SQLite-compatible relational data (users, matches, notifications, reports, feedback) |
| KV Namespace     | `KV`                         | Session caching, conversation state, geocoding cache                                 |
| Queue            | `NOTIFICATION_QUEUE`         | Async notification delivery (cf-api produces, cf-worker consumes)                    |
| R2 Bucket        | `MEDIA_BUCKET`               | Profile photos and videos                                                            |
| Service Bindings | `API_SERVICE`, `BOT_SERVICE` | Zero-latency RPC between Workers                                                     |

## Technology Stack

- **Runtime**: Cloudflare Workers (`compatibility_date = "2026-05-01"`, `nodejs_compat` flag)
- **Language**: TypeScript 7.0.2 (native), ES2024 target, ES2022 modules, `"type": "module"`
- **Package Manager**: pnpm 11.1.2 (workspaces enabled)
- **Monorepo**: pnpm workspaces (`packages/*`, `services/cf-*`)
- **FP Framework**: [Effect TS](https://effect.website/) (4.0.0-rc.109) — typed error handling, schemas, and composable effects in cf-shared/cf-api/cf-worker
- **Infrastructure**: [Alchemy](https://alchemy.run) (2.0.0-beta.72) — `alchemy.run.ts` declares all Workers + Cloudflare resources as one Effect stack; deploys replace per-service `wrangler.toml` flows
- **Bot Framework**: [Grammy](https://grammy.dev/) (^1.45.1) with `@grammyjs/conversations` and `@grammyjs/menu`
- **HTTP Routing**: Custom request router in cf-api (no external framework)
- **Database**: Cloudflare D1 (SQLite) with raw SQL via `D1Database.prepare()`; migrations applied automatically on alchemy deploy (`migrationsDir` in `alchemy.run.ts`)
- **Testing**: Vitest (^4.1.10) with `@vitest/coverage-v8`, `fast-check` for property-based tests
- **Lint**: Oxlint (^1.77.0) with the `effecttsgo` plugin — type-aware linting patched by `@effect/tsgo` (see `.oxlintrc.json`)
- **Format**: Oxfmt (^0.63.0) with `.oxfmtrc.json` (prettier-compatible defaults)
- **Type checking**: `tsgo` (fast, per project) and `tsc --build --force` (safe)
- **Version Generation**: Custom `scripts/generate-version.ts` (git tag or short hash)

## Project Structure

```
.
├── alchemy.run.ts           # Infrastructure-as-Effects stack (Workers + resources)
├── package.json              # Root monorepo manifest
├── pnpm-workspace.yaml       # Workspace definitions
├── tsconfig.json             # Root TS project references (composite: true)
├── .oxlintrc.json            # Oxlint config (effecttsgo plugin, type-aware)
├── .oxfmtrc.json             # Oxfmt formatting config
├── vitest.config.ts          # Shared vitest config (coverage thresholds: 60%)
├── Makefile                  # Common dev tasks (dev, test, lint, deploy, db-check)
├── scripts/
│   ├── generate-version.ts   # Auto-generates src/lib/version.ts per service
│   ├── setup-bot-commands.ts # Registers commands with BotFather
│   └── seed-dev-db.ts        # Seeds D1 with synthetic test users (wrangler d1 execute)
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
│   │   └── wrangler.toml     # D1 dev tooling only (seed/db-check); deploys go through alchemy
│   ├── cf-bot/
│   │   ├── src/
│   │   │   ├── index.ts      # Worker fetch + webhook handler, bot setup
│   │   │   ├── handlers/     # Command & callback handlers (start, profile, match, …)
│   │   │   ├── menus/        # Inline keyboard menus
│   │   │   ├── lib/          # Conversations, i18n, notifications, activity tracking
│   │   │   └── services/     # ApiServiceClient (service binding RPC wrapper)
│   │   └── tsconfig.json
│   └── cf-worker/
│       ├── src/
│       │   ├── index.ts      # Worker fetch + queue + scheduled handlers
│       │   ├── jobs/         # Cron job implementations (reengagement, cleanup, birthday, DLQ, subscription expiry)
│       │   ├── notifications/ # Queue consumer logic
│       │   └── services/     # ApiServiceClient
│       └── tsconfig.json
```

## Build and Test Commands

All commands run from the repository root unless noted.

```bash
# Install dependencies
pnpm install

# Development — run the whole stack locally (hot reloading)
pnpm dev

# Preview a deploy without applying (requires Cloudflare credentials)
pnpm plan          # prod stage
pnpm plan:dev      # dev stage

# Testing
pnpm test         # Run full vitest suite across monorepo
make test

# Linting and formatting
pnpm lint            # oxlint (type-aware, effecttsgo plugin)
pnpm format          # oxfmt write all TS/JS/JSON
pnpm format:check    # oxfmt verify
make lint

# Type checking
pnpm typecheck:fast   # tsgo --noEmit per project (fast)
pnpm typecheck:safe   # tsc --build --force (safe, slow)
make typecheck

# Deployment (alchemy)
pnpm deploy:dev     # dev stage (--yes: non-interactive, applies without prompting)
pnpm deploy:prod    # prod stage, adopts existing cloud resources (--adopt --yes)
pnpm deploy         # alias for deploy:prod
make deploy         # quality gates + dev stage
make deploy-prod    # prod stage with adoption

# The --yes flag is required: alchemy prints a plan and then exits without
# applying when it detects a non-interactive terminal. CI deploy jobs rely on
# these scripts, so keep --yes in them.

# Database
make db-check     # Verify local D1 connectivity (wrangler, dev tooling only)
```

### Pre-Dev Setup

1. Copy `.env.example` to `.env` and fill in `BOT_TOKEN` (+ `TELEGRAM_WEBHOOK_SECRET`, `API_SECRET`).
2. Log in to Cloudflare for alchemy (interactive on first `pnpm dev`/`plan`, or via `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` env vars).
3. Register bot commands (one-time or after changes):
   ```bash
   BOT_TOKEN=<token> pnpm exec tsx scripts/setup-bot-commands.ts
   ```

### Effect v4 notes

- The repo runs `effect@4.0.0-rc.109` and `alchemy@2.0.0-beta.72`. Bump `effect`, `@effect/platform-*`, and `alchemy` together, and verify `pnpm exec alchemy --help` still works (alchemy's `effect` peer range is `>=4.0.0-beta.105`).
- Oxlint is pinned to `1.77.0` (not `latest`) because `@effect/tsgo@0.36.4`'s `effect-tsgo patch --oxlint` integration only ships native artifacts through oxlint 1.77.0. Do not bump oxlint until a matching `@effect/tsgo` release ships the 1.78.x artifact.
- v3→v4 renames used across the code: `Effect.either`→`Effect.result`, `Effect.catchAll`→`Effect.catch`, `Effect.orElse`→`Effect.catch`/`Effect.matchEffect`, `Cause.failureOption`→`Cause.findErrorOption`, `Schema.Literal(a,b)`→`Schema.Literals([a,b])`, `Schema.filter`→`Schema.check(Schema.makeFilter(...))`, `ConfigProvider.fromMap`→`ConfigProvider.fromUnknown`, `Layer.setConfigProvider`→`ConfigProvider.layer`, `effect/Either`→`effect/Result`, `effect/ParseResult`→`effect/SchemaIssue`, `Context.Tag`→`Context.Service`.
- The `effecttsgo` oxlint plugin flags v3 APIs against the v4 surface (`outdated-api`) — treat its warnings as errors.

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

Deployments are automated via GitHub Actions (`.github/workflows/ci.yml`) using alchemy.

### Stages

Alchemy stages mirror the old wrangler environments:

- **Dev** (`--stage dev`): auto-deployed on every push to `main` or pre-release tags (`v*-(pre|rc|beta|alpha|snapshot|nightly|canary|dev)`). Uses `meetsmatch-dev` D1, `notification-queue-dev`/`dlq-dev`, no cron triggers.
- **Production** (`--stage prod`): deployed on release tags matching `v*` without pre-release suffixes. Adopts the pre-existing resources (`--adopt`): D1 `meetsmatch`, R2 `meetsmatch-media`, queues `notification-queue`/`dlq`, Analytics Engine datasets.

### How a deploy works

1. `alchemy plan` computes the diff against the state store (preview with `pnpm plan`).
2. `alchemy deploy` builds each Worker, applies D1 migrations (`migrationsDir` in `alchemy.run.ts`), creates/updates resources and bindings, and deploys all four Workers.
3. KV namespaces are NOT adopted (ambiguous titles) — fresh namespaces per stage; delete the old ones from the dashboard after cutover.
4. Secrets are read from the deploy environment (`BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `API_SECRET`) and bound as `secret_text`.

### Required Secrets

- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` — GitHub Actions vars/secrets for alchemy provider auth.
- `BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `API_SECRET` — GitHub Actions secrets, bound by alchemy at deploy time.

### Manual Deployment

```bash
pnpm plan            # preview prod
pnpm deploy:dev      # dev stage (--yes)
pnpm deploy:prod     # prod stage with --adopt --yes
```

Prefer CI for prod deploys (tags). Local `pnpm deploy:*` uses the checked-out
`src/lib/version.ts` and can report a stale version / `development` environment:
regenerate it first with `pnpm exec tsx scripts/generate-version.ts` (and set
`CF_ENV=production` for a local prod deploy). CI regenerates version files on
`pnpm install` via `postinstall`, so CI deploys always carry the tag + env.

## Development Conventions

### Version Files

Each service has an auto-generated `src/lib/version.ts` created by `scripts/generate-version.ts`:

- Runs automatically on `postinstall`, `pretest`, and before `dev`/`deploy`/`build`.
- Uses git tag for production releases, short commit hash for dev.
- **Do not edit `src/lib/version.ts` manually.**

### D1 Migrations

- Migrations live in `services/cf-api/migrations/` and are numbered sequentially (`0001_init.sql`, `0002_add_matches.sql`, …).
- Applied automatically by alchemy on every deploy (`migrationsDir` on the `DB` resource in `alchemy.run.ts`).
- Local-only D1 tooling (`make db-check`, `scripts/seed-dev-db.ts`) still uses `wrangler d1 execute` against the kept `services/cf-api/wrangler.toml`.

### Bot Commands

Commands are registered once via `scripts/setup-bot-commands.ts` to avoid rate-limiting in the serverless handler. Do not register commands inside `cf-bot/src/index.ts`.

### Observability

Cloudflare Workers natively export OpenTelemetry logs and traces. No SDK bundling required.

- Configure destinations in the Cloudflare Dashboard → Workers & Pages → Observability.
- Wire named destinations into Workers via the `Cloudflare.Worker` observability props in `alchemy.run.ts`.

### Commits

Use conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`.

## Important Notes for Agents

- **Do not trust `.github/copilot-instructions.md`** — it describes a legacy Python/Go stack that has been fully migrated to TypeScript/Cloudflare Workers.
- **Do not add a bundler** — alchemy bundles Workers during deploy; `tsc` is used for type checking and building `cf-shared` only.
- **Do not change import extensions** — relative imports must use `.js` extensions for ESM compatibility.
- **When adding a new cf-api model**: Follow the existing `Effect.tryPromise` pattern, export typed `Effect.Effect<…>` signatures, and add `__tests__` alongside the model file.
- **When adding a new bot handler**: Register it in `cf-bot/src/index.ts` under the appropriate `bot.command`, `bot.on("callback_query:data")`, or `bot.on("message:text")` branch.
- **When adding a new cron job**: Add the implementation in `cf-worker/src/jobs/`, wire it into `cf-worker/src/index.ts` in the `scheduled` handler, and add the cron expression to `alchemy.run.ts` (`crons` prop on the `Worker` resource).
- **When modifying shared contracts**: Update the Effect Schema in `packages/cf-shared/src/contracts/`, then run `pnpm exec tsc -b packages/cf-shared` so dependent services pick up the changes.
- **When adding a new binding/resource**: Declare it in `alchemy.run.ts` (D1, KV, R2, Queues, Analytics Engine, service bindings, secrets), never in a `wrangler.toml` — the only remaining one is cf-api's D1-dev-tooling config.

- Do not preserve backward compatibility. Remove obsolete paths instead of adding compatibility layers, fallbacks, or migrations.
- Choose the simplest implementation that fully meets the current requirements. Avoid speculative abstractions, configuration, and indirection.
- Grow the system in layers. Start from the smallest version that works end to end, and add each new capability on top of a product that already works. Never trade a working product for unfinished complexity.
- Keep components modular and concerns clearly separated.
- Prefer established, well-maintained libraries when they reduce overall complexity or improve reliability. Do not reimplement common functionality without a clear reason.
- Lean on the dependencies already in the project before writing your own implementation or adding packages. Do not assume a library lacks a capability without checking its documentation and types.
- Make architectural decisions for the long term. Do not accept a stopgap that only works for now and is meant to be replaced later.
