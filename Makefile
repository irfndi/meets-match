# Makefile for Telegram Bot Service
# Provides standardized commands for testing, coverage, and deployment

.PHONY: help test test-unit test-integration test-coverage test-coverage-html clean build run docker-build docker-run lint fmt vet deps

# Default target
help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod
GOFMT=gofmt
GOVET=$(GOCMD) vet

# Build parameters
BINARY_NAME=telegram-bot
BINARY_PATH=./cmd/bot
COVERAGE_FILE=coverage.out
COVERAGE_HTML=coverage.html
COVERAGE_THRESHOLD=60

# Test parameters
TEST_TIMEOUT=30m
TEST_PACKAGES=./...
UNIT_TEST_PATTERN=^Test[^I].*
INTEGRATION_TEST_PATTERN=^TestI.*|.*Integration.*

# Dependencies
deps: ## Download and install dependencies
	$(GOMOD) download
	$(GOMOD) tidy

# Build targets
build: ## Build the application
	$(GOBUILD) -o $(BINARY_NAME) $(BINARY_PATH)

build-linux: ## Build for Linux
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 $(GOBUILD) -o $(BINARY_NAME)-linux $(BINARY_PATH)

build-windows: ## Build for Windows
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 $(GOBUILD) -o $(BINARY_NAME)-windows.exe $(BINARY_PATH)

build-darwin: ## Build for macOS
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 $(GOBUILD) -o $(BINARY_NAME)-darwin $(BINARY_PATH)

build-all: build-linux build-windows build-darwin ## Build for all platforms

# Test targets
test: ## Run all tests
	$(GOTEST) -v -race -timeout $(TEST_TIMEOUT) $(TEST_PACKAGES)

test-unit: ## Run unit tests only
	$(GOTEST) -v -race -timeout $(TEST_TIMEOUT) -run "$(UNIT_TEST_PATTERN)" $(TEST_PACKAGES)

test-integration: ## Run integration tests only
	$(GOTEST) -v -race -timeout $(TEST_TIMEOUT) -run "$(INTEGRATION_TEST_PATTERN)" $(TEST_PACKAGES)

test-short: ## Run tests in short mode (skip integration tests)
	$(GOTEST) -v -race -short -timeout 10m $(TEST_PACKAGES)

# Coverage targets
test-coverage: ## Run tests with coverage
	$(GOTEST) -v -race -coverprofile=$(COVERAGE_FILE) -covermode=atomic -timeout $(TEST_TIMEOUT) $(TEST_PACKAGES)
	$(GOCMD) tool cover -func=$(COVERAGE_FILE)

test-coverage-html: test-coverage ## Generate HTML coverage report
	$(GOCMD) tool cover -html=$(COVERAGE_FILE) -o $(COVERAGE_HTML)
	@echo "Coverage report generated: $(COVERAGE_HTML)"

test-coverage-check: test-coverage ## Check if coverage meets threshold
	@COVERAGE=$$($(GOCMD) tool cover -func=$(COVERAGE_FILE) | grep total | awk '{print $$3}' | sed 's/%//'); \
	echo "Total coverage: $$COVERAGE%"; \
	if [ "$$COVERAGE" -lt "$(COVERAGE_THRESHOLD)" ]; then \
		echo "❌ Coverage $$COVERAGE% is below threshold $(COVERAGE_THRESHOLD)%"; \
		exit 1; \
	else \
		echo "✅ Coverage $$COVERAGE% meets threshold $(COVERAGE_THRESHOLD)%"; \
	fi

# Coverage with platform-specific scripts
test-coverage-script: ## Run coverage using platform-specific script
ifeq ($(OS),Windows_NT)
	powershell -ExecutionPolicy Bypass -File test/coverage.ps1 -Threshold $(COVERAGE_THRESHOLD)
else
	bash test/coverage.sh
endif

# Code quality targets
lint: ## Run linter (requires golangci-lint)
	golangci-lint run

fmt: ## Format Go code
	$(GOFMT) -s -w .

fmt-check: ## Check if code is formatted
	@if [ "$$($(GOFMT) -s -d . | wc -l)" -gt 0 ]; then \
		echo "❌ Code is not formatted. Run 'make fmt' to fix."; \
		$(GOFMT) -s -d .; \
		exit 1; \
	else \
		echo "✅ Code is properly formatted."; \
	fi

vet: ## Run go vet
	$(GOVET) $(TEST_PACKAGES)

# Security targets
sec: ## Run security scanner (requires gosec)
	gosec ./...

# Benchmark targets
bench: ## Run benchmarks
	$(GOTEST) -bench=. -benchmem $(TEST_PACKAGES)

bench-cpu: ## Run CPU profiling benchmarks
	$(GOTEST) -bench=. -benchmem -cpuprofile=cpu.prof $(TEST_PACKAGES)

bench-mem: ## Run memory profiling benchmarks
	$(GOTEST) -bench=. -benchmem -memprofile=mem.prof $(TEST_PACKAGES)

# Run targets
run: ## Run the application
	$(GOCMD) run $(BINARY_PATH)/main.go

run-dev: ## Run with development environment
	GIN_MODE=debug $(GOCMD) run $(BINARY_PATH)/main.go

# Docker targets
docker-build: ## Build Docker image
	docker build -t telegram-bot:latest .

docker-run: ## Run Docker container
	docker run --rm -p 8081:8081 --env-file .env telegram-bot:latest

docker-compose-up: ## Start services with docker-compose
	docker-compose up -d

docker-compose-down: ## Stop services with docker-compose
	docker-compose down

# Database targets
db-migrate: ## Run database migrations
	$(GOCMD) run cmd/migrate/main.go

db-seed: ## Seed database with test data
	$(GOCMD) run cmd/seed/main.go

db-reset: ## Reset database (drop and recreate)
	$(GOCMD) run cmd/reset/main.go

# Clean targets
clean: ## Clean build artifacts and test files
	$(GOCLEAN)
	rm -f $(BINARY_NAME) $(BINARY_NAME)-*
	rm -f $(COVERAGE_FILE) $(COVERAGE_HTML)
	rm -f *.prof
	rm -rf test/reports/*

clean-deps: ## Clean module cache
	$(GOCMD) clean -modcache

# CI/CD targets
ci-test: deps fmt-check vet test-coverage-check ## Run CI test pipeline
	@echo "✅ All CI checks passed!"

ci-build: ci-test build ## Run CI build pipeline
	@echo "✅ CI build completed successfully!"

ci-integration: ## Run integration tests for CI
	$(GOTEST) -v -race -timeout $(TEST_TIMEOUT) -tags=integration $(TEST_PACKAGES)

# Development targets
dev-setup: deps ## Setup development environment
	@echo "Installing development tools..."
	$(GOCMD) install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	$(GOCMD) install github.com/securecodewarrior/gosec/v2/cmd/gosec@latest
	@echo "✅ Development environment setup complete!"

dev-test: ## Run tests in development mode with file watching
	@echo "Running tests in watch mode..."
	@while true; do \
		clear; \
		echo "Running tests..."; \
		$(GOTEST) -v -short $(TEST_PACKAGES) || true; \
		echo "Waiting for changes..."; \
		sleep 2; \
	done

# Documentation targets
docs: ## Generate documentation
	godoc -http=:6060

# Release targets
release-check: ci-test ## Check if ready for release
	@echo "✅ Release checks passed!"

release-build: release-check build-all ## Build release artifacts
	@echo "✅ Release build completed!"

# Help target (default)
default: help