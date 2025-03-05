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
- python-telegram-bot v20.3
- Redis for caching
- Supabase for persistent storage

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
uv pip install -r requirements.txt
```

### Development Tools
```bash
# Install core dev tools
uv pip install ruff pylyzer pytest pre-commit

# Setup pre-commit hooks
pre-commit install
```

### Local Supabase Setup

1. Install Supabase CLI:
```bash
npm install -g supabase
```

2. Start local environment:
```bash
supabase init
supabase start
```

3. Configure environment variables:
```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_KEY=your-anon-key
```

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
```bash
# Run all tests with coverage
pytest --cov=src --cov-report=html

# Linting & formatting
ruff check .  # Static analysis
ruff format .  # Auto-formatting

# Type checking
pylyzer src/
```

## Deployment
### Staging Environment
```bash
# Deploy to staging
./scripts/deploy.sh --env staging
```

### Production Checklist
- [ ] Verify database migrations
- [ ] Run smoke tests
- [ ] Monitor error tracking

## Contributing
1. Create feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org)
3. Open PR with:
   - Test coverage report
   - Updated documentation