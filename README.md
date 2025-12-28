# MeetMatch Telegram Bot

A Telegram-based matchmaking bot that helps users find and connect with compatible matches based on interests, location, and preferences.

## Overview

MeetMatch is an AI-powered Telegram bot built with Python 3.13+ that facilitates user matching based on:
- Location proximity
- Shared interests
- User preferences (age, gender, relationship type)

## Tech Stack

- **Python 3.13+**
- **uv** - Fast Python package installer and resolver
- **python-telegram-bot v21+** - Telegram Bot API
- **SQLAlchemy** - ORM for PostgreSQL
- **Pydantic** - Data validation
- **PostgreSQL** - Database
- **Redis** - Caching and KV store

## Local Development

### Prerequisites

- Python 3.13+
- `uv` (Install: `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- PostgreSQL
- Redis

### Setup

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd meetsmatch
    ```

2.  **Configure Environment**:
    Copy `.env.example` to `.env` and fill in your credentials.
    ```bash
    cp .env.example .env
    ```

3.  **Install Dependencies**:
    ```bash
    uv sync
    ```

4.  **Run Migrations**:
    ```bash
    uv run alembic upgrade head
    ```

5.  **Start the Bot**:
    You can use the helper script:
    ```bash
    ./scripts/start_local.sh
    ```
    Or run manually:
    ```bash
    uv run python main.py
    ```

## VPS Deployment (Native)

1.  **Provision VPS**: Ubuntu 22.04/24.04 or Debian 12 recommended.
2.  **Run Setup Script**:
    Copy `scripts/setup_vps.sh` to your VPS and run it to install dependencies.
    ```bash
    ./scripts/setup_vps.sh
    ```
3.  **Deploy Code**: Copy your code to `/opt/meetsmatch`.
4.  **Configure Service**:
    -   Update `.env` with production credentials.
    -   Install the systemd service:
        ```bash
        sudo cp meetsmatch.service /etc/systemd/system/
        sudo systemctl daemon-reload
        sudo systemctl enable --now meetsmatch
        ```
5.  **Monitor**:
    ```bash
    sudo systemctl status meetsmatch
    journalctl -u meetsmatch -f
    ```

## Project Structure

```text
src/
├── api/               # FastAPI endpoints for health checks and management
├── bot/               # Telegram bot handlers, middleware, and application logic
│   ├── handlers/      # Command and callback handlers
│   ├── middleware/    # Authentication and rate limiting middleware
│   └── ui/            # Keyboards and UI elements
├── models/            # Pydantic data models and enums
├── services/          # Business logic layer (User, Matching, Geocoding)
├── utils/             # Helper utilities (DB, Cache, Logging, Media)
└── config.py          # Environment configuration
```

## Documentation

The codebase is fully documented with docstrings.
- **Handlers**: located in `src/bot/handlers`, covering `/start`, `/match`, `/profile`, etc.
- **Services**: core logic in `src/services`, handling user management and matching algorithms.
- **Models**: data structures in `src/models`.

Use `pydoc` or your IDE to explore specific function documentation.
