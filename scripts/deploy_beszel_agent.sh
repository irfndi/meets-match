#!/bin/bash
# Deploy Beszel Agent to the server
set -e

# Configuration - SERVER_IP must be provided explicitly for security
SERVER_IP="${SERVER_IP:?SERVER_IP environment variable is required}"
SSH_USER="${SSH_USER:-root}"
BESZEL_PORT="${BESZEL_PORT:-45876}"

# The SSH public key must be provided as the first argument or via BESZEL_KEY environment variable
KEY="${1:-$BESZEL_KEY}"

if [ -z "$KEY" ]; then
    echo "Usage: $0 <ssh-public-key>" >&2
    echo "Or set the BESZEL_KEY environment variable" >&2
    exit 1
fi

# Validate the port is a positive integer to prevent word-splitting /
# shell metacharacter injection in the remote command.
case "$BESZEL_PORT" in
    ''|*[!0-9]*)
        echo "Error: BESZEL_PORT must be a number, got '$BESZEL_PORT'" >&2
        exit 1
        ;;
esac

# Validate the SSH public key: it must start with an ssh-* algorithm tag
# and contain no characters that could break out of the remote shell
# command (double quotes, dollar signs, backticks, backslashes, newlines).
case "$KEY" in
    ssh-rsa*|ssh-ed25519*|ssh-ecdsa*|ssh-dss*) ;;
    *)
        echo "Error: KEY must be an SSH public key (ssh-rsa/ssh-ed25519/ssh-ecdsa/ssh-dss)" >&2
        exit 1
        ;;
esac

# Reject any key containing a character that could break out of the
# double-quoted remote command (double quote, dollar, backtick, backslash,
# newline, or any other control character).
if printf '%s' "$KEY" | grep -q '["`$\\[:cntrl:]]'; then
    echo "Error: KEY contains shell metacharacters (quotes, \$, backticks, backslashes, or newlines)" >&2
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
