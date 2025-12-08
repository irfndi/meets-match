.PHONY: help run install test lint format migrate makemigrations clean

# Default target
help:
	@echo "Available commands:"
	@echo "  make run             Run the bot (using uv)"
	@echo "  make install         Install/Update dependencies (usage: make install pkg=\"package_name\")"
	@echo "  make test            Run tests"
	@echo "  make lint            Run linters (ruff, ty)"
	@echo "  make format          Format code (ruff)"
	@echo "  make migrate         Apply database migrations"
	@echo "  make makemigrations  Create a new migration (usage: make makemigrations msg=\"message\")"
	@echo "  make lock            Update uv.lock"
	@echo "  make clean           Remove temporary files"
	@echo "  make deploy-monitor  Deploy Beszel Agent to VPS"

run:
	uv run python main.py

install:
ifdef pkg
	uv add $(pkg)
else
	uv sync
endif

test:
	uv run pytest

test-file:
	uv run pytest $(file)

lint:
	uv run ruff check .
	uv run ty check

format:
	uv run ruff format .
	uv run ruff check --fix .

migrate:
	uv run alembic upgrade head

makemigrations:
ifndef msg
	@echo "Usage: make makemigrations msg=\"Your migration message\"" >&2
	@exit 1
endif
	uv run alembic revision --autogenerate -m "$(msg)"

lock:
	uv lock

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".ruff_cache" -exec rm -rf {} +

deploy-monitor:
	./scripts/deploy_beszel_agent.sh

deploy-app:
	./scripts/deploy_app.sh
