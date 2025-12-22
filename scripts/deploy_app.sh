#!/bin/bash
# Deploy MeetMatch Bot to the server
set -e

# Configuration
SERVER_IP="${SERVER_IP:-217.216.35.77}"
SSH_USER="${SSH_USER:-root}"
REMOTE_DIR="/opt/apps/meetsmatch"

echo "Deploying MeetMatch Bot to $SERVER_IP:$REMOTE_DIR..."

# Sync code using rsync
# Exclude heavy/unnecessary files
rsync -avz --delete \
    --exclude '.git' \
    --exclude '.venv' \
    --exclude 'node_modules' \
    --exclude '__pycache__' \
    --exclude '.pytest_cache' \
    --exclude '.ruff_cache' \
    --exclude '.mypy_cache' \
    --exclude '.env' \
    --exclude 'db' \
    --exclude 'cache' \
    --exclude 'data' \
    --exclude 'log' \
    --exclude 'backups' \
    --exclude 'tmp' \
    ./ "$SSH_USER@$SERVER_IP:$REMOTE_DIR/"

echo "Code synced successfully."

# Instructions for next steps
echo "---------------------------------------------------"
echo "Deployment synced. You may need to:"
echo "1. SSH into the server: ssh $SSH_USER@$SERVER_IP"
echo "2. Go to the directory: cd $REMOTE_DIR"
echo "3. Update .env file if needed."
echo "4. Run 'make up' to restart the services with new code."
echo "---------------------------------------------------"
