# MeetMatch Cloudflare Workers Cutover Plan

## Overview

This document describes the deployment sequence for migrating MeetMatch from Go+Docker+PostgreSQL+Redis to Effect TS+Cloudflare Workers+D1+KV+Queues.

## Pre-Deployment Checklist

- [ ] All integration tests pass (`npm test` in each service)
- [ ] TypeScript compiles cleanly (`npx tsc --noEmit` in each service)
- [ ] D1 database migrated with all 5 migrations applied
- [ ] KV namespaces created for all services
- [ ] Queue `notification-queue` and DLQ configured
- [ ] Service bindings configured between cf-api, cf-bot, cf-worker
- [ ] Secrets configured (BOT_TOKEN, SENTRY_DSN, etc.)
- [ ] Telegram webhook URL updated to point to cf-bot Worker
- [ ] Environment variables verified in each wrangler.toml

## Deployment Sequence

### Phase 1: Deploy API Worker (cf-api)

1. Build and verify:
   ```bash
   cd services/cf-api
   npx tsc --noEmit
   ```

2. Deploy:
   ```bash
   wrangler deploy
   ```

3. Verify:
   - Health endpoint returns 200
   - User CRUD endpoints work
   - Match endpoints work
   - Notification endpoints work

4. **Kill switch**: Set `ENABLE_API_FALLBACK=true` in Go API to proxy to cf-api if needed

### Phase 2: Deploy Worker (cf-worker)

1. Build and verify:
   ```bash
   cd services/cf-worker
   npx tsc --noEmit
   ```

2. Deploy:
   ```bash
   wrangler deploy
   ```

3. Verify:
   - Queue consumer processes messages
   - Cron triggers fire on schedule
   - DLQ health check runs every 5 minutes

### Phase 3: Deploy Bot Worker (cf-bot)

1. Build and verify:
   ```bash
   cd services/cf-bot
   npx tsc --noEmit
   ```

2. Deploy:
   ```bash
   wrangler deploy
   ```

3. Update Telegram webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://meetsmatch-bot.your-account.workers.dev/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
   ```

4. Verify:
   - /start command works
   - Profile editing works
   - Match flow works
   - Activity tracking updates last_active

### Phase 4: Data Migration (if needed)

If migrating from existing PostgreSQL/SQLite:

1. Export users table from existing DB
2. Transform to D1-compatible format (JSON strings for arrays/objects)
3. Import into D1:
   ```bash
   wrangler d1 executes meetsmatch < migration.sql
   ```

## Rollback Procedures

### Immediate Rollback (per service)

If a service has issues:

1. **API**: Revert Go API deployment or redirect DNS back to Go service
2. **Bot**: Revert Telegram webhook to original bot URL
3. **Worker**: Disable cron triggers in wrangler dashboard

### Full Rollback

1. Stop all cf-* deployments
2. Restore Go services from backup
3. Restore PostgreSQL/Redis from backup
4. Update DNS/webhook URLs to point to Go stack

## Post-Deployment Verification

- [ ] All 3 Workers return 200 on /health
- [ ] Bot responds to all commands
- [ ] Matches are created and scored correctly
- [ ] Notifications are delivered via queue
- [ ] Cron jobs run on schedule
- [ ] No errors in Worker logs
- [ ] D1 queries are performant (check indexes)

## Cleanup (after 48h stable)

- [ ] Delete Go services: `services/api/`, `services/worker/`
- [ ] Delete Docker files: `Dockerfile`, `docker-compose.yml`
- [ ] Delete protobuf contracts: `packages/contracts/`
- [ ] Delete Go workspace files: `go.work`, `go.work.sum`
- [ ] Verify no Go/Docker/proto references remain
