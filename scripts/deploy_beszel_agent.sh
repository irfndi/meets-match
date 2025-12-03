#!/bin/bash
# Deploy Beszel Agent to the server
set -e

# Configuration - can be overridden via environment variables
SERVER_IP="${SERVER_IP:-217.216.35.77}"
SSH_USER="${SSH_USER:-root}"
BESZEL_PORT="${BESZEL_PORT:-45876}"

# The SSH public key must be provided as the first argument or via BESZEL_KEY environment variable
KEY="${1:-$BESZEL_KEY}"

if [ -z "$KEY" ]; then
    echo "Usage: $0 <ssh-public-key>" >&2
    echo "Or set the BESZEL_KEY environment variable" >&2
    exit 1
fi

echo "Deploying Beszel Agent to $SERVER_IP..."

ssh "$SSH_USER@$SERVER_IP" "docker rm -f beszel-agent 2>/dev/null || true && \
docker run -d \
  --name beszel-agent \
  --restart unless-stopped \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e PORT=$BESZEL_PORT \
  -e KEY=\"$KEY\" \
  henrygd/beszel-agent"

echo "Beszel Agent deployed successfully!"
