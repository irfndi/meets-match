.PHONY: help run install test lint format migrate makemigrations clean api-run bot-run proto-gen up down api-tidy contracts-tidy ci

# Default target
help:
	@echo "Available commands:"
	@echo "  make ci              Run full local CI (Lint, Format, Security, Test, Build)"
	@echo "  make up              Start all services (Docker Compose)"
	@echo "  make down            Stop all services"
	@echo "  make api-run         Run Go API locally"
	@echo "  make bot-run         Run TS Bot locally"
	@echo "  make test            Run all tests (Go & TS)"
	@echo "  make lint            Run all linters"
	@echo "  make format          Format all code"
	@echo ""
	@echo "Legacy (Python):"
	@echo "  make py-run          Run the python bot"
	@echo "  make py-test         Run python tests"

# --- Main CI ---
ci: format lint security test dry-build
	@echo "✅ CI Completed Successfully"

# --- Sub-tasks ---

lint: api-lint bot-lint py-lint
format: api-fmt bot-fmt py-fmt
test: api-test bot-test py-test
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
	cd services/api && go test ./... -coverprofile=coverage.out
	@echo "Checking Go coverage..."
	cd services/api && go tool cover -func=coverage.out | grep total | awk '{gsub(/%/,"",$$3); print (($$3+0 >= 60) ? "✅ Go Coverage Passed (" $$3 "%)" : "❌ Go Coverage Failed (" $$3 "%)")}'

api-sec:
	@echo "Checking Go Security..."
	cd services/api && go run golang.org/x/vuln/cmd/govulncheck@latest ./...

api-build:
	@echo "Building Go API..."
	cd services/api && go build -o bin/api cmd/api/main.go

api-tidy:
	cd services/api && go mod tidy

# --- TS Bot ---

bot-run:
	@echo "Running TS Bot..."
	cd services/bot && bun run dev

bot-lint:
	@echo "Linting TS Bot..."
	cd services/bot && bun run lint

bot-fmt:
	@echo "Formatting TS Bot..."
	cd services/bot && bun run format

bot-test:
	@echo "Testing TS Bot..."
	cd services/bot && bun run test:coverage

bot-build:
	@echo "Building TS Bot..."
	cd services/bot && bun run build

# --- Legacy Python ---

py-run:
	uv run python main.py

py-lint:
	uv run ruff check .
	uv run ty check

py-fmt:
	uv run ruff format .
	uv run ruff check --fix .

py-test:
	uv run pytest

# --- Infrastructure ---

up:
	docker-compose up --build -d

down:
	docker-compose down

proto-gen:
	docker run --rm -v "$$(pwd):/workspace" -w /workspace bufbuild/buf:1.47.2 generate

dry-build: api-build bot-build
	@echo "Dry build passed."

deploy-app:
	./scripts/deploy_app.sh
