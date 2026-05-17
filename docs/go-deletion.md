# Go Service Deletion Checklist

Execute ONLY after 48 hours of stable production on Cloudflare Workers.

## Pre-Deletion Verification

- [ ] All integration tests pass on cf-\* services
- [ ] Zero active traffic to Go services (verify via logs/metrics)
- [ ] All data migrated from PostgreSQL/SQLite to D1
- [ ] Bot webhook points to cf-bot Worker
- [ ] Cron jobs running on cf-worker (not Go worker)

## Files to Delete

### Go Services

```
services/api/
services/worker/
services/bot/src/grpc/          (gRPC server code)
services/bot/src/lib/health.ts  (health server)
services/bot/src/lib/startup.ts (polling startup)
services/bot/src/lib/sentry*.ts (keep for cf-bot)
```

### Contracts/Protobuf

```
packages/contracts/
```

### Docker

```
Dockerfile
docker-compose.yml
services/api/Dockerfile
services/worker/Dockerfile
```

### Go Workspace

```
go.work
go.work.sum
services/api/go.mod
services/api/go.sum
services/worker/go.mod
services/worker/go.sum
services/bot/go.mod       (if exists)
services/bot/go.sum       (if exists)
```

### CI/CD (update, don't delete)

- Remove Go build steps from `.github/workflows/ci.yml`
- Remove Docker build/push steps
- Keep TypeScript/Worker build steps

## Post-Deletion Verification

```bash
# Verify zero Go references
grep -r "go\.mod\|go\.sum\|go\.work" --include="*.md" --include="*.yml" --include="*.yaml" .

# Verify zero Docker references (except docs)
grep -r "docker\|Dockerfile" --include="*.md" --include="*.yml" --include="*.yaml" . | grep -v "docs/"

# Verify zero protobuf references
grep -r "proto\|protobuf\|\.pb\." --include="*.ts" --include="*.js" . | grep -v "node_modules"

# Build all TS services
pnpm exec tsc -b services/cf-api
pnpm exec tsc -b services/cf-bot
pnpm exec tsc -b services/cf-worker

# Run integration tests
pnpm test --recursive
```

## Commit Message

```
chore(cf): remove Go services and Docker configuration

BREAKING CHANGE: Go API, Worker, and gRPC services removed.
All functionality migrated to Cloudflare Workers (cf-api, cf-bot, cf-worker).

Deleted:
- services/api/ (Go API service)
- services/worker/ (Go Worker service)
- packages/contracts/ (protobuf contracts)
- Dockerfile, docker-compose.yml
- go.work, go.work.sum
- Go module files

Verified:
- Zero Go references in active code
- All Workers build and pass tests
- Clean TypeScript compilation
```
