#!/bin/bash
# Deploy MeetMatch Bot to the server
set -e

# Configuration - SERVER_IP must be provided explicitly for security
SERVER_IP="${SERVER_IP:?SERVER_IP environment variable is required}"
SSH_USER="${SSH_USER:-root}"
REMOTE_DIR="/opt/apps/meetsmatch"

echo "Deploying MeetMatch Bot to $SERVER_IP:$REMOTE_DIR..."

# Sync code using rsync
# Using exclude file for maintainability
rsync -avz --delete \
    --exclude-from='.rsync-exclude' \
    ./ "$SSH_USER@$SERVER_IP:$REMOTE_DIR/"

echo "Code synced successfully."

# Instructions for next steps
echo "---------------------------------------------------"
echo "Deployment synced. You may need to:"
echo "1. SSH into the server: ssh $SSH_USER@$SERVER_IP"
echo "2. Go to the directory: cd $REMOTE_DIR"
echo "3. Update .env file if needed."
echo "4. Restart services: make api-run (in one terminal) and make bot-run (in another)"
echo "   Or use your process manager (systemd/pm2/docker) to restart services."
echo "---------------------------------------------------"
