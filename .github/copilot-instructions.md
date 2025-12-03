# Copilot Instructions for MeetMatch

## Project Overview

MeetMatch is an AI-powered Telegram matchmaking bot that helps users find and schedule meetups. The bot is built with Python and deployed as a Cloudflare Worker.

## Tech Stack

- **Language**: Python 3.10+
- **Framework**: python-telegram-bot v20.3+
- **Database**: Cloudflare D1 (SQLite-compatible)
- **Cache/Session**: Cloudflare KV
- **Object Storage**: Cloudflare R2 (optional)
- **Deployment**: Cloudflare Workers
- **Package Manager**: uv

## Project Structure

```
src/
├── bot/               # Telegram bot handlers and application logic
│   ├── handlers/      # Command and conversation handlers
│   └── middleware/    # Bot middleware
├── models/            # Database models and schemas
├── services/          # Business logic and service layer
├── utils/             # Helper functions and utilities
└── config.py          # Configuration loader using Pydantic

tests/                 # Unit and integration tests
scripts/               # Deployment and maintenance scripts
_docs_/                # Project documentation
```

## Development Commands

```bash
# Install dependencies (use uv)
uv venv .venv
source .venv/bin/activate
uv pip install -e ".[dev]"

# Linting
ruff check .

# Formatting
ruff format .

# Run tests with coverage (minimum 95% required)
pytest --cov=src --cov-report=term-missing --cov-fail-under=95

# Run specific tests
pytest tests/test_file.py -v

# Type checking
mypy src/
```

## Code Conventions

### Type Annotations
- Use Python 3.10+ type annotation syntax
- All functions must have type hints for parameters and return values
- Use `Optional[T]` for nullable values
- Strict mypy validation is enforced

### Error Handling
- Use custom exceptions defined in the project
- Log errors with context using structlog
- Always provide meaningful error messages

### Telegram Bot Specific
- Use PTB's (python-telegram-bot) ContextTypes
- Isolate handler logic in `/src/bot/handlers`
- Follow async/await patterns for all handlers

### Code Style
- Line length: 120 characters (configured in ruff)
- Use `ruff` for linting and formatting
- Follow PEP 8 conventions
- Imports are sorted using isort (via ruff)

## Testing Requirements

- Maintain >95% code coverage (enforced by CI)
- Use pytest for all tests
- Use pytest-asyncio for async test functions
- Place tests in the `tests/` directory
- Follow existing test patterns in the repository
- Mock external services (Telegram API, Cloudflare services)

## Configuration

- Environment variables are loaded via Pydantic Settings
- Use `.env` file for local development
- Use `.dev.vars` for local Cloudflare Worker secrets (gitignored)
- Never commit secrets or tokens

## Commit Guidelines

- Follow [Conventional Commits](https://www.conventionalcommits.org) specification
- Example formats:
  - `feat: add new matching algorithm`
  - `fix: resolve race condition in profile update`
  - `docs: update API documentation`
  - `test: add unit tests for matching service`

## CI/CD

- GitHub Actions runs on all pushes and pull requests
- Tests run on Python 3.10, 3.11, and 3.12
- Codecov tracks coverage reports
- Deployment to Cloudflare Workers happens on push to main branch

## Key Dependencies

- `python-telegram-bot>=20.3`: Telegram Bot API wrapper
- `pydantic>=2.4.2`: Data validation and settings management
- `pydantic-settings>=2.0.3`: Environment settings
- `structlog>=23.1.0`: Structured logging
- `pytest>=7.4.0`: Testing framework
- `ruff>=0.1.5`: Linter and formatter
