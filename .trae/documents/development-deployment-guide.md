# MeetsMatch - Development & Deployment Guide

## 1. Development Environment Setup

### 1.1 Prerequisites
- **Go**: Version 1.21+ ([Download](https://golang.org/dl/))
- **Node.js**: Version 20+ with pnpm ([Download](https://nodejs.org/))
- **Docker**: Version 24+ with Docker Compose ([Download](https://docker.com/))
- **Git**: For version control
- **Make**: For build automation

### 1.2 Project Structure
```
meetsmatch/
├── cmd/
│   └── bot/                 # Go Telegram bot service
│       └── main.go
├── internal/
│   ├── bot/                 # Bot-specific logic
│   ├── api/                 # Shared API models
│   ├── database/            # Database connections
│   └── services/            # Business logic services
├── web/
│   ├── api/                 # TypeScript Web API service
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/            # React frontend
│       ├── src/
│       ├── package.json
│       └── vite.config.ts
├── deployments/
│   ├── docker/              # Docker configurations
│   │   ├── docker-compose.yml
│   │   ├── docker-compose.dev.yml
│   │   └── Dockerfile.*
│   └── nginx/               # Nginx configurations
├── scripts/                 # Build and deployment scripts
├── migrations/              # Database migrations
├── docs/                    # Documentation
├── Makefile                 # Build automation
├── go.mod                   # Go dependencies
└── README.md
```

### 1.3 Initial Setup

**1. Clone and Setup Repository**
```bash
git clone <repository-url>
cd meetsmatch
make setup
```

**2. Environment Configuration**
```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
vim .env
```

**Required Environment Variables:**
```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://yourdomain.com/webhook

# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=meetsmatch
POSTGRES_USER=meetsmatch_user
POSTGRES_PASSWORD=secure_password

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_password

# Application Configuration
JWT_SECRET=your_jwt_secret_here
API_PORT=8080
BOT_PORT=8081
FRONTEND_PORT=3000

# Production Configuration
DOMAIN=yourdomain.com
SSL_EMAIL=your-email@domain.com
```

**3. Install Dependencies**
```bash
# Install Go dependencies
go mod download

# Install Node.js dependencies
cd web/api && pnpm install
cd ../frontend && pnpm install
cd ../..
```

## 2. Development Workflow

### 2.1 Available Make Commands

```bash
# Development
make dev                    # Start all services in development mode
make dev-bot               # Start only the Telegram bot service
make dev-api               # Start only the Web API service
make dev-frontend          # Start only the frontend development server

# Building
make build                 # Build all services
make build-bot             # Build Go bot service
make build-api             # Build TypeScript API service
make build-frontend        # Build React frontend

# Testing
make test                  # Run all tests
make test-bot              # Run Go tests
make test-api              # Run API tests
make test-frontend         # Run frontend tests

# Code Quality
make lint                  # Run linters for all services
make format                # Format code for all services

# Database
make db-migrate            # Run database migrations
make db-seed               # Seed database with sample data
make db-reset              # Reset database (development only)

# Docker
make docker-build          # Build Docker images
make docker-dev            # Start development environment with Docker
make docker-prod           # Start production environment with Docker

# Deployment
make deploy-staging        # Deploy to staging environment
make deploy-prod           # Deploy to production environment
```

### 2.2 Development Server Setup

**Start Development Environment:**
```bash
# Option 1: Using Docker (Recommended)
make docker-dev

# Option 2: Local development
make dev
```

**Access Points:**
- Telegram Bot: `http://localhost:8081`
- Web API: `http://localhost:8080`
- Frontend: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### 2.3 Database Management

**Run Migrations:**
```bash
make db-migrate
```

**Create New Migration:**
```bash
# For Go service
migrate create -ext sql -dir migrations -seq add_new_table

# For TypeScript service
pnpm exec knex migrate:make add_new_table
```

**Seed Development Data:**
```bash
make db-seed
```

## 3. Docker Configuration

### 3.1 Development Docker Compose

**File: `deployments/docker/docker-compose.dev.yml`**
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  bot:
    build:
      context: ../../
      dockerfile: deployments/docker/Dockerfile.bot
    environment:
      - POSTGRES_HOST=postgres
      - REDIS_HOST=redis
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    ports:
      - "8081:8081"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ../../:/app
    command: go run cmd/bot/main.go

  api:
    build:
      context: ../../web/api
      dockerfile: ../../deployments/docker/Dockerfile.api
    environment:
      - POSTGRES_HOST=postgres
      - REDIS_HOST=redis
      - NODE_ENV=development
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ../../web/api:/app
    command: pnpm dev

  frontend:
    build:
      context: ../../web/frontend
      dockerfile: ../../deployments/docker/Dockerfile.frontend
    environment:
      - VITE_API_URL=http://localhost:8080
    ports:
      - "3000:3000"
    volumes:
      - ../../web/frontend:/app
    command: pnpm dev --host

volumes:
  postgres_data:
  redis_data:
```

### 3.2 Production Docker Compose

**File: `deployments/docker/docker-compose.yml`**
```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./nginx/ssl:/etc/nginx/ssl
      - frontend_build:/usr/share/nginx/html
    depends_on:
      - bot
      - api
      - frontend
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

  bot:
    build:
      context: ../../
      dockerfile: deployments/docker/Dockerfile.bot
    environment:
      - POSTGRES_HOST=postgres
      - REDIS_HOST=redis
      - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
      - TELEGRAM_WEBHOOK_URL=${TELEGRAM_WEBHOOK_URL}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8081/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  api:
    build:
      context: ../../web/api
      dockerfile: ../../deployments/docker/Dockerfile.api
    environment:
      - POSTGRES_HOST=postgres
      - REDIS_HOST=redis
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ../../web/frontend
      dockerfile: ../../deployments/docker/Dockerfile.frontend
      args:
        - VITE_API_URL=https://${DOMAIN}/api
    volumes:
      - frontend_build:/app/dist
    restart: "no"

volumes:
  postgres_data:
  redis_data:
  frontend_build:

networks:
  default:
    driver: bridge
```

## 4. Digital Ocean VPS Deployment

### 4.1 VPS Setup

**1. Create Digital Ocean Droplet**
- **OS**: Ubuntu 22.04 LTS
- **Size**: 2GB RAM, 1 vCPU (minimum)
- **Storage**: 50GB SSD
- **Region**: Choose closest to your users

**2. Initial Server Setup**
```bash
# Connect to your VPS
ssh root@your-server-ip

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Create application user
adduser meetsmatch
usermod -aG docker meetsmatch

# Setup firewall
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

### 4.2 Application Deployment

**1. Deploy Application**
```bash
# Switch to application user
su - meetsmatch

# Clone repository
git clone <your-repository-url> meetsmatch
cd meetsmatch

# Setup environment
cp .env.example .env
vim .env  # Configure production values

# Deploy with Docker
make deploy-prod
```

**2. SSL Certificate Setup**
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtain SSL certificate
sudo certbot --nginx -d yourdomain.com

# Setup auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### 4.3 Monitoring and Maintenance

**Health Checks:**
```bash
# Check service status
docker compose ps

# View logs
docker compose logs -f [service-name]

# Monitor resource usage
docker stats
```

**Backup Strategy:**
```bash
# Database backup script
#!/bin/bash
DATESTAMP=$(date +"%Y%m%d_%H%M%S")
docker compose exec postgres pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$DATESTAMP.sql

# Schedule daily backups
crontab -e
# Add: 0 2 * * * /home/meetsmatch/backup.sh
```

**Update Deployment:**
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart services
make deploy-prod

# Run database migrations if needed
make db-migrate
```

## 5. Troubleshooting

### 5.1 Common Issues

**Database Connection Issues:**
```bash
# Check PostgreSQL status
docker compose exec postgres pg_isready

# Reset database (development only)
make db-reset
```

**Telegram Bot Issues:**
```bash
# Check webhook status
curl -X GET "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# Set webhook
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://yourdomain.com/webhook"}'
```

**Performance Issues:**
```bash
# Monitor resource usage
docker stats

# Check application logs
docker compose logs -f --tail=100

# Database performance
docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT * FROM pg_stat_activity;"
```

### 5.2 Log Management

**Centralized Logging:**
```bash
# View all service logs
docker compose logs -f

# View specific service logs
docker compose logs -f bot
docker compose logs -f api
docker compose logs -f nginx
```

**Log Rotation:**
```bash
# Configure Docker log rotation
vim /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}

# Restart Docker
sudo systemctl restart docker
```

## 6. Security Considerations

### 6.1 Environment Security
- Use strong passwords for all services
- Enable firewall with minimal required ports
- Regular security updates
- SSL/TLS encryption for all communications
- Secure environment variable management

### 6.2 Application Security
- Input validation and sanitization
- Rate limiting on API endpoints
- JWT token expiration and rotation
- Database query parameterization
- Regular dependency updates

### 6.3 Monitoring
- Health check endpoints for all services
- Error tracking and alerting
- Performance monitoring
- Security audit logs
- Automated backup verification