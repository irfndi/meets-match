# Makefile for the MeetsMatch Rust Worker Project

# Define shell for consistency
SHELL := /bin/bash

# Define script directory
SCRIPT_DIR := ./scripts

.PHONY: all build check test ci deploy-dev deploy-staging deploy-prod setup-dev-env clean help

all: build

help:
	@echo "MeetsMatch Rust Worker Makefile"
	@echo "----------------------------------"
	@echo "Available targets:"
	@echo "  make all             - Build the project (default)."
	@echo "  make help            - Show this help message."
	@echo "  make build           - Build the Rust Wasm worker."
	@echo "  make check           - Run format check (rustfmt) and linter (clippy)."
	@echo "  make test            - Run Rust tests."
	@echo "  make ci              - Run local CI checks (equivalent to 'make check test')."
	@echo "  make deploy-dev      - Deploy to the development environment."
	@echo "  make deploy-staging  - Deploy to the staging environment."
	@echo "  make deploy-prod     - Deploy to the production environment."
	@echo "  make setup-dev-env   - Run the development environment setup script."
	@echo "  make clean           - Remove build artifacts (worker/ and target/ directories)."

build:
	@echo "Building worker..."
	@$(SCRIPT_DIR)/build.sh

check:
	@echo "Running checks (format and lint)..."
	@$(SCRIPT_DIR)/check.sh

test:
	@echo "Running tests..."
	@$(SCRIPT_DIR)/test.sh

# CI target: runs checks and tests, similar to what the GitHub Actions CI would do.
ci: check test
	@echo "Local CI checks passed."

deploy-dev:
	@echo "Deploying to Development environment..."
	@$(SCRIPT_DIR)/deploy.sh dev

deploy-staging:
	@echo "Deploying to Staging environment..."
	@$(SCRIPT_DIR)/deploy.sh staging

deploy-prod:
	@echo "Deploying to Production environment..."
	@$(SCRIPT_DIR)/deploy.sh prod

setup-dev-env:
	@echo "Running development environment setup script..."
	@$(SCRIPT_DIR)/setup_dev_env.sh

clean:
	@echo "Cleaning build artifacts..."
	rm -rf worker
	rm -rf target
	@echo "Clean complete."

# Default target if just 'make' is called
default: all
