#!/bin/bash
set -e

ENV_FILE=".env"
EXAMPLE_ENV_FILE=".env.example"

echo "Setting up development environment configuration..."

if [ -f "$ENV_FILE" ]; then
    echo "$ENV_FILE already exists. Please check it or remove it to re-generate."
    # Optionally, ask to overwrite:
    # read -p "$ENV_FILE already exists. Overwrite? (y/N): " confirm
    # if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    #     echo "Setup aborted."
    #     exit 0
    # fi
fi

# Create an example .env file if it doesn't exist
if [ ! -f "$EXAMPLE_ENV_FILE" ]; then
    echo "Creating $EXAMPLE_ENV_FILE with default values..."
    cat <<EOL > $EXAMPLE_ENV_FILE
# Cloudflare Account ID - Get from your Cloudflare dashboard
# CF_ACCOUNT_ID="your_account_id"

# Telegram Bot Token - Get from BotFather
# TELEGRAM_TOKEN="your_telegram_bot_token"

# Environment Name (dev, staging, prod)
ENVIRONMENT="dev"

# Log Level (DEBUG, INFO, WARN, ERROR)
LOG_LEVEL="DEBUG"

# For local 'wrangler dev', KV namespaces might need preview IDs
# If you have a KV namespace for feature flags:
# FEATURE_FLAGS_KV_PREVIEW_ID="your_feature_flags_kv_preview_id"
# SESSIONS_KV_PREVIEW_ID="your_sessions_kv_preview_id"
EOL
    echo "$EXAMPLE_ENV_FILE created. Please fill it with your actual values."
fi

echo "To complete setup, copy $EXAMPLE_ENV_FILE to $ENV_FILE and fill in your specific values:"
echo "cp $EXAMPLE_ENV_FILE $ENV_FILE"
echo "Then, edit $ENV_FILE with your details."
echo ""
echo "For 'wrangler dev' to pick up these variables, ensure they are also in wrangler.toml [vars] or configured as secrets for deployed workers."
echo "The .env file is primarily for 'wrangler dev' when using 'dotenv_override = true' in wrangler.toml or for scripts that source it."
echo "Note: Secrets like TELEGRAM_TOKEN should ideally not be in .env for production but configured via Wrangler secrets."
echo "Development environment setup script complete."
