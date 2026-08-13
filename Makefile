.PHONY: help dev test lint format format-check typecheck deploy deploy-dev deploy-prod plan plan-dev db-check clean clean-state

# Default target
help:
	@echo "Available commands:"
	@echo "  make dev            Run all Workers locally (alchemy dev)"
	@echo "  make test           Run all tests (vitest)"
	@echo "  make lint           Lint all packages (oxlint)"
	@echo "  make format         Format all code (oxfmt)"
	@echo "  make format-check   Verify formatting (oxfmt check)"
	@echo "  make typecheck      Type-check the entire monorepo (tsc -b)"
	@echo "  make deploy         Quality gates + deploy dev stage (alchemy)"
	@echo "  make deploy-dev     Deploy dev stage (alchemy)"
	@echo "  make deploy-prod    Deploy prod stage with resource adoption (alchemy --adopt)"
	@echo "  make plan           Preview prod changes (alchemy plan)"
	@echo "  make plan-dev       Preview dev changes (alchemy plan)"
	@echo "  make db-check       Check D1 local connectivity"
	@echo "  make clean          Remove build artifacts and dependencies"
	@echo "  make clean-state    Remove local Wrangler state"

# --- Development ---

dev:
	@echo "Starting all Workers via alchemy dev..."
	pnpm dev

# --- Quality ---

test:
	@echo "Running tests..."
	pnpm test

lint:
	@echo "Linting all packages (oxlint)..."
	pnpm lint

format:
	@echo "Formatting code (oxfmt)..."
	pnpm format

format-check:
	@echo "Checking formatting (oxfmt)..."
	pnpm format:check

typecheck:
	@echo "Type-checking the entire monorepo..."
	pnpm typecheck:safe

# --- Deploy ---

# Run quality gates serially before deploying so `make -j deploy` cannot
# start a deploy before checks finish. Deploys go through alchemy, which
# builds, applies D1 migrations, and deploys every Worker in the stack.
deploy:
	@$(MAKE) test
	@$(MAKE) lint
	@$(MAKE) typecheck
	@$(MAKE) deploy-dev

deploy-dev:
	@echo "Deploying dev stage (alchemy)..."
	pnpm deploy:dev

deploy-prod:
	@echo "Deploying prod stage (alchemy, adopting existing resources)..."
	pnpm deploy:prod

plan:
	@echo "Previewing prod changes (alchemy plan)..."
	pnpm plan

plan-dev:
	@echo "Previewing dev changes (alchemy plan)..."
	pnpm plan:dev

# --- Database ---

# Local D1 connectivity check. `wrangler d1 execute --local` uses the
# cf-api wrangler.toml (kept for D1 dev tooling only — deploys go through
# alchemy).
db-check:
	@echo "Checking D1 local connectivity..."
	cd services/cf-api && pnpm exec wrangler d1 execute meetsmatch-db --local --command="SELECT 'D1 local DB ready';"

# --- Cleanup ---

clean:
	@echo "Cleaning build artifacts..."
	rm -rf dist/ node_modules/ services/*/node_modules/ packages/*/node_modules/
	@echo "Clean complete."

# Remove local Wrangler state (D1/KV dev data) — separate from `clean` so
# routine cleanup does not wipe local dev databases.
clean-state:
	@echo "Removing local Wrangler state (D1/KV)..."
	rm -rf .wrangler/ services/*/.wrangler/
	@echo "State clean complete."
