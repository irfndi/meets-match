.PHONY: help dev test lint format deploy deploy-api deploy-bot deploy-worker db-studio clean

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
	@echo "  make db-studio      Open D1 local studio"
	@echo "  make clean          Remove build artifacts and dependencies"

# --- Development ---

dev:
	@echo "Starting all Workers in parallel..."
	@pnpm -w dev:api & pnpm -w dev:bot & pnpm -w dev:worker & wait

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

db-studio:
	@echo "Opening D1 local studio..."
	cd services/cf-api && npx wrangler d1 execute meetsmatch-db --local --command="SELECT 'D1 local DB ready';"

# --- Cleanup ---

clean:
	@echo "Cleaning build artifacts..."
	rm -rf .wrangler/ dist/ node_modules/ services/*/node_modules/ packages/*/node_modules/
	@echo "Clean complete."
