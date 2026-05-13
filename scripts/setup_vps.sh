#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Starting VPS Setup for MeetMatch Bot...${NC}"

# 1. Update System
echo "Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Dependencies (Postgres, Redis, Git, Curl)
echo "Installing dependencies..."
sudo apt-get install -y postgresql postgresql-contrib redis-server git curl

# 3. Install Go
echo "Installing Go..."
GO_VERSION="1.25.9"
wget -q "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz"
sudo tar -C /usr/local -xzf "go${GO_VERSION}.linux-amd64.tar.gz"
rm "go${GO_VERSION}.linux-amd64.tar.gz"
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
export PATH=$PATH:/usr/local/go/bin

# 4. Install Bun
echo "Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# 5. Install buf
echo "Installing buf..."
BUF_VERSION="1.47.2"
curl -sSL "https://github.com/bufbuild/buf/releases/download/v${BUF_VERSION}/buf-Linux-x86_64" -o /usr/local/bin/buf
chmod +x /usr/local/bin/buf

# 6. Setup Application Directory
echo "Setting up application directory..."
sudo mkdir -p /opt/meetsmatch
sudo chown -R $USER:$USER /opt/meetsmatch
chmod 700 /opt/meetsmatch

# 7. Setup Database
echo "Setting up PostgreSQL..."
DB_PASSWORD=$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)

if ! sudo -u postgres psql -t -c '\du' | cut -d \| -f 1 | grep -qw meetsmatch; then
    sudo -u postgres psql -c "CREATE USER meetsmatch WITH PASSWORD '$DB_PASSWORD';"
    sudo -u postgres psql -c "CREATE DATABASE meetsmatch OWNER meetsmatch;"
    umask 077
    printf "DATABASE_URL=postgres://meetsmatch:%s@localhost:5432/meetsmatch?sslmode=require\n" "$DB_PASSWORD" > /opt/meetsmatch/.env
    echo "Database created. DATABASE_URL written to /opt/meetsmatch/.env"
else
    echo "Database user already exists."
fi

echo -e "${GREEN}Setup complete!${NC}"
echo "Next steps:"
echo "1. Copy your code to /opt/meetsmatch (use scripts/deploy_app.sh)"
echo "2. Review /opt/meetsmatch/.env and add BOT_TOKEN and other variables from .env.example"
echo "3. Build and start services:"
echo "   cd /opt/meetsmatch/services/api && go build -o bin/api cmd/api/main.go && ./bin/api &"
echo "   cd /opt/meetsmatch/services/bot && bun install && bun run start &"
echo "   cd /opt/meetsmatch/services/worker && go build -o bin/worker cmd/worker/main.go && ./bin/worker &"
echo "4. Or use systemd services for production process management"
