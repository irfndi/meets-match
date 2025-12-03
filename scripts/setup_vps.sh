#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Starting VPS Setup for MeetsMatch Bot...${NC}"

# 1. Update System
echo "Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Dependencies (Postgres, Redis, Git, Curl)
echo "Installing dependencies..."
sudo apt-get install -y postgresql postgresql-contrib redis-server git curl

# 3. Install uv
echo "Installing uv..."
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env

# 4. Setup Database
echo "Setting up PostgreSQL..."
# Check if user exists, if not create
if ! sudo -u postgres psql -t -c '\du' | cut -d \| -f 1 | grep -qw meetsmatch; then
    sudo -u postgres psql -c "CREATE USER meetsmatch WITH PASSWORD 'secure_password_change_me';"
    sudo -u postgres psql -c "CREATE DATABASE meetsmatch OWNER meetsmatch;"
    echo "Database created. IMPORTANT: Change the password in .env!"
else
    echo "Database user already exists."
fi

# 5. Setup Application Directory
echo "Setting up application directory..."
sudo mkdir -p /opt/meetsmatch
sudo chown -R $USER:$USER /opt/meetsmatch

# Note: You would typically clone the repo here or copy files
# git clone https://github.com/your/repo.git /opt/meetsmatch

echo -e "${GREEN}Setup complete!${NC}"
echo "Next steps:"
echo "1. Copy your code to /opt/meetsmatch"
echo "2. Create .env file from .env.example"
echo "3. Run 'uv sync'"
echo "4. Install systemd service: sudo cp meetsmatch.service /etc/systemd/system/ && sudo systemctl enable --now meetsmatch"
echo "5. Setup media cleanup cron job:"
echo "   (crontab -l 2>/dev/null; echo \"0 0 * * * /root/.local/bin/uv run python /opt/meetsmatch/scripts/cleanup_media.py >> /var/log/meetsmatch_cleanup.log 2>&1\") | crontab -"
