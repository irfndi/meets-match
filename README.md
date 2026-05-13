# MeetMatch Telegram Bot

A Telegram-based matchmaking bot that helps users find and connect with compatible matches based on interests, location, and preferences.

## Overview

MeetMatch is a Telegram matchmaking bot built with Go and TypeScript that facilitates user matching based on:
- Location proximity
- Shared interests
- User preferences (age, gender, relationship type)

## Architecture

The project uses a microservices architecture with three main components:

- **API Service** (`services/api/`) - Go-based gRPC/HTTP API with SQLite database
- **Bot Service** (`services/bot/`) - TypeScript/Bun Telegram bot client
- **Worker Service** (`services/worker/`) - Go background job processor (optional)

### Communication Flow

```
Telegram → Bot Service (TS/Bun) → gRPC → API Service (Go/SQLite)
                                           ↓
                                    Worker Service (Go/Redis)
```

## Tech Stack

- **Go 1.25+** - API and Worker services
- **TypeScript 5+** - Bot service
- **Bun** - JavaScript runtime for bot
- **SQLite** - Database (via modernc.org/sqlite)
- **Redis** - Job queue (for notifications)
- **gRPC + ConnectRPC** - Inter-service communication
- **Grammy** - Telegram Bot framework
- **Fiber** - HTTP framework for API

## Local Development

### Prerequisites

- Go 1.25+
- Bun 1.3+
- SQLite (embedded, no separate install needed)
- Redis (optional, for notifications)
- Buf (for protobuf generation)

### Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd meetsmatch
   ```

2. **Generate protobufs**:
   ```bash
   buf generate
   ```

3. **Install dependencies**:
   ```bash
   # Go services
   cd services/api && go mod tidy
   cd services/worker && go mod tidy

   # Bot service
   cd services/bot && bun install
   ```

4. **Configure Environment**:
   Copy `.env.example` to `.env` and fill in your credentials.
   ```bash
   cp .env.example .env
   ```

5. **Start the API**:
   ```bash
   cd services/api && go run cmd/api/main.go
   ```

6. **Start the Bot** (in another terminal):
   ```bash
   cd services/bot && bun run dev
   ```

## Project Structure

```text
services/
├── api/               # Go API service (gRPC + HTTP)
│   ├── cmd/api/       # Main entry point
│   ├── internal/      # Internal packages
│   │   ├── services/  # Business logic (user, match, notification)
│   │   ├── models/    # Data models
│   │   └── config/    # Configuration
│   └── migrations/    # SQLite schema migrations
├── bot/               # TypeScript Telegram bot
│   ├── src/handlers/  # Command and callback handlers
│   ├── src/services/  # Bot services
│   └── src/lib/       # Utilities
└── worker/            # Go background worker
    ├── cmd/worker/    # Main entry point
    └── internal/      # Job processors

packages/
└── contracts/         # Shared protobuf definitions
```

## Deployment

### Docker / Coolify

The project includes a `Dockerfile` for containerized deployment via Coolify:

```bash
docker build -t meetsmatch-bot .
docker run -e BOT_TOKEN=<token> -p 3000:3000 meetsmatch-bot
```

### Environment Variables

Key environment variables (see `.env.example` for full list):

| Variable | Description | Default |
|----------|-------------|---------|
| `BOT_TOKEN` | Telegram bot token | Required |
| `DATABASE_URL` | SQLite database path | `file:meetsmatch.db` |
| `API_URL` | API service URL | `http://localhost:8080` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |

## Testing

```bash
# Go API tests
cd services/api && go test ./...

# Bot tests
cd services/bot && bun run test

# Full CI
cd services/api && make ci
```

## License

MIT
