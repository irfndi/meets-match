#!/bin/bash
set -e

# Default environment is 'dev' if no argument is provided.
# PRD implies "staging" and "production". "dev" can be local or a shared dev deployment.
TARGET_ENV="${1:-dev}"

echo "Deploying MeetsMatch services to environment: $TARGET_ENV..."

# Build the project first
echo "Building project before deployment..."
./scripts/build.sh

# Docker-based deployment configuration
# Ensure docker-compose files exist for different environments:
# - docker-compose.yml (base configuration)
# - docker-compose.dev.yml (development overrides)
# - docker-compose.staging.yml (staging overrides)
# - docker-compose.prod.yml (production overrides)

if [ "$TARGET_ENV" == "production" ]; then
    read -p "You are about to deploy to PRODUCTION. Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Deployment to production aborted."
        exit 0
    fi
    echo "Deploying to production environment..."
    if [ -f "docker-compose.prod.yml" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
    else
        echo "Error: docker-compose.prod.yml not found. Please create production configuration."
        exit 1
    fi
elif [ "$TARGET_ENV" == "staging" ]; then
    echo "Deploying to staging environment..."
    if [ -f "docker-compose.staging.yml" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.staging.yml up -d --build
    else
        echo "Error: docker-compose.staging.yml not found. Please create staging configuration."
        exit 1
    fi
elif [ "$TARGET_ENV" == "dev" ]; then
    echo "Deploying to development environment..."
    if [ -f "docker-compose.dev.yml" ]; then
        docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
    elif [ -f "docker-compose.yml" ]; then
        docker-compose up -d --build
    else
        echo "Error: No Docker Compose configuration found. Please create docker-compose.yml."
        exit 1
    fi
else
    echo "Unknown environment: $TARGET_ENV. Allowed environments: production, staging, dev."
    echo "Ensure docker-compose files exist for the target environment."
    exit 1
fi

echo "Deployment to $TARGET_ENV complete."
