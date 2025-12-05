#!/bin/bash
# Deploy OpenTelemetry Collector to the server
set -e

# Configuration - can be overridden via environment variables
SERVER_IP="${SERVER_IP:-217.216.35.77}"
SSH_USER="${SSH_USER:-root}"
REMOTE_DIR="/opt/otel"

echo "Deploying OpenTelemetry Collector to $SERVER_IP..."

# Create remote directory
ssh "$SSH_USER@$SERVER_IP" "mkdir -p $REMOTE_DIR"

# Copy configuration files
scp otel-collector-config.yaml "$SSH_USER@$SERVER_IP:$REMOTE_DIR/otel-collector-config.yaml"
scp docker-compose.otel.yml "$SSH_USER@$SERVER_IP:$REMOTE_DIR/docker-compose.yml"

# Deploy
ssh "$SSH_USER@$SERVER_IP" "cd $REMOTE_DIR && docker compose up -d --remove-orphans"

echo "OpenTelemetry Collector deployed successfully!"
echo "You can check logs with: ssh $SSH_USER@$SERVER_IP \"docker logs -f otel-collector\""
