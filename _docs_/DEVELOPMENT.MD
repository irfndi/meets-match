# Development Guide for MeetMatch Telegram Bot

## Table of Contents
- [Project Overview](#project-overview)
- [Development Environment Setup](#development-environment-setup)
- [Project Structure](#project-structure)
- [Coding Conventions](#coding-conventions)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Deployment](#deployment)
- [Contributing](#contributing)

## Project Overview
Our Telegram bot helps users find and schedule meetups using AI-powered matching. Built with:
- Python 3.10+
- python-telegram-bot v20.3+
- Redis (optional) for caching and session data
- PostgreSQL for persistent relational data
- Deployed on a VPS as a systemd service

## Development Environment Setup

### Python Installation
- **Recommended**: Use [pyenv](https://github.com/pyenv/pyenv) for version management
- Verify installation:
  ```bash
  python --version  # Should show 3.10+
  ```

### UV Package Manager
Why UV?
- Faster dependency resolution
- Unified interface for virtualenv/pip/poetry workflows
- Install system-wide:
  ```bash
  pip install --user uv
  ```

### Virtual Environment Setup
```bash
# Create and activate environment
uv venv .venv
source .venv/bin/activate  # Linux/macOS
.venv\Scripts\activate     # Windows

# Install project dependencies
# This installs the project in editable mode and includes dev dependencies from pyproject.toml
uv pip install -e ".[dev]"
```

### Development Tools
```bash
# Development tools (like ruff, pytest, ty) are installed via pyproject.toml's [dev] extra

# Setup pre-commit hooks (if using pre-commit)
pre-commit install
```

### Local Development

Use `uv` for local development:

```bash
# Sync dependencies
uv sync

# Run the bot
uv run python main.py
```

Optional services:
- Ensure Redis is running if caching is enabled (`REDIS_URL` configured).
- Ensure PostgreSQL is running and `DATABASE_URL` is configured.

## Project Structure
```
src/
├── bot/               # Core bot handlers
├── models/            # Database models
├── services/          # Business logic
├── utils/             # Helper functions
└── config.py          # Configuration loader

tests/                 # Unit & integration tests
scripts/               # Deployment/maintenance scripts
```

## Coding Conventions
1. **Type Annotations**:
   - Use Python 3.10+ syntax
   - Strict type validation with ty

2. **Error Handling**:
   - Use custom exceptions from `errors.py`
   - Log errors with context using structlog

3. **Telegram Bot Specific**:
   - Use PTB's ContextTypes
   - Isolate handler logic in `/bot/handlers`

## Testing & Quality Assurance
- Goal: Achieve >95% test coverage, tracked via Codecov.
```bash
# Run all tests with coverage report
pytest --cov=src --cov-report=term-missing --cov-fail-under=95

# Linting & formatting
ruff check .
ruff format .

# Type checking
ty check
```

## Deployment
The bot is deployed on a VPS and managed via `systemd`.

### Environment Configuration
- Use `.env` for both local and production configuration.
- Critical variables include `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, and `REDIS_URL` (optional).

### Deployment Steps
```bash
# Prepare the VPS (PostgreSQL, Redis, uv)
ssh root@<SERVER_IP>
cd /opt/meetsmatch
# Copy project files to /opt/meetsmatch

# Create and fill .env
cp .env.example .env
vi .env

# Sync dependencies
uv sync

# Install and start systemd service
sudo cp meetsmatch.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now meetsmatch

# View logs
journalctl -u meetsmatch -f
```

### CI/CD
- GitHub Actions are configured to automatically run tests and coverage on pushes.
- Codecov reports are generated and uploaded during the CI process.

## Contributing
We use [GitHub Issues](https://github.com/irfndi/meetsmatch-py/issues) to track tasks, bugs, and features.

1. **Check for an existing Issue:** Before starting work, check if an issue already exists for the task. If not, consider creating one to discuss the proposed changes.
2. **Create feature branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```
3. **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org).
4. **Open PR** against the `main` branch with:
   - A clear description of the changes.
   - A link to the relevant GitHub Issue (e.g., `Fixes #123` or `Relates to #456`).
   - Ensure tests pass and maintain >95% coverage.
   - Updated documentation if applicable.
