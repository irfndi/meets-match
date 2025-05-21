# Development Guide for MeetMatch Telegram Bot

## Table of Contents
- [Project Overview](#project-overview)
- [Development Environment Setup](#development-environment-setup)
- [Project Structure](#project-structure)
- [Coding Conventions](#coding-conventions)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Deployment](#deployment)
- [Contributing](#contributing)

## Project Overview
Our Telegram bot helps users find and schedule meetups using AI-powered matching. Built with:
- TypeScript
- Bun runtime environment (for local development/testing)
- GrammyJS framework for Telegram bots
- Cloudflare D1 for persistent relational data
- Cloudflare KV for caching/session data (optional)
- Deployed as a Cloudflare Worker

## Development Environment Setup

### Prerequisites
- [Bun](https://bun.sh/) (includes runtime, package manager, test runner)
- Node.js & npm (needed for Wrangler)
- Git
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install/)

### Installation
```bash
# Clone the repository
git clone <repository_url>
cd meetsmatch

# Install dependencies using Bun
bun install

# Install Wrangler CLI globally (if not already installed)
npm install -g wrangler

# Authenticate Wrangler (if first time)
wrangler login
```

### Environment Variables
For local development with `wrangler dev`, create a `.dev.vars` file in the project root. This file is gitignored.
```env
# .dev.vars (DO NOT COMMIT)
TELEGRAM_TOKEN="your_local_test_bot_token"
# Add other secrets/vars needed locally, matching wrangler.toml bindings
# Example D1 Binding (matches wrangler.toml):
# DB = "YOUR_LOCAL_D1_DB_BINDING_ID"
```
Production secrets are managed via the Cloudflare dashboard.

### Running Locally
```bash
# Use Wrangler to run the Worker locally, simulating the Cloudflare environment
# This command reads wrangler.toml and uses .dev.vars
wrangler dev

# To run against a specific environment defined in wrangler.toml:
# wrangler dev --env <environment_name>
```

### Development Tools
- **Linting & Formatting**: [Biome](https://biomejs.dev/) (configured via `biome.json`). Use `bun run lint` and `bun run format`.
- **Testing**: Bun's built-in test runner. Use `bun test`.

## Project Structure
```
src/
├── bot/               # Core bot handlers
├── models/            # Database models
├── services/          # Business logic
├── utils/             # Helper functions
└── config.py          # Configuration loader

tests/                 # Unit & integration tests
scripts/               # Deployment/maintenance scripts
```

## Coding Conventions
1. **Type Annotations**:
   - Use TypeScript syntax
   - Strict type validation

2. **Error Handling**:
   - Use custom exceptions from `errors.ts`
   - Log errors with context using a logging library

3. **Telegram Bot Specific**:
   - Use GrammyJS's ContextTypes
   - Isolate handler logic in `/bot/handlers`

## Testing & Quality Assurance
- Goal: Achieve >95% test coverage, tracked via Codecov.
```bash
# Run all tests with coverage report
bun test --coverage

# Linting & formatting
bun run lint
bun run format
```

## Deployment
The bot is deployed as a Cloudflare Worker.

### Environment Configuration
- Use `.dev.vars` for local development secrets.
- Production secrets and bindings (D1, KV) are configured in `wrangler.toml` and the Cloudflare dashboard.

### Deployment Steps
Ensure wrangler.toml is configured correctly for the target environment.
```bash
# Deploy the worker to Cloudflare
wrangler deploy

# To deploy a specific environment:
# wrangler deploy --env <environment_name>
```

### CI/CD
- GitHub Actions are configured to automatically:
  - Run tests (`bun test --coverage`)
  - Run linters (`bun run lint`)
  - Deploy the Worker (`wrangler deploy`) on pushes to the main branch.
- Codecov reports are generated and uploaded during the CI process.

## Contributing
We use [GitHub Issues](https://github.com/irfndi/match-bot/issues) to track tasks, bugs, and features.

1. **Check for an existing Issue:** Before starting work, check if an issue already exists for the task. If not, consider creating one to discuss the proposed changes.
2. **Create feature branch:**
```bash
git checkout -b feat/your-feature-name
```
3. **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org).
4. **Open PR** against the `main` branch with:
   - A clear description of the changes.
   - A link to the relevant GitHub Issue (e.g., `Fixes #123` or `Relates to #456`).
   - Ensure tests pass and maintain >95% coverage.
   - Updated documentation if applicable.