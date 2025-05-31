#!/bin/bash
set -e

# Default environment is 'dev' if no argument is provided.
# PRD implies "staging" and "production". "dev" can be local or a shared dev deployment.
TARGET_ENV="${1:-dev}"

echo "Deploying worker to environment: $TARGET_ENV..."

# Ensure wrangler.toml has [env.staging] and [env.production] sections for this to work as intended.
# Example:
# [env.staging]
# name = "meetsmatch-bot-staging"
# # vars = { ENVIRONMENT = "staging" }
# # kv_namespaces = [ { binding = "FEATURE_FLAGS_KV", id = "staging_flags_id", preview_id="staging_flags_preview_id" } ]
#
# [env.production]
# name = "meetsmatch-bot-prod"
# # vars = { ENVIRONMENT = "production" }

if [ "$TARGET_ENV" == "production" ]; then
    read -p "You are about to deploy to PRODUCTION. Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Deployment to production aborted."
        exit 0
    fi
    echo "Deploying to production environment..."
    # Assumes [env.production] is defined in wrangler.toml
    wrangler deploy --env production
elif [ "$TARGET_ENV" == "staging" ]; then
    echo "Deploying to staging environment..."
    # Assumes [env.staging] is defined in wrangler.toml
    wrangler deploy --env staging
elif [ "$TARGET_ENV" == "dev" ]; then
    # This deploys the worker using the top-level/default configuration in wrangler.toml.
    # This could be a personal Cloudflare account worker or a shared dev worker.
    # For purely local iteration without deploying, 'npx wrangler dev --local' (or from scripts/dev.sh if created) is preferred.
    echo "Deploying to development environment (default worker configuration)..."
    wrangler deploy
else
    echo "Unknown environment: $TARGET_ENV. Allowed environments: production, staging, dev."
    echo "Ensure wrangler.toml defines [env.production] and [env.staging] for those targets."
    exit 1
fi

echo "Deployment to $TARGET_ENV complete."
