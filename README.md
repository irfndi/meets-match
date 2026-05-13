# MeetMatch Telegram Bot

A Telegram-based matchmaking bot that helps users find and connect with compatible matches based on interests, location, and preferences.

## Tech Stack

- **Go 1.25** — API service (Fiber HTTP + gRPC) and Worker service (background jobs)
- **TypeScript / Bun** — Telegram bot frontend (grammy framework)
- **Protocol Buffers** — Service contracts via buf
- **PostgreSQL** — Primary database
- **Redis** — Caching, KV store, and job queues
- **Sentry** — Error tracking across all services

## Architecture

```
services/
├── api/          # Go HTTP/gRPC API server
│   ├── cmd/api/  # Entry point
│   └── internal/ # Config, HTTP server, gRPC server, services
├── bot/          # TypeScript Telegram bot (Bun runtime)
│   └── src/      # Handlers, conversations, menus, services
├── worker/       # Go background job processor (Redis queues)
│   └── internal/ # Jobs, scheduler, clients
packages/
└── contracts/    # Protobuf definitions (shared by all services)
```

## Local Development

### Prerequisites

- **Go 1.25+**
- **Bun 1.3+**
- **PostgreSQL** (17 recommended)
- **Redis** (7+)
- **buf** (install: `brew install bufbuild/buf/buf` or see [buf.build](https://buf.build))

### Setup

1. **Generate protobufs**:
   ```bash
   buf generate
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Install dependencies**:
   ```bash
   cd services/bot && bun install
   cd services/api && go mod download
   ```

4. **Run database migrations** (if applicable):
   ```bash
   # Migrations are located in services/api/migrations/
   cd services/api && go run cmd/migrate/main.go up
   ```

5. **Start services**:
   ```bash
   make api-run   # Terminal 1: API server
   make bot-run   # Terminal 2: Bot
   ```

## Useful Commands

```bash
make help       # Show all available commands
make ci         # Lint, format, security check, test, build
make test       # Run all tests
make lint       # Run all linters
make format     # Format all code
make deploy-app # Deploy to server via rsync
```

## Deployment

### Native (binary + systemd)

Go services compile to static binaries. The bot runs directly with Bun.

```bash
# Build API binary
cd services/api && CGO_ENABLED=0 go build -o bin/api cmd/api/main.go

# Build Worker binary
cd services/worker && CGO_ENABLED=0 go build -o bin/worker cmd/worker/main.go

# Run bot
cd services/bot && bun run start
```

Use `scripts/setup_vps.sh` for automated VPS provisioning (PostgreSQL, Redis, systemd).

### Docker (Coolify / docker-compose)

Dockerfiles and `docker-compose.yml` are provided for container-based deployment.
