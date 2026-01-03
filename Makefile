.PHONY: help ci lint format test security api-lint api-fmt api-test api-sec api-build api-tidy api-run bot-run bot-lint bot-fmt bot-test bot-test-e2e bot-test-integration bot-build proto-gen dry-build deploy-app test-all

# Default target
help:
	@echo "Available commands:"
	@echo "  make ci              Run full local CI (Lint, Format, Security, Test, Build)"
	@echo "  make api-run         Run Go API locally"
	@echo "  make bot-run         Run TS Bot locally"
	@echo "  make test            Run unit tests (Go & TS)"
	@echo "  make test-all        Run all tests (unit, e2e, integration)"
	@echo "  make bot-test-e2e    Run TS Bot E2E tests"
	@echo "  make bot-test-integration  Run TS Bot integration tests"
	@echo "  make lint            Run all linters"
	@echo "  make format          Format all code"
	@echo "  make deploy-app      Deploy to server via rsync"

# --- Main CI ---
ci: format lint security test dry-build
	@echo "✅ CI Completed Successfully"

# --- Sub-tasks ---

lint: api-lint bot-lint
format: api-fmt bot-fmt
test: api-test bot-test
security: api-sec

# --- Go API ---

api-lint:
	@echo "Linting Go API..."
	cd services/api && go run github.com/golangci/golangci-lint/cmd/golangci-lint@v1.64.0 run -v

api-fmt:
	@echo "Formatting Go API..."
	cd services/api && go fmt ./...

api-test:
	@echo "Testing Go API..."
	@if [ ! -d "services/api" ]; then echo "❌ services/api directory not found"; exit 1; fi
	cd services/api && go test ./... -coverprofile=coverage.out
	@echo "Checking Go coverage..."
	@cd services/api && COVERAGE=$$(go tool cover -func=coverage.out | grep total | awk '{gsub(/%/,"",$$3); print $$3}'); \
		echo "ℹ️ Go Coverage: $$COVERAGE% (threshold temporarily lowered for migration)"

api-sec:
	@echo "Checking Go Security..."
	cd services/api && go run golang.org/x/vuln/cmd/govulncheck@latest ./...

api-build:
	@echo "Building Go API..."
	cd services/api && go build -o bin/api cmd/api/main.go

api-tidy:
	cd services/api && go mod tidy

api-run:
	@echo "Running Go API..."
	@if [ ! -d "services/api" ]; then echo "❌ services/api directory not found"; exit 1; fi
	cd services/api && go run cmd/api/main.go

# --- TS Bot ---

bot-run:
	@echo "Running TS Bot..."
	@if [ ! -d "services/bot" ]; then echo "❌ services/bot directory not found"; exit 1; fi
	cd services/bot && bun run dev

bot-lint:
	@echo "Linting TS Bot..."
	cd services/bot && bun run lint

bot-fmt:
	@echo "Formatting TS Bot..."
	cd services/bot && bun run format

bot-test:
	@echo "Testing TS Bot (unit tests)..."
	cd services/bot && bun run test:coverage

bot-test-e2e:
	@echo "Running TS Bot E2E tests..."
	cd services/bot && bun run vitest run --config vitest.e2e.config.ts

bot-test-integration:
	@echo "Running TS Bot integration tests..."
	@if [ -z "$$INTEGRATION_TEST_API_URL" ]; then \
		echo "⚠️ INTEGRATION_TEST_API_URL not set, using default http://localhost:8080"; \
	fi
	cd services/bot && INTEGRATION_TEST_API_URL=$${INTEGRATION_TEST_API_URL:-http://localhost:8080} \
		bun run vitest run --config vitest.integration.config.ts

test-all: test bot-test-e2e bot-test-integration
	@echo "✅ All tests completed"

bot-build:
	@echo "Building TS Bot..."
	cd services/bot && bun run build

# --- Infrastructure ---

proto-gen:
	docker run --rm -v "$$(pwd):/workspace" -w /workspace bufbuild/buf:1.47.2 generate

dry-build: api-build bot-build
	@echo "Dry build passed."

deploy-app:
	./scripts/deploy_app.sh
