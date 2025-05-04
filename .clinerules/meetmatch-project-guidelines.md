## Brief overview
These guidelines are specific to the MeetMatch Telegram Bot project. They cover the tech stack, coding standards, development workflow, and key architectural decisions based on the project documentation found in the `_docs_` directory.

## Technology Stack
- **Language:** Python 3.10+
- **Core Framework:** `python-telegram-bot` (v20.0+)
- **Runtime:** Cloudflare Workers (using Pyodide/WASI)
- **Database:** Cloudflare D1 (SQLite compatible) for persistent data (profiles, matches, media metadata).
- **Caching/Session:** Cloudflare KV.
- **Object Storage:** Cloudflare R2 (considered for media blobs, evaluate cost/performance).
- **Location Services:** `geopy` library.

## Development Environment & Tools
- **Version Management:** `pyenv` recommended for Python version control.
- **Package Management:** Use `uv` for local virtual environments and dependency management (`uv venv .venv`, `uv pip install -e ".[dev]"`).
- **Local Development:** Use `wrangler dev` for running the Cloudflare Worker locally. Manage local secrets in `.dev.vars`.
- **CLI:** `wrangler` for Cloudflare interactions (dev, deploy, db migrations).

## Coding Standards & Conventions
- **Type Annotations:** Mandatory for all functions (Python 3.10+ syntax). Enforced by `mypy` (via `pylyzer`).
- **Error Handling:** Use custom exceptions defined in `src/utils/errors.py`. Avoid generic exceptions.
- **Logging:** Use `structlog` for structured, context-rich logging.
- **Telegram Bot:** Utilize `python-telegram-bot` `ContextTypes`. Isolate handler logic in `src/bot/handlers/`.
- **Code Quality:**
    - Linter/Formatter: `ruff` (`ruff check .`, `ruff format .`). Configured in `.ruff.toml`.
    - Static Analysis: `pylyzer`.
- **Docstrings:** Required for all public functions, classes, modules (Google or NumPy style).

## Project Structure
- Adhere to the established structure:
    - `src/bot/`: Core bot handlers and application setup.
    - `src/models/`: Database models/schemas.
    - `src/services/`: Business logic implementation.
    - `src/utils/`: Utility functions, helpers, custom errors.
    - `src/config.py`: Configuration loading.
    - `tests/`: All tests.
    - `scripts/`: Utility scripts.

## Testing & Quality Assurance
- **Framework:** `pytest`.
- **Coverage:** Target >95% code coverage, measured by `coverage.py` (`pytest --cov=src --cov-report=term-missing --cov-fail-under=95`).
- **Coverage Tracking:** Use Codecov, integrated with CI. Reports required for PRs.
- **Quality Gates:** Enforce >95% coverage via Codecov in CI/PR checks.

## Development Workflow & CI/CD
- **Version Control:** Git.
- **Branching:** Feature branches (e.g., `feat/your-feature-name`).
- **Commits:** Follow Conventional Commits standard (e.g., `feat:`, `fix:`, `docs:`, `refactor:`).
- **Issues:** Track work using GitHub Issues. Link PRs to issues.
- **Pull Requests:** Target `main` branch. Require passing tests, >95% coverage report, and updated documentation.
- **CI/CD:** GitHub Actions for automated testing (`pytest`, `coverage`, `ruff`, `pylyzer`) and deployment (`wrangler deploy`).
- **Pre-commit Hooks:** Recommended (`pre-commit install`) to run checks locally before committing.

## Key Architectural Decisions & Features
- **Persistence:** D1 for structured data, KV for cache/sessions, R2 potentially for media blobs.
- **Profile:** Requires completion, includes specific fields (Name, Gender, Age, Bio, Location, Interests, Media). Media: 1-5 files, max 5MB, metadata in D1, delete refs after 180 days.
- **Matching:** Based on age (±4 years), location (city -> country), interests. Scoring system planned.
- **Interactions:** Like/Dislike/Report via inline buttons. Mutual likes trigger notifications with usernames.
- **Account Management:** Soft delete on D1 with retention period.
- **Security:** Rely on Cloudflare for encryption. Manage secrets via Cloudflare dashboard (prod) and `.dev.vars` (local). Access resources via Worker bindings.
- **Rate Limiting:** Implement rate limits.
