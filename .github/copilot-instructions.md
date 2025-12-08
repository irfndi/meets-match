# Copilot Instructions for MeetMatch

## Project Overview

MeetMatch is an AI-powered Telegram matchmaking bot built with Python 3.13+ that helps users find and connect with compatible matches based on interests, location, and preferences.

## Tech Stack

- **Python 3.13+** with type hints
- **uv** - Fast Python package installer and resolver (use `uv sync`, `uv run`, `uv add`)
- **python-telegram-bot v21+** - Telegram Bot API with async handlers
- **SQLAlchemy 2.0+** - ORM for PostgreSQL
- **Pydantic 2.x** - Data validation and models
- **Redis** - Caching and session management
- **FastAPI** - API endpoints
- **Alembic** - Database migrations
- **structlog** - Structured logging

## Code Style and Conventions

### Python Standards
- Use Python 3.13+ features and type hints throughout
- Follow PEP 8 style guidelines
- Use Ruff for linting (`uv run ruff check .`) and formatting (`uv run ruff format .`)
- Line length: 120 characters
- Use docstrings in Google style format for all public functions and classes

### Imports
- Use absolute imports from `src` package (e.g., `from src.models.user import User`)
- Group imports: standard library, third-party, local (handled by Ruff isort)
- Known first-party package: `meetsmatch`

### Error Handling
- Use custom exceptions from `src.utils.errors` (ValidationError, NotFoundError)
- Always add explanatory comments to empty except blocks
- Log errors using structlog logger from `src.utils.logging`

### Models
- Define data models using Pydantic BaseModel in `src/models/`
- Use Pydantic field validators for validation logic
- Use Enum classes for predefined choices (Gender, RelationshipType)

### Services
- Business logic lives in `src/services/`
- Services are functions, not classes
- Use caching utilities from `src.utils.cache` for Redis operations

### Bot Handlers
- Telegram handlers go in `src/bot/handlers/`
- Use async/await for all handler functions
- Use conversation handlers for multi-step flows

## Project Structure

```
src/
├── bot/               # Telegram bot handlers and application
│   ├── handlers/      # Command and message handlers
│   ├── middleware/    # Request processing middleware
│   └── ui/            # Keyboard and UI components
├── models/            # Pydantic data models
├── services/          # Business logic layer
├── utils/             # Helper utilities (cache, database, errors, logging)
├── api/               # FastAPI endpoints
└── config.py          # Environment configuration
tests/
├── mocks/             # Mock modules for testing
├── bot/               # Bot handler tests
├── models/            # Model tests
├── services/          # Service tests
└── utils/             # Utility tests
```

## Development Commands

```bash
# Install dependencies
uv sync

# Run the bot
uv run python main.py

# Run tests
uv run pytest

# Lint code
uv run ruff check .

# Format code
uv run ruff format .

# Type check
uv run ty check

# Database migrations
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "message"
```

## Testing Conventions

- Test files should be named `test_*.py`
- Test functions should be named `test_*`
- Use pytest fixtures from `tests/conftest.py`
- Use mocks from `tests/mocks/` for external dependencies
- Use `pytest-asyncio` for async tests (asyncio_mode = "auto")
- Target 95% code coverage

## Key Patterns

### Caching Pattern
```python
from src.utils.cache import get_cache_model, set_cache, delete_cache

# Use cache keys with format: "entity:field:{id}"
CACHE_KEY = "user:{user_id}"
cached = get_cache_model(cache_key, User, extend_ttl=3600)
set_cache(cache_key, user, expiration=3600)
```

### Logging Pattern
```python
from src.utils.logging import get_logger

logger = get_logger(__name__)
logger.debug("Message", user_id=user_id)
logger.error("Error occurred", error=str(e))
```

### Database Pattern
```python
from src.utils.database import execute_query

result = execute_query(
    table="users",
    query_type="select",
    filters={"id": user_id},
)
```

## File Handling

- Always use context managers (`with` statement) when opening files
- For temporary files, use proper cleanup patterns

## Configuration

- Environment variables are loaded via `src/config.py` using pydantic-settings
- Required variables: `TELEGRAM_TOKEN`, `REDIS_URL`
- Use `.env` file for local development (copy from `.env.example`)
