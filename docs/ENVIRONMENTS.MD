# Environment Management for MeetsMatch

## Table of Contents
- [Overview](#overview)
- [Environment Types](#environment-types)
- [Configuration Management](#configuration-management)
- [Environment Variables](#environment-variables)
- [Docker Environment Setup](#docker-environment-setup)
- [Database Configuration](#database-configuration)
- [Redis Configuration](#redis-configuration)
- [Secrets Management](#secrets-management)
- [Local Development](#local-development)
- [Staging Environment](#staging-environment)
- [Production Environment](#production-environment)
- [Environment Switching](#environment-switching)
- [Troubleshooting](#troubleshooting)

## Overview

MeetsMatch uses a multi-environment setup to support different stages of development and deployment. The application is containerized using Docker and supports three main environments: development, staging, and production. Each environment has its own configuration, database instances, and service endpoints.

## Environment Types

### Development Environment
- **Purpose**: Local development and testing
- **Infrastructure**: Docker Compose with local containers
- **Database**: Local PostgreSQL container
- **Cache**: Local Redis container
- **Domain**: `localhost` with various ports
- **Logging**: Debug level with console output
- **Hot Reload**: Enabled for all services

### Staging Environment
- **Purpose**: Pre-production testing and QA
- **Infrastructure**: DigitalOcean VPS with Docker
- **Database**: Dedicated PostgreSQL instance
- **Cache**: Dedicated Redis instance
- **Domain**: `staging.meetsmatch.app`
- **Logging**: Info level with structured logging
- **SSL**: Let's Encrypt certificates

### Production Environment
- **Purpose**: Live application serving real users
- **Infrastructure**: DigitalOcean VPS with Docker
- **Database**: Production PostgreSQL with backups
- **Cache**: Production Redis with persistence
- **Domain**: `meetsmatch.app`
- **Logging**: Warn level with centralized logging
- **SSL**: Let's Encrypt certificates
- **Monitoring**: Full observability stack

## Configuration Management

Environment configuration is managed through multiple layers:

### 1. Environment Files
Each environment uses specific `.env` files:

```bash
# Development
.env.development

# Staging
.env.staging

# Production
.env.production
```

### 2. Docker Compose Files
Environment-specific Docker Compose configurations:

```bash
# Development (default)
docker-compose.yml

# Production
docker-compose.prod.yml

# Override for local customization
docker-compose.override.yml
```

### 3. Service Configuration
Each service has environment-aware configuration:

- **Go Bot Service**: `internal/config/config.go`
- **TypeScript API**: `src/config/index.ts`
- **React Frontend**: `vite.config.ts` with environment variables

## Environment Variables

### Core Application Variables

```bash
# Application Environment
ENVIRONMENT=development|staging|production
LOG_LEVEL=debug|info|warn|error
PORT=8080
API_PORT=3000
FRONTEND_PORT=5173

# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook
TELEGRAM_WEBHOOK_SECRET=your_webhook_secret

# Database Configuration
DATABASE_URL=postgres://user:password@host:port/database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=meetsmatch
DATABASE_USER=meetsmatch_user
DATABASE_PASSWORD=secure_password
DATABASE_SSL_MODE=disable|require
DATABASE_MAX_CONNECTIONS=20
DATABASE_MAX_IDLE_CONNECTIONS=5

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_password
REDIS_DB=0
REDIS_MAX_CONNECTIONS=10

# Security
JWT_SECRET=your_jwt_secret_here
ENCRYPTION_KEY=your_encryption_key_here
CORS_ORIGINS=http://localhost:5173,https://yourdomain.com
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX_REQUESTS=100

# File Storage
UPLOAD_MAX_SIZE=10MB
UPLOAD_ALLOWED_TYPES=image/jpeg,image/png,image/gif,video/mp4
STORAGE_PATH=/app/uploads

# External Services
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password

# Monitoring & Analytics
SENTRY_DSN=your_sentry_dsn
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9090
```

### Environment-Specific Examples

#### Development (.env.development)
```bash
ENVIRONMENT=development
LOG_LEVEL=debug
PORT=8080
API_PORT=3000
FRONTEND_PORT=5173

TELEGRAM_BOT_TOKEN=your_dev_bot_token
TELEGRAM_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/webhook

DATABASE_URL=postgres://meetsmatch:password@localhost:5432/meetsmatch_dev
REDIS_URL=redis://localhost:6379/0

JWT_SECRET=dev_jwt_secret_change_in_production
ENCRYPTION_KEY=dev_encryption_key_32_chars_long

CORS_ORIGINS=http://localhost:5173,http://localhost:3000
RATE_LIMIT_MAX_REQUESTS=1000

PROMETHEUS_ENABLED=false
```

#### Production (.env.production)
```bash
ENVIRONMENT=production
LOG_LEVEL=warn
PORT=8080
API_PORT=3000

TELEGRAM_BOT_TOKEN=your_production_bot_token
TELEGRAM_WEBHOOK_URL=https://meetsmatch.app/webhook
TELEGRAM_WEBHOOK_SECRET=your_secure_webhook_secret

DATABASE_URL=postgres://meetsmatch:secure_password@db:5432/meetsmatch
DATABASE_SSL_MODE=require
DATABASE_MAX_CONNECTIONS=50

REDIS_URL=redis://:redis_password@redis:6379/0
REDIS_MAX_CONNECTIONS=20

JWT_SECRET=your_very_secure_jwt_secret_here
ENCRYPTION_KEY=your_32_character_encryption_key

CORS_ORIGINS=https://meetsmatch.app
RATE_LIMIT_MAX_REQUESTS=100

SENTRY_DSN=your_production_sentry_dsn
PROMETHEUS_ENABLED=true
```

## Docker Environment Setup

### Development Setup

1. **Create Environment File**:
   ```bash
   cp .env.example .env.development
   # Edit .env.development with your development configuration
   ```

2. **Start Development Environment**:
   ```bash
   # Start all services
   docker-compose up -d
   
   # View logs
   docker-compose logs -f
   
   # Check service status
   docker-compose ps
   ```

3. **Initialize Database**:
   ```bash
   # Run migrations
   docker-compose exec bot go run cmd/migrate/main.go
   
   # Or run migrations directly
   cd services/bot && go run cmd/migrate/main.go
   ```

### Production Setup

1. **Prepare Production Environment**:
   ```bash
   # Create production environment file
   cp .env.example .env.production
   # Edit with production values
   ```

2. **Deploy Production Services**:
   ```bash
   # Deploy with production configuration
   docker-compose -f docker-compose.prod.yml up -d
   
   # Verify deployment
   docker-compose -f docker-compose.prod.yml ps
   ```

## Database Configuration

### Development Database
```yaml
# docker-compose.yml
postgres:
  image: postgres:15-alpine
  environment:
    POSTGRES_DB: meetsmatch_dev
    POSTGRES_USER: meetsmatch
    POSTGRES_PASSWORD: password
  ports:
    - "5432:5432"
  volumes:
    - postgres_data:/var/lib/postgresql/data
```

### Production Database
```yaml
# docker-compose.prod.yml
postgres:
  image: postgres:15-alpine
  environment:
    POSTGRES_DB: meetsmatch
    POSTGRES_USER: meetsmatch
    POSTGRES_PASSWORD: ${DATABASE_PASSWORD}
  volumes:
    - postgres_data:/var/lib/postgresql/data
    - ./backups:/backups
  restart: unless-stopped
```

### Database Migrations

Migrations are managed through the Go service:

```bash
# Run migrations
go run cmd/migrate/main.go

# Create new migration
go run cmd/migrate/main.go create add_user_preferences

# Check migration status
go run cmd/migrate/main.go status
```

## Redis Configuration

### Development Redis
```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  ports:
    - "6379:6379"
  volumes:
    - redis_data:/data
```

### Production Redis
```yaml
# docker-compose.prod.yml
redis:
  image: redis:7-alpine
  command: redis-server --requirepass ${REDIS_PASSWORD} --appendonly yes
  volumes:
    - redis_data:/data
  restart: unless-stopped
```

### Redis Usage Patterns

- **Session Storage**: User authentication sessions
- **Cache**: Frequently accessed data (user profiles, matches)
- **Feature Flags**: Runtime configuration toggles
- **Rate Limiting**: Request throttling data
- **Temporary Data**: Profile editing sessions, file uploads

## Secrets Management

### Development Secrets
- Store in `.env.development` file (never commit to git)
- Use placeholder values for non-sensitive data
- Document required secrets in `.env.example`

### Production Secrets

#### Option 1: Environment Variables
```bash
# Set environment variables on the server
export TELEGRAM_BOT_TOKEN="your_production_token"
export DATABASE_PASSWORD="secure_database_password"
export JWT_SECRET="your_jwt_secret"
```

#### Option 2: Docker Secrets
```yaml
# docker-compose.prod.yml
secrets:
  telegram_bot_token:
    file: ./secrets/telegram_bot_token.txt
  database_password:
    file: ./secrets/database_password.txt

services:
  bot:
    secrets:
      - telegram_bot_token
      - database_password
```

#### Option 3: External Secret Management
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault
- Google Secret Manager

### Required Secrets

1. **Telegram Bot Token**:
   - Obtain from @BotFather on Telegram
   - Different tokens for dev/staging/production

2. **Database Credentials**:
   - Strong passwords for each environment
   - Different credentials per environment

3. **JWT Secret**:
   - Cryptographically secure random string
   - Minimum 32 characters

4. **Encryption Key**:
   - 32-character key for data encryption
   - Used for sensitive user data

## Local Development

### Quick Start
```bash
# Clone repository
git clone https://github.com/irfndi/meetsmatch.git
cd meetsmatch

# Set up environment
cp .env.example .env.development
# Edit .env.development with your values

# Start services
docker-compose up -d

# Initialize database
docker-compose exec bot go run cmd/migrate/main.go

# View logs
docker-compose logs -f
```

### Development Workflow
```bash
# Start specific services
docker-compose up -d postgres redis

# Run services locally for development
cd services/bot && go run cmd/bot/main.go
cd web/api && bun run dev
cd web/frontend && bun run dev

# Run tests
make test

# Stop services
docker-compose down
```

### Ngrok for Webhook Testing
```bash
# Install ngrok
brew install ngrok  # macOS
# or download from https://ngrok.com/

# Expose local bot service
ngrok http 8080

# Update TELEGRAM_WEBHOOK_URL in .env.development
TELEGRAM_WEBHOOK_URL=https://your-ngrok-url.ngrok.io/webhook
```

## Staging Environment

### Setup
```bash
# Create staging environment file
cp .env.example .env.staging

# Deploy to staging
docker-compose -f docker-compose.staging.yml up -d

# Set up SSL certificates
docker-compose exec nginx certbot --nginx -d staging.meetsmatch.app
```

### Configuration
```bash
# .env.staging
ENVIRONMENT=staging
LOG_LEVEL=info
TELEGRAM_WEBHOOK_URL=https://staging.meetsmatch.app/webhook
DATABASE_URL=postgres://meetsmatch:staging_password@db:5432/meetsmatch_staging
CORS_ORIGINS=https://staging.meetsmatch.app
```

## Production Environment

### Deployment Checklist

- [ ] Production environment variables configured
- [ ] SSL certificates installed and auto-renewal configured
- [ ] Database backups scheduled
- [ ] Monitoring and alerting configured
- [ ] Log aggregation set up
- [ ] Security hardening applied
- [ ] Performance optimization enabled
- [ ] Disaster recovery plan documented

### Production Deployment
```bash
# Deploy production
docker-compose -f docker-compose.prod.yml up -d

# Verify services
docker-compose -f docker-compose.prod.yml ps

# Check logs
docker-compose -f docker-compose.prod.yml logs -f

# Health check
curl https://meetsmatch.app/health
```

### Production Monitoring
```bash
# View service status
docker-compose -f docker-compose.prod.yml ps

# Monitor resource usage
docker stats

# Check application logs
docker-compose -f docker-compose.prod.yml logs -f bot
docker-compose -f docker-compose.prod.yml logs -f api

# Database backup
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U meetsmatch meetsmatch > backup.sql
```

## Environment Switching

### Using Environment Files
```bash
# Development
export ENV_FILE=.env.development
docker-compose --env-file $ENV_FILE up -d

# Staging
export ENV_FILE=.env.staging
docker-compose --env-file $ENV_FILE up -d

# Production
export ENV_FILE=.env.production
docker-compose -f docker-compose.prod.yml --env-file $ENV_FILE up -d
```

### Using Make Targets
```bash
# Development
make dev-up

# Staging
make staging-deploy

# Production
make prod-deploy
```

### Environment Validation
```bash
# Validate environment configuration
make validate-env

# Check required environment variables
make check-secrets

# Test database connection
make test-db

# Test Redis connection
make test-redis
```

## Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check database container
docker-compose ps postgres

# View database logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U meetsmatch -d meetsmatch -c "SELECT 1;"

# Check environment variables
docker-compose exec bot env | grep DATABASE
```

#### Redis Connection Issues
```bash
# Check Redis container
docker-compose ps redis

# Test Redis connection
docker-compose exec redis redis-cli ping

# Check Redis logs
docker-compose logs redis
```

#### Telegram Webhook Issues
```bash
# Check webhook URL accessibility
curl -I https://yourdomain.com/webhook

# Verify bot token
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# Check webhook info
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

#### SSL Certificate Issues
```bash
# Check certificate status
docker-compose exec nginx certbot certificates

# Renew certificates
docker-compose exec nginx certbot renew

# Test SSL configuration
curl -I https://yourdomain.com
```

### Environment Debugging

#### Check Environment Variables
```bash
# List all environment variables
docker-compose exec bot env

# Check specific variable
docker-compose exec bot echo $DATABASE_URL

# Validate configuration
docker-compose exec bot go run cmd/config/main.go validate
```

#### Service Health Checks
```bash
# Bot service health
curl http://localhost:8080/health

# API service health
curl http://localhost:3000/health

# Database health
docker-compose exec postgres pg_isready -U meetsmatch

# Redis health
docker-compose exec redis redis-cli ping
```

### Performance Monitoring

#### Resource Usage
```bash
# Monitor container resources
docker stats

# Check disk usage
df -h

# Monitor database performance
docker-compose exec postgres psql -U meetsmatch -d meetsmatch -c "SELECT * FROM pg_stat_activity;"

# Monitor Redis memory
docker-compose exec redis redis-cli info memory
```

#### Log Analysis
```bash
# Tail application logs
docker-compose logs -f --tail=100 bot

# Search for errors
docker-compose logs bot | grep ERROR

# Monitor access logs
docker-compose logs nginx | grep -E "(GET|POST|PUT|DELETE)"
```

This environment management guide provides comprehensive information for setting up, configuring, and managing the MeetsMatch application across different environments. For additional configuration details, refer to the service-specific documentation and configuration files.
