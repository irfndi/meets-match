# Repository Guidelines

## Project Structure & Module Organization
Core Go service lives in `cmd/bot` with shared logic under `internal/` packages such as `services`, `bothandler`, `database`, `telemetry`, and `monitoring`. Automation scripts stay in `scripts/`, deployment assets in `deployments/`, and SQL migrations in `migrations/`. JavaScript workspaces are in `web/`: `web/api` contains the Bun + Express API, while `web/frontend` holds the Vite + React client. Coverage helpers live in `test/`.

## Build, Test, and Development Commands
- `make build` / `make run`: compile or launch the Go bot.
- `make test`, `make test-unit`, `make test-integration`: execute Go suites; `make test-coverage` and `make test-coverage-check` enforce the 60% floor.
- `make lint`, `make fmt`, `make vet`: run `golangci-lint`, `gofmt -s`, and `go vet`.
- In `web/api`: `bun install`, `bun run dev`, `bun run build`, `bun run test`.
- In `web/frontend`: `bun install`, `bun run dev`, `bun run build`, `bun run test:coverage`.

## Coding Style & Naming Conventions
Go code must remain `gofmt` clean, using tabs, lowercase package names, and exported identifiers with doc comments. Group related functionality inside the existing package boundaries (`internal/services`, `middleware`, `telemetry`). Run `make lint` before opening a PR. TypeScript projects rely on `oxlint`; run `bun run lint` or `lint:fix` and keep PascalCase React components with camelCase hooks and utilities. Follow the established folder casing and feature-based layout.

## Testing Guidelines
Standard library tests power the Go service; integration cases start with `TestI` so Make targets can filter them. Maintain or raise the 60% coverage gate when touching backend code. Vitest covers both JavaScript packages—use `bun run test:ui` for interactive debugging. API contract checks should live under `web/api/src/__tests__`, and UI stories under `web/frontend/src/__tests__` or feature-specific folders.

## Commit & Pull Request Guidelines
Commits use Conventional Commit syntax (`feat(scope):`, `refactor:`, `security:`) and should stay focused. PRs need a concise summary, linked issue or ticket, screenshots or terminal output when UX or CLI changes occur, and a checklist of commands executed (tests, lint, coverage). Request reviewers who own the affected area (`internal`, `web/api`, `web/frontend`) and call out breaking changes early.

## Security & Configuration Tips
Keep secrets in a local `.env` consumed by `make run`, Docker targets, and Bun scripts. Never commit credentials or AI config files; `.claude.json` is ignored but double-check. Reuse `deployments/docker` and `deployments/nginx` as the source of truth for configuration and update `SECURITY.md` whenever you harden an endpoint or change permissions.
