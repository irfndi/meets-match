.PHONY: help dev test lint format deploy deploy-api deploy-bot deploy-worker db-check clean

# Default target
help:
	@echo "Available commands:"
	@echo "  make dev            Run all 3 Workers locally in parallel"
	@echo "  make dev-api        Run cf-api Worker locally"
	@echo "  make dev-bot        Run cf-bot Worker locally"
	@echo "  make dev-worker     Run cf-worker Worker locally"
	@echo "  make test           Run all tests (vitest)"
	@echo "  make lint           Type-check all packages (tsc --build --force)"
	@echo "  make format         Format all code (prettier)"
	@echo "  make deploy         Deploy all 3 Workers"
	@echo "  make deploy-api     Deploy cf-api Worker"
	@echo "  make deploy-bot     Deploy cf-bot Worker"
	@echo "  make deploy-worker  Deploy cf-worker Worker"
	@echo "  make db-check       Check D1 local connectivity"
	@echo "  make clean          Remove build artifacts and dependencies"

# --- Development ---

dev:
	@echo "Starting all Workers in parallel..."
	@pnpm -w dev:api & PID1=$$!; pnpm -w dev:bot & PID2=$$!; pnpm -w dev:worker & PID3=$$!; FAIL=0; wait $$PID1 || FAIL=1; wait $$PID2 || FAIL=1; wait $$PID3 || FAIL=1; exit $$FAIL

dev-api:
	@echo "Starting cf-api Worker..."
	@pnpm -w dev:api

dev-bot:
	@echo "Starting cf-bot Worker..."
	@pnpm -w dev:bot

dev-worker:
	@echo "Starting cf-worker Worker..."
	@pnpm -w dev:worker

# --- Quality ---

test:
	@echo "Running tests..."
	pnpm test

lint:
	@echo "Type-checking all packages..."
	pnpm lint

format:
	@echo "Formatting code..."
	pnpm format

# --- Deploy ---

deploy: deploy-api deploy-bot deploy-worker

deploy-api:
	@echo "Deploying cf-api Worker..."
	pnpm -w deploy:api

deploy-bot:
	@echo "Deploying cf-bot Worker..."
	pnpm -w deploy:bot

deploy-worker:
	@echo "Deploying cf-worker Worker..."
	pnpm -w deploy:worker

# --- Database ---

db-check:
	@echo "Checking D1 local connectivity..."
	cd services/cf-api && pnpm exec wrangler d1 execute meetsmatch-db --local --command="SELECT 'D1 local DB ready';"

# --- Cleanup ---

clean:
	@echo "Cleaning build artifacts..."
	rm -rf .wrangler/ dist/ node_modules/ services/*/node_modules/ packages/*/node_modules/
	@echo "Clean complete."
