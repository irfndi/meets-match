# MeetMatch: Go+Docker → Effect TS+Cloudflare Migration

## TL;DR

> **Quick Summary**: Port MeetMatch from Go/Bun+Docker to Effect TS+Cloudflare Workers using a strangler fig pattern — build TS versions alongside Go files, verify feature parity, then delete Go. All TypeScript uses Effect TS ecosystem.
>
> **Deliverables**:
> - Cloudflare Worker project scaffolding with Effect TS + D1 + KV + Queues + Service Bindings
> - Effect Schema contract definitions replacing protobuf
> - Ported models layer (User, Match, Notification, Geocoding)
> - Ported API service with HTTP endpoints + Service Bindings
> - Ported Bot service with webhook-based Telegram handling
> - Ported Worker service with Cron Triggers + Queue consumers
> - Database migration from PostgreSQL/SQLite → D1
> - Integration tests for each ported module
> - Cutover plan to delete Go services
>
> **Estimated Effort**: Large (19 tasks across 4 waves)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Scaffolding → Models+DB → Services → Integration+Cutover

---

## Context

### Original Request
User wants to explore deploying MeetMatch without Docker, using the Cloudflare stack. After analysis, the approach evolved to a "strangler fig" migration — port to Effect TS + Cloudflare Workers alongside existing Go services, verify parity, then cutover and delete Go code.

### Interview Summary
**Key Discussions**:
- **Database**: User has active PR migrating PostgreSQL → SQLite in Go. D1 (SQLite-based) is a natural fit.
- **Effect TS**: All TypeScript MUST use Effect. Bot already imports `Effect` (though only superficially).
- **Service Communication**: Cloudflare Service Bindings replacing gRPC. Effect Schema replacing protobuf contracts.
- **Background Jobs**: Cloudflare Queues + Cron Triggers replacing Redis queues + long-running Go worker.
- **Bot Runtime**: Webhook-based on Workers replacing long-polling.
- **Test Strategy**: Tests after porting (not TDD).
- **Migration Style**: Strangler fig — port alongside, verify, delete old code.

**Research Findings**:
- **Effect on Cloudflare**: `effectful-cloudflare` library provides Effect v4-native wrappers for ALL CF Worker bindings
- **Cloudflare Workers limits**: 30s CPU (paid), 128MB memory, 10MB bundle (free)/25MB (paid)
- **Service Bindings**: Direct function calls between Workers, no HTTP overhead, supports typed RPC
- **Notification system is the most complex module**: Redis queues (pending/delayed/DLQ), distributed locks, retry logic, idempotency keys

### Metis Review
**Identified Gaps** (addressed):
- **Bot Effect usage is superficial** → Must fully adopt Effect ecosystem (Schema, Layer, Context, Tag, Config)
- **Notification system is the most complex module** → Dedicated deep porting task
- **No rollback strategy** → Each service gets a cutover toggle (env var) so Go can be re-enabled
- **gRPC surface area is large** (4 services, ~20 methods) → Port contracts to Effect Schema first
- **Worker CPU limits** → Must profile hot paths; move heavy work to Durable Objects if needed
- **D1 SQL compatibility** → Test SQLite migration scripts against D1 specifically
- **Bundle size** → Effect tree-shakes well, monitor against 10MB/25MB limits

---

## Work Objectives

### Core Objective
Port MeetMatch from Go+Docker to Effect TS+Cloudflare using a strangler fig pattern, enabling full Cloudflare deployment without Docker.

### Concrete Deliverables
- Cloudflare Worker project with monorepo structure
- Effect Schema contract definitions (replacing protobuf)
- Ported models (User, Match, Notification, Geocoding) with D1 schema + migrations
- Ported API Worker with HTTP endpoints + Service Bindings
- Ported Bot Worker with webhook-based Telegram handling
- Ported background jobs Worker with Cron Triggers + Queue consumers
- Test coverage for each ported module
- Deployment configuration (wrangler.toml) for all Workers

### Definition of Done
- [ ] All 3 Go services ported to Effect TS Cloudflare Workers
- [ ] Bot receives Telegram updates via webhook (not polling)
- [ ] Workers communicate via Service Bindings (not gRPC)
- [ ] Data stored in D1 (not PostgreSQL/Redis)
- [ ] Cron jobs trigger on schedule (not long-running worker)
- [ ] Background jobs processed via Cloudflare Queues (not Redis)
- [ ] All services deployable via `wrangler deploy`
- [ ] Go services can be deleted without functional loss

### Must Have
- All Effect TS — no raw Promises, no Zod, no ad-hoc error handling
- Effect Schema for all contract definitions
- D1 for primary data storage
- Cloudflare Service Bindings for inter-service communication
- Webhook-based Telegram bot
- Cutover toggle for each service (can re-enable Go instantly)

### Must NOT Have (Guardrails)
- ❌ No gRPC or protobuf — Effect Schema is the contract layer
- ❌ No Redis — Cloudflare KV + Queues replace it
- ❌ No long-running processes — Cron Triggers + Queues only
- ❌ No Docker containers — pure Cloudflare Workers
- ❌ No feature changes during migration — 1:1 porting only
- ❌ No premature optimization — Durable Objects only if Worker CPU limits are hit
- ❌ No "nice-to-have" refactors (naming, restructuring) — pure porting
- ❌ No mixing patterns — all Effect, all the time
- ❌ No skipping cutover toggles — every service needs a kill switch for Go

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: NO (new project)
- **Automated tests**: YES (Tests-after)
- **Framework**: vitest (already used in bot service)
- **Approach**: Port module → write tests confirming correct behavior

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.
- **API/Backend**: Use Bash (curl/wrangler) — Send requests, assert status + response fields
- **Bot**: Use Bash (curl) — Simulate Telegram webhook payloads, verify responses
- **Worker/Cron**: Use Bash (wrangler) — Trigger cron manually, verify queue processing
- **Database**: Use Bash (wrangler d1 execute) — Verify schema, query data, test migrations

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — Start Immediately):
├── Task 1: Project scaffolding + wrangler config [quick]
├── Task 2: Effect Schema contract definitions [deep]
├── Task 3: D1 schema + migrations [deep]
├── Task 4: Effect Config + environment layers [quick]
└── Task 5: Shared utilities (logging, error schemas) [quick]

Wave 2 (Core Porting — After Wave 1):
├── Task 6: Models — User [deep]
├── Task 7: Models — Match [deep]
├── Task 8: Models — Geocoding [deep]
├── Task 9: Notification system porting [deep]
├── Task 10: API Worker — HTTP endpoints [deep]
└── Task 11: API Worker — Service Binding server [deep]

Wave 3 (Services — After Wave 2):
├── Task 12: Bot Worker — webhook entry + routing [deep]
├── Task 13: Bot Worker — handlers + conversations porting [deep]
├── Task 14: Worker — Cron Triggers + Queue consumers [deep]
├── Task 15: Bot Worker — gRPC → Service Binding client migration [deep]
└── Task 16: KV cache layer (replacing Redis) [quick]

Wave 4 (Integration + Cutover — After Wave 3):
├── Task 17: End-to-end integration testing [deep]
├── Task 18: Cutover deployment plan [writing]
└── Task 19: Go service deletion + cleanup [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 2,3,4,5 | 1 |
| 2 | 1 | 6,7,8,9,10,11,15 | 1 |
| 3 | 1 | 6,7,8,9 | 1 |
| 4 | 1 | 10,12,13,15 | 1 |
| 5 | 1 | 9,10 | 1 |
| 6 | 2,3 | 10 | 2 |
| 7 | 2,3 | 10 | 2 |
| 8 | 2,3 | 10 | 2 |
| 9 | 2,3,5 | 10,14 | 2 |
| 10 | 4,5,6,7,8 | 17 | 2 |
| 11 | 2,4 | 15 | 2 |
| 12 | 4 | 13 | 3 |
| 13 | 12 | 17 | 3 |
| 14 | 9,4 | 17 | 3 |
| 15 | 11,4 | 17 | 3 |
| 16 | 4 | 10 | 3 |
| 17 | 10,12,13,14,15 | 18 | 4 |
| 18 | 17 | 19 | 4 |
| 19 | 18 | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: **5** — T1,T4,T5 → `quick`, T2,T3 → `deep`
- **Wave 2**: **6** — T6,T7,T8,T9,T10,T11 → `deep`
- **Wave 3**: **5** — T12,T13,T14,T15 → `deep`, T16 → `quick`
- **Wave 4**: **3** — T17 → `deep`, T18 → `writing`, T19 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Project Scaffolding + Wrangler Configuration

  **What to do**:
  - Create `services/cf-api/`, `services/cf-bot/`, `services/cf-worker/` directories alongside existing Go services
  - Initialize each with `wrangler init` (TypeScript template)
  - Create root `package.json` with workspace configuration (monorepo with Effect TS)
  - Install core dependencies: `effect`, `@effect/schema`, `@effect/platform`, `@effect/sql`, `@effect/sql-sqlite3`, `effectful-cloudflare`
  - Install dev dependencies: `vitest`, `@cloudflare/workers-types`, `wrangler`
  - Create `wrangler.toml` for each service (API, Bot, Worker) with D1 binding, KV binding, Queue binding, Service Binding, and Cron Trigger config
  - Create shared `packages/cf-shared/` for Effect Schema contracts, config layers, utilities
  - Create `.dev.vars.example` for local development secrets
  - Create `tsconfig.json` with strict mode + Effect TS paths

  **Must NOT do**:
  - Delete or modify any existing Go/Bot files
  - Install Zod, io-ts, or any non-Effect validation library
  - Create a separate repo — everything stays in the monorepo

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — foundation for everything
  - **Blocks**: 2, 3, 4, 5
  - **Blocked By**: None

  **References**:
  **Pattern References**:
  - `services/bot/package.json:1-30` — Existing Bun/TS workspace structure
  - `services/bot/tsconfig.json` — TypeScript config pattern
  - `go.work` — Monorepo workspace structure (3 services pattern)
  - `docker-compose.yml:1-30` — Service definitions to mirror in wrangler config

  **External References**:
  - Cloudflare Workers docs: https://developers.cloudflare.com/workers/
  - Wrangler config reference: https://developers.cloudflare.com/workers/wrangler/configuration/
  - Effect TS docs: https://effect.website/

  **Acceptance Criteria**:
  - [ ] All wrangler.toml files exist for API, Bot, Worker
  - [ ] Root package.json has workspace config
  - [ ] `npx tsc --noEmit` passes with zero errors
  - [ ] `effect` and `effectful-cloudflare` in dependencies

  **QA Scenarios:**
  ```
  Scenario: Project structure validates
    Tool: Bash
    Steps:
      1. ls services/cf-api/wrangler.toml services/cf-bot/wrangler.toml services/cf-worker/wrangler.toml
      2. ls packages/cf-shared/package.json
      3. cat services/cf-api/package.json | grep effect
    Expected Result: All wrangler.toml files exist, cf-shared has package.json, effect in dependencies
    Evidence: .sisyphus/evidence/task-1-structure-validation.txt

  Scenario: TypeScript compiles without errors
    Tool: Bash
    Steps:
      1. npx tsc --noEmit
    Expected Result: Zero type errors
    Evidence: .sisyphus/evidence/task-1-tsc-compile.txt
  ```

  **Commit**: YES (group with Task 2)
  - Message: `feat(cf): scaffold project and contracts`
  - Files: `services/cf-api/*, services/cf-bot/*, services/cf-worker/*, packages/cf-shared/*, package.json, tsconfig.json`

- [x] 2. Effect Schema Contract Definitions

  **What to do**:
  - Read all `.proto` files in `packages/contracts/proto/` to understand contract surface
  - Create `packages/cf-shared/src/contracts/` directory
  - For each protobuf service, create Effect Schema classes:
    - `user.ts` — UserRequest, UserResponse, UserUpdate schemas
    - `match.ts` — MatchRequest, MatchResponse, MatchList schemas
    - `notification.ts` — NotificationRequest, NotificationResponse schemas
    - `health.ts` — HealthCheckRequest, HealthCheckResponse schemas
  - Create Service Binding contract interfaces in `bindings.ts` — typed function signatures
  - Export all from `packages/cf-shared/src/contracts/index.ts`
  - Create Effect Layer for Service Binding client/server

  **Must NOT do**:
  - Import or reference protobuf files — pure Effect Schema
  - Use Zod schemas
  - Change or delete existing proto files
  - Add business logic — pure contract definitions

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 3, 4, 5)
  - **Blocks**: 6,7,8,9,10,11,15
  - **Blocked By**: 1

  **References**:
  - `packages/contracts/proto/` — All protobuf definitions
  - `services/api/internal/grpcserver/server.go` — gRPC method registration
  - `services/bot/src/grpc/` — Bot's gRPC client code

  **Acceptance Criteria**:
  - [ ] Contract files exist for user, match, notification, health
  - [ ] All proto services have corresponding Effect Schema definitions
  - [ ] Schemas compile and decode/encode valid data

  **QA Scenarios:**
  ```
  Scenario: All proto services mapped to Effect Schema
    Tool: Bash
    Steps:
      1. ls packages/cf-shared/src/contracts/
      2. grep -r "Schema.Struct" packages/cf-shared/src/contracts/ | wc -l
      3. grep -r "service " packages/contracts/proto/ | wc -l
    Expected Result: user.ts, match.ts, notification.ts, health.ts, bindings.ts, index.ts exist. Schema count >= proto service count.
    Evidence: .sisyphus/evidence/task-2-contracts-coverage.txt

  Scenario: Effect Schema validates sample data
    Tool: Bash
    Steps:
      1. Run vitest on contract tests
      2. Verify Schema.decodeUnknown works for valid sample data
    Expected Result: All schemas compile and decode valid data
    Evidence: .sisyphus/evidence/task-2-schema-validation.txt
  ```

  **Commit**: YES (group with Task 1)

- [x] 3. D1 Schema + Migrations

  **What to do**:
  - Read Go database models (`services/api/internal/models/`)
  - Read Alembic migrations (`alembic/versions/`)
  - Create `services/cf-api/migrations/` with numbered SQL migration files
  - Write D1-compatible CREATE TABLE statements for: users, matches, notifications
  - Create `services/cf-api/src/db/schema.ts` with Effect Schema matching D1 tables
  - Create `services/cf-api/src/db/client.ts` with Effect Layer for D1 database access
  - Test migrations locally with `wrangler d1 execute meetsmatch-db --local`

  **Must NOT do**:
  - Use PostgreSQL-specific syntax
  - Create stored procedures or triggers
  - Change existing Go database code

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 2, 4, 5)
  - **Blocks**: 6,7,8,9
  - **Blocked By**: 1

  **References**:
  - `services/api/internal/models/user.go` — Go User model
  - `services/api/internal/models/match.go` — Go Match model
  - `alembic/versions/` — Historical migrations

  **Acceptance Criteria**:
  - [ ] Migration SQL executes on local D1 without errors
  - [ ] All D1 tables created (users, matches, notifications)
  - [ ] schema.ts fields match D1 column definitions

  **QA Scenarios:**
  ```
  Scenario: D1 migrations execute successfully
    Tool: Bash
    Steps:
      1. wrangler d1 execute meetsmatch-db --local --file=services/cf-api/migrations/0001_initial.sql
      2. wrangler d1 execute meetsmatch-db --local --command="SELECT name FROM sqlite_master WHERE type='table'"
    Expected Result: Tables: users, matches, notifications all exist
    Evidence: .sisyphus/evidence/task-3-d1-migration.txt

  Scenario: Schema.ts matches D1 tables
    Tool: Bash
    Steps:
      1. Compare PRAGMA table_info columns with Schema.Struct fields
    Expected Result: Every D1 column has corresponding Effect Schema field
    Evidence: .sisyphus/evidence/task-3-schema-table-parity.txt
  ```

  **Commit**: YES (group with Tasks 4, 5)

- [x] 4. Effect Config + Environment Layers

  **What to do**:
  - Create `packages/cf-shared/src/config/` directory
  - Define Effect Config layers for each service (ApiConfig, BotConfig, WorkerConfig)
  - Use `Config.all({ ... })` pattern for environment variables
  - Create `.dev.vars.example` template
  - Validate required vars via Effect Schema (fail fast on missing)

  **Must NOT do**:
  - Use `process.env` directly
  - Hardcode secrets
  - Create config for Go services

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 2, 3, 5)
  - **Blocks**: 10,12,13,15
  - **Blocked By**: 1

  **References**:
  - `services/api/internal/config/config.go` — Go config pattern
  - `services/bot/src/lib/config.ts` — Existing TS config
  - `services/worker/internal/config/config.go` — Worker config

  **Acceptance Criteria**:
  - [ ] Config layers for API, Bot, Worker exist
  - [ ] Missing required vars produce clear ConfigError
  - [ ] Valid environment parses to correct typed values

  **QA Scenarios:**
  ```
  Scenario: Config validates required env vars
    Tool: Bash
    Steps:
      1. Test with empty environment → ConfigError for each required var
    Expected Result: Clear error identifying missing vars
    Evidence: .sisyphus/evidence/task-4-config-validation.txt

  Scenario: Config parses valid environment
    Tool: Bash
    Steps:
      1. Test with valid environment → correct typed values
    Expected Result: All configs parse successfully
    Evidence: .sisyphus/evidence/task-4-config-parse.txt
  ```

  **Commit**: YES (group with Tasks 3, 5)

- [x] 5. Shared Utilities (Logging, Error Schemas)

  **What to do**:
  - Create `packages/cf-shared/src/utils/` directory
  - Create `logger.ts` — Effect Logger for CF Workers (structured JSON, Sentry)
  - Create `errors.ts` — Error schemas: NotFoundError, ValidationError, ConflictError, ExternalServiceError, RateLimitError
  - Create `retry.ts` — Effect retry policies (exponential backoff, jitter)
  - Create `health.ts` — Shared health check handler

  **Must NOT do**:
  - Use console.log — Effect Logger only
  - Use raw Error classes — Effect Schema only
  - Implement business logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 2, 3, 4)
  - **Blocks**: 9, 10
  - **Blocked By**: 1

  **References**:
  - `services/api/internal/sentry/sentry.go` — Sentry pattern
  - `services/api/internal/notification/queue.go` — Retry + backoff pattern
  - `services/bot/src/lib/sentry.ts` — Existing Sentry integration

  **Acceptance Criteria**:
  - [ ] All 5 error schemas create valid instances
  - [ ] Logger produces structured JSON output
  - [ ] Retry policies apply exponential backoff

  **QA Scenarios:**
  ```
  Scenario: Error schemas classify correctly
    Tool: Bash
    Steps:
      1. Create instances of each error type
      2. Verify Effect.catchTag discriminates correctly
    Expected Result: All 5 errors caught by type, correct status codes
    Evidence: .sisyphus/evidence/task-5-error-schemas.txt

  Scenario: Logger produces structured JSON
    Tool: Bash
    Steps:
      1. Run Effect program with Logger layer
      2. Verify JSON output with timestamp, level, message
    Expected Result: Valid JSON log output
    Evidence: .sisyphus/evidence/task-5-logger-json.txt
  ```

  **Commit**: YES (group with Tasks 3, 4)

- [x] 6. Models Layer — User

  Port `services/api/internal/models/user.go` and `services/api/internal/services/user.go` to Effect TS.
  Create `services/cf-api/src/models/user.ts` with User Effect Schema + D1 repository (CreateUser, GetUser, UpdateUser, ListUsers, DeleteUser).
  Write vitest tests for all repository operations.

  **Must NOT do**: Change Go files, use raw SQL without Effect, skip Effect Layer pattern.
  **Category**: `deep` | **Parallel**: Wave 2 with 7,8,9 | **Depends on**: 2,3 | **Blocks**: 10

  **QA Scenarios:**
  ```
  Scenario: UserRepository CRUD works against D1
    Tool: Bash
    Steps: vitest run user.test.ts, verify all CRUD ops + NotFoundError
    Expected: All operations succeed, error cases return correct types
    Evidence: .sisyphus/evidence/task-6-user-repository.txt
  ```

  **Commit**: YES (group with 7, 8) — `feat(cf): port user, match, geocoding models`

- [x] 7. Models Layer — Match

  Port `services/api/internal/models/match.go` and `services/api/internal/services/match.go` to Effect TS.
  Create `services/cf-api/src/models/match.ts` with Match Effect Schema + D1 repository (CreateMatch, GetMatch, ListMatches, UpdateMatchStatus, FindPotentialMatches).

  **Must NOT do**: Change Go files, implement proximity in SQL, skip Effect Layer.
  **Category**: `deep` | **Parallel**: Wave 2 with 6,8,9 | **Depends on**: 2,3 | **Blocks**: 10

  **QA Scenarios:**
  ```
  Scenario: MatchRepository CRUD + status transitions
    Tool: Bash
    Steps: vitest run match.test.ts, verify CRUD + status enforcement
    Expected: All ops work, invalid transitions rejected
    Evidence: .sisyphus/evidence/task-7-match-repository.txt
  ```

  **Commit**: YES (group with 6, 8)

- [x] 8. Models Layer — Geocoding

  Port `services/api/internal/services/geocoding/` to Effect TS.
  Create `services/cf-api/src/models/geocoding.ts` with GeocodingService + KV cache layer.
  Methods: GeocodeAddress, ReverseGeocode, CalculateDistance.

  **Must NOT do**: Change Go files, hardcode API keys, skip caching.
  **Category**: `deep` | **Parallel**: Wave 2 with 6,7,9 | **Depends on**: 2,3 | **Blocks**: 10

  **QA Scenarios:**
  ```
  Scenario: Geocoding resolves addresses + cache works
    Tool: Bash
    Steps: Test geocode + reverse + distance + cache hit
    Expected: Valid results, second call uses cache
    Evidence: .sisyphus/evidence/task-8-geocoding-service.txt
  ```

  **Commit**: YES (group with 6, 7)

- [x] 9. Notification System Porting

  Read ALL files in `services/api/internal/notification/`. This is the most complex module.
  Create `services/cf-api/src/models/notification.ts` + `services/cf-worker/src/notifications/`.
  Port: NotificationService, NotificationRepository (D1), NotificationQueue (CF Queue producer), NotificationSender (Bot Service Binding), DLQProcessor (CF Queue consumer with retry).
  Replace Redis distributed locking with CF Queue guarantees. Replace PostgreSQL audit trail with D1.

  **Must NOT do**: Port Redis locking (CF Queues handle this), change Go code, use raw Promises.
  **Category**: `deep` | **Parallel**: Wave 2 with 6,7,8 | **Depends on**: 2,3,5 | **Blocks**: 10,14

  **QA Scenarios:**
  ```
  Scenario: Notification lifecycle end-to-end
    Tool: Bash
    Steps: Create notification → queue → process → deliver → confirm status
    Expected: Full lifecycle works: create → queue → process → deliver → confirm
    Evidence: .sisyphus/evidence/task-9-notification-lifecycle.txt

  Scenario: DLQ + retry logic
    Tool: Bash
    Steps: Fail delivery → retry with backoff → max retries → "failed" status
    Expected: Retry with backoff, then failed status after max attempts
    Evidence: .sisyphus/evidence/task-9-notification-retry.txt
  ```

  **Commit**: YES — `feat(cf): port notification system with queues and retry`

- [x] 10. API Worker — HTTP Endpoints

  Port `services/api/internal/httpserver/server.go` HTTP routes to Effect TS using `@effect/platform/HttpServer`.
  Create `services/cf-api/src/http/` with health, user, match, notification, geocoding endpoints.
  All endpoints use Effect Schema for request validation and response serialization.

  **Must NOT do**: Port gRPC (that's Task 11), change Go endpoints, use Express/Hono.
  **Category**: `deep` | **Parallel**: Wave 2 with 11 | **Depends on**: 4,5,6,7,8 | **Blocks**: 17

  **QA Scenarios:**
  ```
  Scenario: API health + CRUD endpoints
    Tool: Bash (curl)
    Steps: curl /health → 200, POST/GET/PUT /users → CRUD, 404 on missing
    Expected: All endpoints return correct status codes and shapes
    Evidence: .sisyphus/evidence/task-10-api-crud.txt

  Scenario: Invalid request validation
    Tool: Bash (curl)
    Steps: POST with missing fields → 400, invalid types → 400
    Expected: Field-level validation errors
    Evidence: .sisyphus/evidence/task-10-api-validation.txt
  ```

  **Commit**: YES (group with 11) — `feat(cf): port API HTTP endpoints and Service Binding server`

- [x] 11. API Worker — Service Binding Server

  Port `services/api/internal/grpcserver/` gRPC methods as Service Binding RPC handlers.
  Create `services/cf-api/src/bindings/` with typed handlers for User, Match, Notification, Health services.
  Each handler uses Effect Schema request/response types.

  **Must NOT do**: Implement gRPC, change gRPC server, use untyped arguments.
  **Category**: `deep` | **Parallel**: Wave 2 with 10 | **Depends on**: 2,4 | **Blocks**: 15

  **QA Scenarios:**
  ```
  Scenario: Service Binding methods respond correctly
    Tool: Bash (vitest)
    Steps: Test each binding method with typed requests
    Expected: All methods return typed responses, errors return correct types
    Evidence: .sisyphus/evidence/task-11-service-bindings.txt
  ```

  **Commit**: YES (group with 10)

- [ ] 10b. API Worker — GetPotentialMatches Algorithm (POST-MERGE GAP)

  **Why added**: Post-merge audit found Go `services/api/internal/services/match.go:51-180` has a full `GetPotentialMatches` algorithm with haversine distance, interest overlap scoring, and preferences filtering. The TS port completely lacks this. The Bot `/match` command depends on it.

  **What to do**:
  - Add `getPotentialMatches(userId, limit)` method to `MatchRepository` in `services/cf-api/src/models/match.ts`
  - Implement haversine distance calculation (reuse from `geocoding.ts` or inline)
  - Implement interest overlap scoring (Jaccard index or simple intersection count)
  - Implement preferences filtering (age range, gender, max distance)
  - Add `GET /users/:id/potential-matches?limit=` endpoint to `ApiRouter`
  - Return scored and sorted candidates

  **Reference Implementation**: `services/api/internal/services/match.go:51-180`

  **Must NOT do**: Change the scoring weights (Location 0.3, Interests 0.4, Preferences 0.3), skip any filter criteria.
  **Category**: `deep` | **Depends on**: 6,7,8 | **Blocks**: 12

  **QA Scenarios:**
  ```
  Scenario: Get potential matches for a user
    Tool: Bash (curl)
    Steps: GET /users/123/potential-matches?limit=5
    Expected: Returns array of scored users, excludes existing matches, respects preferences
    Evidence: .sisyphus/evidence/task-10b-potential-matches.txt
  ```

  **Commit**: YES — `feat(cf): add GetPotentialMatches algorithm`

- [ ] 9b. Notification Delivery Attempts Table (POST-MERGE GAP)

  **Why added**: Post-merge audit found Go has `notification_delivery_attempts` table (`migrations/000003_add_notifications.up.sql:44-53`) which is completely missing from D1. This table records every delivery attempt for audit trail.

  **What to do**:
  - Create `services/cf-api/migrations/0005_add_delivery_attempts.sql`
  - Add `notification_delivery_attempts` table with: id, notification_id, attempted_at, status, error_message, error_code, duration_ms, metadata
  - Add indexes: notification_id, status
  - Add `createAttempt()` method to `NotificationRepository`
  - Call `createAttempt()` from queue consumer before/after delivery

  **Reference Implementation**: `services/api/migrations/000003_add_notifications.up.sql:44-57`

  **Category**: `quick` | **Depends on**: 9 | **Blocks**: 14

  **Commit**: YES (group with 14) — `feat(cf): add notification delivery attempts`

- [x] 12. Bot Worker — Webhook Entry + Routing

  Port `services/bot/src/index.ts` and handlers from grammy polling to CF Worker webhook.
  Create `services/cf-bot/src/` with webhook entry, update router, session middleware (KV), activity middleware.
  Configure `wrangler.toml` with Telegram webhook URL, KV binding, Service Binding to API.

  **Must NOT do**: Use grammy polling, keep gRPC client, delete existing bot files.
  **Category**: `deep` | **Depends on**: 4 | **Blocks**: 13

  **QA Scenarios:**
  ```
  Scenario: Webhook receives and routes updates
    Tool: Bash (curl)
    Steps: POST mock Telegram update → routed to correct handler
    Expected: 200, update processed, correct handler called
    Evidence: .sisyphus/evidence/task-12-webhook-routing.txt

  Scenario: Invalid webhook requests rejected
    Tool: Bash (curl)
    Steps: POST without secret → 401, wrong secret → 401, GET → 405
    Expected: Correct error status codes
    Evidence: .sisyphus/evidence/task-12-webhook-auth.txt
  ```

  **Commit**: YES (group with 13)

- [ ] 13. Bot Worker — Handlers + Conversations Porting

  Port all handlers (start, help, profile, match, matches, settings) and conversations (editBio, editAge, editName, editGender, editInterests, editLocation).
  All handlers use Effect for error handling, Service Binding client for API calls.
  Port grammy conversation pattern to Effect-based conversation flow.

  **Must NOT do**: Use grammy conversations directly, skip any handler, change handler behavior.
  **Category**: `deep` | **Depends on**: 12 | **Blocks**: 17

  **QA Scenarios:**
  ```
  Scenario: /start handler + profile conversation
    Tool: Bash (vitest)
    Steps: /start → welcome + user creation. Profile edit → conversation flow.
    Expected: Welcome message, user created, conversations work end-to-end
    Evidence: .sisyphus/evidence/task-13-handlers.txt
  ```

  **Commit**: YES (group with 12) — `feat(cf): port bot handlers and conversations`

- [x] 14. Worker — Cron Triggers + Queue Consumers

  Port `services/worker/internal/jobs/` to CF Cron Triggers + Queue consumers.
  Create reengagement cron, DLQ processor cron, notification queue consumer, retry queue consumer.
  Configure `wrangler.toml` with cron triggers and queue bindings.

  **Must NOT do**: Create long-running process, use Redis, skip DLQ logic.
  **Category**: `deep` | **Depends on**: 9,4 | **Blocks**: 17

  **QA Scenarios:**
  ```
  Scenario: Reengagement cron + queue processing
    Tool: Bash (wrangler)
    Steps: Trigger cron → API called → messages sent. Enqueue message → consumer processes.
    Expected: Cron fires, queue messages consumed, retries work
    Evidence: .sisyphus/evidence/task-14-cron-queue.txt
  ```

  **Commit**: YES — `feat(cf): port worker cron triggers and queue consumers`

- [ ] 15. Bot Worker — gRPC → Service Binding Client Migration

  Replace `services/bot/src/grpc/` with `services/cf-bot/src/bindings/api-client.ts`.
  All handlers updated to use Service Binding client instead of gRPC.
  Effect Layer for typed API calls.

  **Must NOT do**: Keep gRPC imports, use untyped fetch calls, delete gRPC files yet.
  **Category**: `deep` | **Depends on**: 11,4 | **Blocks**: 17

  **QA Scenarios:**
  ```
  Scenario: Service Binding client calls API correctly + no gRPC imports
    Tool: Bash (vitest + grep)
    Steps: Test each API method. grep for gRPC imports → zero found.
    Expected: All methods work, zero gRPC references
    Evidence: .sisyphus/evidence/task-15-binding-client.txt
  ```

  **Commit**: YES — `feat(cf): replace gRPC with Service Binding client in bot`

- [ ] 16. KV Cache Layer (Replacing Redis)

  Create `packages/cf-shared/src/kv/` with generic KV cache (TTL support), session store, and geocoding cache.
  All entries must have TTL. Accept eventual consistency for KV.

  **Must NOT do**: Make KV strongly consistent, use Redis patterns, skip TTL.
  **Category**: `quick` | **Depends on**: 4 | **Blocks**: 10

  **QA Scenarios:**
  ```
  Scenario: Cache + session KV works
    Tool: Bash (vitest)
    Steps: Store+retrieve+expire. Session save+get+update.
    Expected: Cache expires, sessions persist correctly
    Evidence: .sisyphus/evidence/task-16-kv-cache.txt
  ```

  **Commit**: YES — `feat(cf): add KV cache, session, and geo-cache layers`

- [x] 17. End-to-End Integration Testing

  Create cross-service integration tests: Bot→API→D1, Cron→Queue→API, full match flow.
  Test Service Binding communication, D1 operations across services, Queue flow, KV session persistence.
  Mock all external calls (Telegram API, geocoding API).

  **Must NOT do**: Use live Telegram API, test against production D1, skip cross-service tests.
  **Category**: `deep` | **Depends on**: 10,12,13,14,15 | **Blocks**: 18

  **QA Scenarios:**
  ```
  Scenario: Full match flow + error handling
    Tool: Bash (wrangler dev + vitest)
    Steps: /match webhook → API → D1 → Queue → Bot delivery. Simulate errors.
    Expected: Complete flow works, errors handled by Effect
    Evidence: .sisyphus/evidence/task-17-e2e.txt
  ```

  **Commit**: YES — `feat(cf): end-to-end integration tests`

- [x] 18. Cutover Deployment Plan

  Create `docs/cutover-plan.md` documenting deployment sequence for each service.
  Include rollback procedures with kill switches (env var toggles).
  Pre-deployment, deployment, post-deployment, and cleanup checklists.

  **Must NOT do**: Delete Go services, include feature changes, skip rollback procedures.
  **Category**: `writing` | **Depends on**: 17 | **Blocks**: 19

  **QA Scenarios:**
  ```
  Scenario: Cutover plan covers all services + rollback
    Tool: Bash (file verification)
    Steps: Verify API, Bot, Worker cutover + rollback for each. Checklists complete.
    Expected: All 3 services covered with rollback and kill switches
    Evidence: .sisyphus/evidence/task-18-cutover-plan.txt
  ```

  **Commit**: YES — `docs(cf): cutover deployment plan`

- [x] 19. Go Service Deletion + Cleanup

  ONLY after full cutover verification. Delete `services/api/` (Go), `services/worker/` (Go), bot gRPC code, protobuf contracts, Go workspace files, Docker files.
  Verify `services/cf-*` Workers build and deploy cleanly without Go references.
  Run full integration tests.

  **Must NOT do**: Delete before cutover verified. Delete cf-shared or cf-* services. Delete .env.
  **Category**: `quick` | **Depends on**: 18 | **Blocks**: F1-F4

  **QA Scenarios:**
  ```
  Scenario: No Go/gRPC/Docker references remain + clean build
    Tool: Bash
    Steps: grep for gRPC/proto/docker → zero. pnpm build + vitest + tsc --noEmit.
    Expected: Zero legacy references, clean build, all tests pass
    Evidence: .sisyphus/evidence/task-19-cleanup-verification.txt
  ```

  **Commit**: YES — `chore(cf): remove Go services and Docker configuration`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read plan end-to-end. Verify all Must Have present, all Must NOT Have absent. Check evidence files.

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run vitest + tsc --noEmit + eslint. Check for: raw Promises, Zod, gRPC references, untyped code.

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Deploy all Workers to staging. Execute ALL QA scenarios. Test cross-service integration.

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify 1:1 porting — no missing features, no scope creep, no "nice-to-have" refactors.

---

## Commit Strategy

| Wave | Commit Message | Key Files |
|------|---------------|-----------|
| 1 | `feat(cf): scaffold project, contracts, schema, and config` | All Wave 1 files |
| 2a | `feat(cf): port user, match, geocoding models` | services/cf-api/src/models/* |
| 2b | `feat(cf): port notification system with queues and retry` | services/cf-api/src/models/notification*, services/cf-worker/src/notifications/* |
| 2c | `feat(cf): port API HTTP endpoints and Service Binding server` | services/cf-api/src/http/*, services/cf-api/src/bindings/* |
| 3 | `feat(cf): port bot, worker, and KV cache` | services/cf-bot/*, services/cf-worker/*, packages/cf-shared/src/kv/* |
| 4 | `feat(cf): integration tests, cutover plan, and cleanup` | tests/*, docs/*, deleted Go files |

---

## Success Criteria

### Verification Commands
```bash
wrangler deploy --dry-run  # All Workers validate
vitest run                 # All tests pass
tsc --noEmit              # No type errors
wrangler d1 execute meetsmatch-db --command="SELECT count(*) FROM users"
```

### Final Checklist
- [ ] All "Must Have" present (Effect, D1, Service Bindings, webhooks, toggles)
- [ ] All "Must NOT Have" absent (gRPC, Redis, Docker, feature changes, raw Promises, Zod)
- [ ] All tests pass
- [ ] Go services deletable without functional loss
- [ ] `wrangler deploy` succeeds for all Workers