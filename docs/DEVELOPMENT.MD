# Development Guide for MeetsMatch Telegram Bot

## Table of Contents
- [Project Overview](#project-overview)
- [Core Services](#core-services)
- [Development Environment Setup](#development-environment-setup)
  - [Prerequisites](#prerequisites)
  - [Installation Steps](#installation-steps)
  - [Configuration & Secrets](#configuration--secrets)
- [Project Structure](#project-structure)
- [Command Handling](#command-handling)
  - [Adding New Commands](#adding-new-commands)
- [User Journeys](#user-journeys)
  - [Onboarding Flow](#onboarding-flow)
  - [Profile Management](#profile-management)
- [Session Management](#session-management)
- [Input Validation](#input-validation)
- [Development Workflow](#development-workflow)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Docker Usage](#docker-usage)
- [Feature Flags](#feature-flags)
- [Environments](#environments)
- [Deployment](#deployment)
- [CI/CD](#cicd)
- [Debugging](#debugging)
- [Contributing](#contributing)

## Project Overview

MeetsMatch is a Telegram bot that helps users find and connect with potential matches. The application is built using a modern microservices architecture with Go for the Telegram bot service, TypeScript for the web API, and React for the frontend. All services are containerized using Docker and deployed on DigitalOcean VPS.

### Key Technologies
- **Go**: Telegram bot service with high-performance webhook handling
- **TypeScript/Node.js**: Web API service for REST endpoints
- **React**: Modern frontend with TypeScript
- **PostgreSQL**: Primary database for persistent data
- **Redis**: Caching and session management
- **Docker**: Containerization and orchestration
- **Nginx**: Reverse proxy and load balancer

## Core Services

The application consists of several containerized services:

### Go Telegram Bot Service (`services/bot/`)
- **Purpose**: Handles all Telegram bot interactions and webhook processing
- **Key Features**:
  - Command routing and processing
  - User registration and profile management
  - Matching algorithm execution
  - Media file handling
  - Real-time messaging
- **Architecture**: Clean architecture with handlers, services, and repositories
- **Database**: Direct PostgreSQL connection with connection pooling
- **Cache**: Redis for session management and temporary data

### TypeScript Web API Service (`web/api/`)
- **Purpose**: Provides REST API endpoints for web interface and mobile apps
- **Key Features**:
  - User authentication and authorization
  - Profile management APIs
  - Matching and conversation APIs
  - Admin panel endpoints
  - File upload handling
- **Framework**: Express.js with TypeScript
- **Authentication**: JWT-based with Telegram OAuth integration
- **Validation**: Comprehensive input validation and sanitization

### React Frontend (`web/frontend/`)
- **Purpose**: Web-based user interface for profile management and conversations
- **Key Features**:
  - Responsive design with Tailwind CSS
  - Real-time updates with WebSocket integration
  - Profile editing and media management
  - Chat interface
  - Admin dashboard
- **State Management**: Zustand for global state
- **Routing**: React Router for client-side navigation
- **Build Tool**: Vite for fast development and optimized builds

## Development Environment Setup

### Prerequisites

1. **Docker & Docker Compose**:
   ```bash
   # Install Docker Desktop (macOS/Windows) or Docker Engine (Linux)
   # Verify installation
   docker --version
   docker-compose --version
   ```

2. **Go (1.21+)**:
   ```bash
   # Install Go from https://golang.org/dl/
   # Verify installation
   go version
   ```

3. **Bun**:
   ```bash
   # Install Bun
   curl -fsSL https://bun.sh/install | bash
   # Verify installation
   bun --version
   ```

4. **Git**: For version control

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone https://github.com/irfndi/meetsmatch.git
   cd meetsmatch
   ```

2. **Set up environment configuration**:
   ```bash
   # Copy environment template
   cp .env.example .env
   
   # Edit .env with your configuration
   # Required variables:
   # - TELEGRAM_BOT_TOKEN
   # - DATABASE_URL
   # - REDIS_URL
   # - JWT_SECRET
   ```

3. **Start development environment**:
   ```bash
   # Start all services with Docker Compose
   docker-compose up -d
   
   # Verify all services are running
   docker-compose ps
   ```

4. **Install dependencies**:
   ```bash
   # Frontend dependencies
   cd web/frontend
   bun install
   
   # API dependencies
   cd ../api
   bun install
   
   # Go dependencies
   cd ../../services/bot
   go mod download
   ```

5. **Initialize database**:
   ```bash
   # Run database migrations
   cd services/bot
   go run cmd/migrate/main.go
   ```

### Configuration & Secrets

#### Environment Variables
The application uses environment variables for configuration. Key variables include:

```bash
# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook

# Database Configuration
DATABASE_URL=postgres://user:password@localhost:5432/meetsmatch
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here

# Application Settings
ENVIRONMENT=development
LOG_LEVEL=debug
PORT=8080
API_PORT=3000
```

#### Secrets Management
- **Development**: Use `.env` file (never commit to git)
- **Production**: Use Docker secrets or environment variables
- **Telegram Bot Token**: Obtain from @BotFather on Telegram

## Project Structure

```
meetsmatch/
├── services/
│   └── bot/                    # Go Telegram bot service
│       ├── cmd/
│       │   ├── bot/           # Main bot application
│       │   └── migrate/       # Database migration tool
│       ├── internal/
│       │   ├── bot/           # Bot handlers and logic
│       │   ├── config/        # Configuration management
│       │   ├── database/      # Database connection and models
│       │   ├── handlers/      # HTTP handlers
│       │   ├── middleware/    # HTTP middleware
│       │   ├── models/        # Data models
│       │   ├── repositories/  # Data access layer
│       │   └── services/      # Business logic
│       ├── migrations/        # SQL migration files
│       ├── go.mod
│       └── go.sum
├── web/
│   ├── api/                   # TypeScript Web API service
│   │   ├── src/
│   │   │   ├── controllers/   # API controllers
│   │   │   ├── middleware/    # Express middleware
│   │   │   ├── models/        # Data models
│   │   │   ├── routes/        # API routes
│   │   │   ├── services/      # Business logic
│   │   │   └── utils/         # Utility functions
│   │   ├── tests/             # Test files
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/              # React frontend
│       ├── src/
│       │   ├── components/    # React components
│       │   ├── pages/         # Page components
│       │   ├── hooks/         # Custom React hooks
│       │   ├── store/         # Zustand stores
│       │   ├── utils/         # Utility functions
│       │   └── types/         # TypeScript type definitions
│       ├── public/            # Static assets
│       ├── package.json
│       └── vite.config.ts
├── docker-compose.yml         # Docker Compose configuration
├── docker-compose.prod.yml    # Production Docker Compose
├── nginx/                     # Nginx configuration
├── docs/                      # Documentation
├── scripts/                   # Utility scripts
├── .env.example              # Environment template
└── README.md
```

## Command Handling

The Go bot service uses a command dispatcher pattern to handle Telegram commands:

### Command Flow
1. **Webhook Reception**: Telegram sends updates to `/webhook` endpoint
2. **Update Parsing**: Extract command and user information
3. **User Authentication**: Verify user exists or create new user
4. **Command Routing**: Route to appropriate handler based on command
5. **Business Logic**: Execute command-specific logic
6. **Response**: Send response back to Telegram

### Adding New Commands

To add a new command (e.g., `/settings`):

1. **Define Handler**:
   ```go
   // internal/bot/handlers/settings.go
   func (h *Handler) HandleSettings(ctx context.Context, update *bot.Update) error {
       // Command logic here
       return h.bot.SendMessage(ctx, &bot.SendMessageParams{
           ChatID: update.Message.Chat.ID,
           Text:   "Settings menu",
       })
   }
   ```

2. **Register Command**:
   ```go
   // internal/bot/handler.go
   func (h *Handler) RegisterCommands() {
       h.bot.RegisterHandler(bot.HandlerTypeMessageText, "/settings", 
           bot.MatchTypeExact, h.HandleSettings)
   }
   ```

3. **Add Tests**:
   ```go
   // internal/bot/handlers/settings_test.go
   func TestHandleSettings(t *testing.T) {
       // Test implementation
   }
   ```

## User Journeys

### Onboarding Flow
1. User sends `/start` command
2. Bot checks if user exists in database
3. If new user, initiate registration process:
   - Collect basic information (name, age, gender)
   - Request location (optional)
   - Upload profile photos
   - Set preferences
4. Complete profile and activate account

### Profile Management
1. User accesses profile via `/profile` command or web interface
2. Can edit:
   - Basic information (name, age, bio)
   - Location and preferences
   - Profile photos
   - Privacy settings
3. Changes are validated and saved to database
4. Cache is updated for fast access

## Session Management

The application uses Redis for session management:

### Session Types
- **User Sessions**: Authentication and user state
- **Conversation Sessions**: Multi-step interactions (profile editing, photo upload)
- **Cache Sessions**: Temporary data for performance

### Session Configuration
```go
// Session timeout settings
const (
    UserSessionTimeout = 24 * time.Hour
    ConversationSessionTimeout = 15 * time.Minute
    CacheSessionTimeout = 1 * time.Hour
)
```

## Input Validation

Comprehensive input validation is implemented across all services:

### Go Service Validation
```go
// Example validation function
func ValidateUserProfile(profile *models.UserProfile) error {
    if len(profile.Name) < 2 || len(profile.Name) > 50 {
        return errors.New("name must be between 2 and 50 characters")
    }
    if profile.Age < 18 || profile.Age > 100 {
        return errors.New("age must be between 18 and 100")
    }
    return nil
}
```

### TypeScript API Validation
```typescript
// Example validation middleware
export const validateUserProfile = [
  body('name').isLength({ min: 2, max: 50 }).trim(),
  body('age').isInt({ min: 18, max: 100 }),
  body('bio').optional().isLength({ max: 500 }).trim(),
  handleValidationErrors
];
```

## Development Workflow

### Daily Development
1. **Start Services**:
   ```bash
   docker-compose up -d postgres redis
   ```

2. **Run Go Service**:
   ```bash
   cd services/bot
   go run cmd/bot/main.go
   ```

3. **Run API Service**:
   ```bash
   cd web/api
   bun run dev
   ```

4. **Run Frontend**:
   ```bash
   cd web/frontend
   bun run dev
   ```

### Code Quality
- **Go**: Use `gofmt`, `golint`, and `go vet`
- **TypeScript**: Use Oxlint for linting
- **Testing**: Maintain >95% test coverage
- **Git**: Use conventional commits

## Testing & Quality Assurance

### Testing Framework
- **Go**: Built-in testing with testify for assertions
- **TypeScript**: Vitest for unit and integration tests
- **Frontend**: Vitest with React Testing Library
- **E2E**: Playwright for end-to-end testing

### Running Tests
```bash
# Go tests
cd services/bot
go test ./...

# API tests
cd web/api
bun test

# Frontend tests
cd web/frontend
bun test

# E2E tests
bun run test:e2e
```

### Coverage Requirements
- Minimum 95% code coverage for all services
- Integration tests for critical user flows
- Performance tests for high-load scenarios

## Docker Usage

### Development Environment
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f [service-name]

# Restart specific service
docker-compose restart [service-name]

# Stop all services
docker-compose down
```

### Production Deployment
```bash
# Build and deploy
docker-compose -f docker-compose.prod.yml up -d

# Update specific service
docker-compose -f docker-compose.prod.yml up -d --no-deps [service-name]
```

## Feature Flags

Feature flags are managed through Redis and can be toggled without deployment:

### Available Flags
- `enable_new_matching_algorithm`: Toggle new matching logic
- `enable_real_time_chat`: Enable WebSocket chat features
- `enable_media_compression`: Enable automatic media compression
- `enable_admin_panel`: Enable admin interface

### Managing Flags
```bash
# Set feature flag
redis-cli SET feature:enable_new_matching_algorithm true

# Get feature flag
redis-cli GET feature:enable_new_matching_algorithm
```

## Environments

The application supports multiple environments:

- **Development**: Local development with hot reload
- **Staging**: Production-like environment for testing
- **Production**: Live environment with optimizations

### Environment-Specific Configuration
Each environment has its own:
- Database instances
- Redis instances
- Telegram bot tokens
- Domain configurations
- Resource limits

## Deployment

### Production Deployment
1. **Prepare Environment**:
   ```bash
   # Set production environment variables
   export ENVIRONMENT=production
   export DATABASE_URL=production_db_url
   ```

2. **Deploy Services**:
   ```bash
   # Build and deploy
   docker-compose -f docker-compose.prod.yml up -d
   ```

3. **Verify Deployment**:
   ```bash
   # Check service health
   curl https://yourdomain.com/health
   ```

### Rolling Updates
- Zero-downtime deployments using Docker Compose
- Health checks ensure service availability
- Automatic rollback on deployment failures

## CI/CD

The project uses GitHub Actions for continuous integration and deployment:

### Pipeline Stages
1. **Code Quality**: Linting and formatting checks
2. **Testing**: Unit, integration, and E2E tests
3. **Security**: Vulnerability scanning
4. **Build**: Docker image creation
5. **Deploy**: Automated deployment to staging/production

### Workflow Configuration
```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run tests
        run: |
          docker-compose up -d postgres redis
          make test
```

## Debugging

### Local Debugging
1. **Go Service**: Use Delve debugger or IDE debugging
2. **TypeScript Services**: Use Node.js inspector or IDE debugging
3. **Database**: Use pgAdmin or command-line tools
4. **Redis**: Use Redis CLI or GUI tools

### Production Debugging
1. **Logs**: Centralized logging with structured JSON format
2. **Metrics**: Prometheus metrics for monitoring
3. **Tracing**: Distributed tracing for request flow
4. **Health Checks**: Automated health monitoring

### Common Issues
- **Database Connection**: Check connection strings and network access
- **Redis Connection**: Verify Redis service is running
- **Telegram Webhook**: Ensure webhook URL is accessible
- **CORS Issues**: Check CORS configuration in API service

## Contributing

### Development Guidelines
1. **Code Style**: Follow language-specific style guides
2. **Testing**: Write tests for all new features
3. **Documentation**: Update documentation for changes
4. **Git Workflow**: Use feature branches and pull requests

### Pull Request Process
1. Create feature branch from `main`
2. Implement changes with tests
3. Ensure all CI checks pass
4. Request code review
5. Merge after approval

### Code Review Checklist
- [ ] Code follows style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] Security considerations addressed
- [ ] Performance impact considered

This development guide provides comprehensive information for working with the MeetsMatch codebase. For specific implementation details, refer to the code comments and additional documentation in the `docs/` directory.
