#!/bin/bash
# Deploy Beszel Agent to the server
set -e

SERVER_IP="217.216.35.77"
USER="root"
PORT="45876"
# The public key provided by the user
KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHleR0ymtBMlJ7AlM+dhd8VqwJgQ7x9/RVO2XQV2hxjb"

echo "Deploying Beszel Agent to $SERVER_IP..."

ssh "$USER@$SERVER_IP" "docker rm -f beszel-agent 2>/dev/null || true && \
docker run -d \
  --name beszel-agent \
  --restart unless-stopped \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e PORT=$PORT \
  -e KEY='$KEY' \
  henrygd/beszel-agent"

echo "Beszel Agent deployed successfully!"
