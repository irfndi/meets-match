.PHONY: help run install test lint format migrate makemigrations clean

# Default target
help:
	@echo "Available commands:"
	@echo "  make run             Run the bot (using uv)"
	@echo "  make install         Install/Update dependencies (usage: make install pkg=\"package_name\")"
	@echo "  make test            Run tests"
	@echo "  make lint            Run linters (ruff, mypy)"
	@echo "  make format          Format code (ruff)"
	@echo "  make migrate         Apply database migrations"
	@echo "  make makemigrations  Create a new migration (usage: make makemigrations msg=\"message\")"
	@echo "  make lock            Update uv.lock"
	@echo "  make clean           Remove temporary files"

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

lint:
	uv run ruff check .
	uv run mypy src

format:
	uv run ruff format .
	uv run ruff check --fix .

migrate:
	uv run alembic upgrade head

makemigrations:
	uv run alembic revision --autogenerate -m "$(msg)"

lock:
	uv lock

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type d -name ".pytest_cache" -exec rm -rf {} +
	find . -type d -name ".ruff_cache" -exec rm -rf {} +
	find . -type d -name ".mypy_cache" -exec rm -rf {} +
