# MeetMatch Development Guide

## Environment Setup

### Prerequisites

- Go 1.25+
- Bun 1.3+
- Buf CLI (for protobuf generation)
- SQLite (embedded, no separate install needed)

### Install Tools

```bash
# Go (via https://go.dev/dl/ or your package manager)
# Bun (via https://bun.sh/)
curl -fsSL https://bun.sh/install | bash

# Buf
curl -sSL "https://github.com/bufbuild/buf/releases/latest/download/buf-$(uname -s)-$(uname -m)" -o /usr/local/bin/buf
chmod +x /usr/local/bin/buf
```

### Setup

1. **Generate protobufs**:
   ```bash
   buf generate
   ```

2. **Install Go dependencies**:
   ```bash
   cd services/api && go mod tidy
   cd services/worker && go mod tidy
   ```

3. **Install Bot dependencies**:
   ```bash
   cd services/bot && bun install
   ```

## Development Workflow

### Running Locally

```bash
# Terminal 1: Start API
cd services/api && go run cmd/api/main.go

# Terminal 2: Start Bot
cd services/bot && bun run dev

# Terminal 3: Start Worker (optional)
cd services/worker && go run cmd/worker/main.go
```

### Testing

```bash
# Go API
cd services/api && go test ./...

# Bot
cd services/bot && bun run test

# Full CI
cd services/api && make ci
```

### Linting

```bash
# Go
cd services/api && go fmt ./...

# Bot
cd services/bot && bun run lint
```

## Database

The project uses SQLite (via `modernc.org/sqlite`). The database file is created automatically on first run.

To apply migrations manually:

```bash
cd services/api
sqlite3 meetsmatch.db < migrations/000001_init_schema.up.sql
sqlite3 meetsmatch.db < migrations/000002_add_matches.up.sql
sqlite3 meetsmatch.db < migrations/000003_add_notifications.up.sql
sqlite3 meetsmatch.db < migrations/000004_add_reengagement_notifications.up.sql
```

## Project Guidelines

- Follow existing code style
- Add tests for new features
- Update documentation for API changes
- Use conventional commits (`feat:`, `fix:`, `docs:`, etc.)
