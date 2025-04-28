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
- Cloudflare KV for caching and session data
- Cloudflare D1 for persistent relational data
- Deployed as a Cloudflare Worker

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
# Development tools (like ruff, pytest, pylyzer) are installed via pyproject.toml's [dev] extra

# Setup pre-commit hooks (if using pre-commit)
pre-commit install
```

### Local Cloudflare Worker Setup (Using Wrangler)

1. Install Wrangler CLI (if not already installed):
```bash
npm install -g wrangler
```

2. Authenticate Wrangler (if not already done):
```bash
wrangler login
```

3. Create `.dev.vars` file in the project root for local secrets (this file is gitignored):
```ini
# .dev.vars (DO NOT COMMIT)
TELEGRAM_TOKEN="your_local_test_bot_token"
# Add other secrets or environment variables needed for local testing
```

4. Run the worker locally (this will also pick up D1/KV bindings from wrangler.toml):
```bash
# Make sure you are in the project root directory where wrangler.toml is located
wrangler dev --env test --vars .dev.vars
```

This command starts a local server simulating the Cloudflare environment.

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
   - Strict mypy validation

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
pylyzer src/
```

## Deployment
The bot is deployed as a Cloudflare Worker.

### Environment Configuration
- Use `.dev.vars` for local development secrets and Cloudflare dashboard for production secrets.
- Configuration includes Telegram Bot Token, D1 Database bindings, and KV Namespace bindings.

### Deployment Steps
```bash
# Install wrangler CLI (if not already installed)
# npm install -g wrangler

# Authenticate wrangler
# wrangler login

# Deploy to Cloudflare
wrangler deploy
```

### CI/CD
- GitHub Actions are configured to automatically test and deploy the worker on pushes to the main branch.
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