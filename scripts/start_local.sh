#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}Starting MeetsMatch Bot Locally...${NC}"

# Check for uv
if ! command -v uv &> /dev/null; then
    echo -e "${RED}Error: uv is not installed.${NC}"
    echo "Install it with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi

# Check for Redis
if ! pgrep redis-server > /dev/null; then
    echo -e "${RED}Warning: Redis is not running.${NC}"
    echo "Please start Redis (e.g., brew services start redis)"
    # We don't exit here, just warn, as it might be running in a way pgrep doesn't see or remote
fi

# Check for Postgres (simple check if port 5432 is listening)
if ! nc -z localhost 5432; then
    echo -e "${RED}Warning: PostgreSQL does not seem to be listening on port 5432.${NC}"
    echo "Please start PostgreSQL (e.g., brew services start postgresql)"
fi

# Sync dependencies
echo "Syncing dependencies..."
uv sync

# Run the bot
echo -e "${GREEN}Launching bot...${NC}"
uv run python main.py
