# MeetMatch Development Guide

## Prerequisites

- Node 20+
- pnpm
- Wrangler CLI
- Git

## Setup

```bash
git clone <repo-url> && cd brave-knight
pnpm install
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and fill in a valid `BOT_TOKEN` from Telegram's BotFather. The
other variables can stay as-is for local development.

## Running Locally

Each service runs in its own terminal:

```bash
pnpm dev:api     # CF API worker    (default port 8787)
pnpm dev:bot     # CF Bot worker    (default port 8788)
pnpm dev:worker  # CF Cron worker   (default port 8789)
```

## D1 Database (Local)

Seed or migrate your local D1 instance:

```bash
wrangler d1 execute meetsmatch-db --local --file=services/cf-api/migrations/001_init.sql
```

## Testing

```bash
pnpm test    # vitest (workspace-wide)
pnpm lint    # tsc --noEmit
```

## Formatting

```bash
pnpm format   # prettier
```

## Project Structure

```
brave-knight/
  packages/          # shared libraries (Effect schemas, contracts)
  services/
    cf-api/          # HTTP API worker (Hono + Effect TS)
    cf-bot/          # Telegram bot webhook handler
    cf-worker/       # Cron triggers and background jobs
```

Each service has its own `wrangler.toml`, `package.json`, `tsconfig.json`, and
`vitest.config.ts`.

## Project Guidelines

- Follow existing Effect TS patterns. Services are built with `Effect.Service`,
  errors use `Data.TaggedError`, and configuration flows through `Layer`.
- Use Effect Schema for API contracts and request/response validation.
- Add tests alongside new code. Prefer property-based tests when the domain
  warrants it.
- Keep commits small and focused. Use conventional commits (`feat:`, `fix:`,
  `refactor:`, `chore:`).
- Run `pnpm lint` and `pnpm test` before opening a PR.

## CI

GitHub Actions runs lint and test on every push and pull request. Both must pass
before merging.
