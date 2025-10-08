# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MeetsMatch is a Telegram dating bot written in Go that helps users find and schedule meetups. The project uses a modern Go architecture with comprehensive monitoring, telemetry, and testing infrastructure.

**Note**: The README.md contains outdated information describing a Rust version. This codebase is actually written in Go.

## Architecture

### Core Components

- **cmd/bot/main.go**: Application entry point with comprehensive initialization of all services
- **internal/bothandler/**: Telegram bot message handling and state management
- **internal/services/**: Business logic services (user, matching, messaging)
- **internal/database/**: Database models and connection handling (PostgreSQL)
- **internal/cache/**: Redis caching layer
- **internal/middleware/**: HTTP middleware for logging, caching, rate limiting, auth
- **internal/monitoring/**: Comprehensive monitoring with metrics, tracing, health checks, and alerting
- **internal/telemetry/**: OpenTelemetry instrumentation and structured logging

### Service Architecture

The application follows a clean architecture pattern:
- Interfaces defined in `internal/interfaces/services.go`
- Service implementations in `internal/services/`
- Database models in `internal/database/models.go`
- Dependency injection in main.go

### Key Features

- Telegram Bot API integration
- User profile management with photos, preferences, and location
- Matching algorithm and conversation system
- Redis caching with configurable TTL strategies
- OpenTelemetry observability (metrics, traces, logs)
- Comprehensive health checks and alerting
- Role-based access control foundation
- State management for conversational flows

## Development Commands

### Build
```bash
make build              # Build for current platform
make build-linux        # Build for Linux
make build-all          # Build for all platforms (Linux, Windows, macOS)
```

### Run
```bash
make run                # Run the application
make run-dev            # Run in development mode with debug logging
```

### Testing
```bash
make test               # Run all tests
make test-unit          # Run unit tests only (non-integration)
make test-integration   # Run integration tests only
make test-short         # Run quick tests skipping integration
```

### Code Quality
```bash
make fmt                # Format Go code
make fmt-check          # Check if code is properly formatted
make vet                # Run go vet
make lint               # Run golangci-lint (requires installation)
make sec                # Run security scanner with gosec
```

### Coverage
```bash
make test-coverage      # Run tests with coverage report
make test-coverage-html # Generate HTML coverage report
make test-coverage-check # Check if coverage meets 60% threshold
```

### Dependencies
```bash
make deps               # Download and tidy dependencies
make clean-deps         # Clean module cache
```

### Docker
```bash
make docker-build       # Build Docker image
make docker-run         # Run Docker container
```

### Development Workflow
```bash
make dev-setup          # Install development tools (golangci-lint, gosec)
make dev-test           # Run tests in watch mode
make ci-test            # Run full CI test pipeline
make ci-build           # Run CI build pipeline
```

## Environment Configuration

The application expects these environment variables:

### Required
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: PostgreSQL connection

### Optional
- `BOT_PORT`: HTTP server port (default: 8081)
- `TELEGRAM_WEBHOOK_URL`: Webhook URL (if not provided, runs in polling mode)
- `REDIS_HOST`, `REDIS_PASSWORD`: Redis connection
- `DB_SSLMODE`: PostgreSQL SSL mode (default: disable)

### OpenTelemetry Configuration
- `OTEL_ENABLED`: Enable/disable OpenTelemetry (default: false)
- `OTEL_SERVICE_NAME`: Service name (default: meets-match-bot)
- `OTEL_EXPORTER_OTLP_ENDPOINT`: OTLP endpoint URL

## Testing Strategy

### Test Organization
- Unit tests: `*_test.go` files alongside source code
- Integration tests: Files ending with `_integration_test.go` or test functions starting with `TestI`
- Test coverage target: 60%

### Running Tests
- Use `make test-short` for quick feedback during development
- Use `make test-integration` for integration tests (requires database/Redis)
- Use `make test-coverage-check` to ensure coverage standards

## Database

### Models
Key models in `internal/database/models.go`:
- `User`: User profiles with photos, preferences, location
- `Match`: Matches between users with status tracking
- `Message`: Messages between matched users
- `Conversation`: Conversation metadata
- `UserSession`: Session management

### JSON Fields
Photos, Preferences, and EventData are stored as JSON in PostgreSQL with custom `driver.Valuer` and `sql.Scanner` implementations.

## Monitoring and Observability

### Components
- **Metrics**: Custom metrics collector with configurable sampling
- **Tracing**: OpenTelemetry distributed tracing
- **Health Checks**: Database, Redis, and Telegram Bot health monitoring
- **Alerting**: Configurable alerting rules and notifications
- **Logging**: Structured logging with contextual fields

### Endpoints
- `/health`: Health check status
- `/metrics`: Metrics exposition
- `/traces`: Trace information
- `/cache/warm`: Cache warming endpoint
- `/cache/invalidate`: Cache invalidation endpoint

## Code Conventions

- Follow standard Go formatting (`go fmt`)
- Use interfaces for service abstraction
- Implement proper error handling with wrapped errors
- Use structured logging with contextual fields
- Write comprehensive tests with table-driven tests where appropriate
- Use dependency injection for testability

## Module Structure

```
meetsmatch/
├── cmd/bot/              # Application entry point
├── internal/
│   ├── bothandler/       # Telegram bot handlers
│   ├── cache/           # Redis caching
│   ├── database/        # Database models and connections
│   ├── interfaces/      # Service interfaces
│   ├── middleware/      # HTTP middleware
│   ├── monitoring/      # Monitoring and observability
│   ├── services/        # Business logic services
│   └── telemetry/       # OpenTelemetry instrumentation
├── makefile             # Build and development commands
└── go.mod              # Go module definition
```