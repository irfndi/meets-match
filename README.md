# MeetsMatch Telegram Bot (Rust Edition)

[![CI](https://github.com/irfndi/meetsmatch-py/actions/workflows/ci.yml/badge.svg)](https://github.com/irfndi/meetsmatch-py/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/irfndi/meetsmatch-py/branch/main/graph/badge.svg)](https://codecov.io/gh/irfndi/meetsmatch-py)

This project is a Telegram bot, built with Rust and running on Cloudflare Workers, designed to help users find and schedule meetups.

## Project Overview & Features

The bot leverages the power of Rust for performance and safety, compiled to WebAssembly (Wasm) to run efficiently on the Cloudflare serverless platform. It interacts with Cloudflare services like D1 for database, KV for caching/feature flags, and potentially R2 for storage.

Current key features include:
- User interaction initiated via the `/start` command.
- A basic onboarding flow that collects the user's name.
- Profile editing for fields like Name, Age, Gender, Bio, and Location (textual or shared Telegram location), managed through an interactive conversational flow using Cloudflare KV for session state.
- Media management: Users can upload photos/videos (stored in R2), see them listed in their profile, and delete them. Max 5 media items per user.
- Display of a main menu for registered and active users, with commands like `/profile`, `/find_match`, `/help`.
- The `/profile` command allows users to view their currently stored profile information, including a list of their media items.
- A foundational Role-Based Access Control (RBAC) system to manage command permissions for different user roles (e.g., `User`, `Admin`).
- Tracking of user interaction times (`last_interaction_at`) as a basis for future session management (placeholder timeout logic exists).
- Modularized service architecture (e.g., `UserService`, `ConfigService`, `RBACService`, `MediaService`).
- Command handling through a dispatcher pattern for better organization and scalability.
- Input validation for profile fields during editing.

## Project Structure

- `src/lib.rs`: The main library entry point for the Cloudflare Worker, including command dispatching logic.
- `src/user_service/mod.rs`: Manages user data in D1 (profile, state, roles, media keys).
- `src/config_service/mod.rs`: Handles application configuration (feature flags, env vars).
- `src/rbac_service/mod.rs`: Manages user roles and command permissions.
- `src/media_service/mod.rs`: Handles media file interactions with Cloudflare R2 (upload, delete, URL generation).
- `src/<other_service>/mod.rs`: Other modular services (e.g., matching, communication).
- `Cargo.toml`: The Rust package manifest, managing dependencies and build settings.
- `worker/`: (Generated) Output directory for the compiled Wasm binary and JavaScript shim from `wasm-pack`.
- `scripts/`: Contains helper shell scripts for common tasks like building, testing, and deploying.
- `Makefile`: Provides convenient `make` commands for development and CI operations.
- `wrangler.toml`: Configuration file for Cloudflare Wrangler CLI, defining environments, bindings, and build settings.
- `docs/`: Contains detailed documentation files.

## Getting Started

### Prerequisites
- **Rust:** Install via [rustup](https://rustup.rs/) (`rustup install stable`).
- **`wasm-pack`:** Install via `curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh`.
- **`wrangler` CLI:** Install via `npm install -g wrangler`. Ensure you can log in (`wrangler login`).
- **Node.js & npm:** Required for Wrangler.
- **Git:** For cloning the repository.

### Setup
1.  **Clone the repository:**
    ```bash
    git clone https://github.com/irfndi/meetsmatch-py.git # Replace with your repo URL if different
    cd meetsmatch-py
    ```
2.  **Set up environment configuration:**
    Run `make setup-dev-env` or `scripts/setup_env_dev.sh`. This creates an `.env.example` file.
    ```bash
    make setup-dev-env
    ```
3.  **Configure local environment:**
    Copy the example file to `.env` and customize it with your local development settings (e.g., Cloudflare account ID, preview KV/D1 IDs if you intend to use them with `wrangler dev`).
    ```bash
    cp .env.example .env
    # Then edit .env with your specific values
    ```
    Refer to `docs/ENVIRONMENTS.MD` for more details on environment setup.
    Note: User commands like `/profile edit` and others are subject to Role-Based Access Control (RBAC). New users start with a default `User` role.

### Development Cycle
- **Build:** Compile the Rust code to Wasm.
  ```bash
  make build
  ```
- **Check Code (Format & Lint):**
  ```bash
  make check
  ```
- **Test:** Run unit tests.
  ```bash
  make test
  ```
- **Run Locally:** Use `wrangler dev` to run the worker locally. This typically uses the `[env.dev]` configuration from `wrangler.toml`.
  ```bash
  wrangler dev
  ```

## Key Makefile Commands

- `make all` or `make build`: Build the Rust Wasm worker.
- `make check`: Check formatting (rustfmt) and lint (clippy).
- `make test`: Run tests.
- `make ci`: Run local CI checks (format, lint, test).
- `make deploy-dev`: Deploy to the development environment.
- `make deploy-staging`: Deploy to the staging environment.
- `make deploy-prod`: Deploy to the production environment.
- `make setup-dev-env`: Initialize development environment configuration.
- `/profile`: View your user profile (including media list).
- `/profile edit`: Start an interactive session to edit your profile fields.
- `/profile add_media`: Initiate adding a photo/video to your profile.
- `/profile delete_media`: Initiate deleting a media item from your profile.
- `make clean`: Remove build artifacts.
- `make help`: Display all available Makefile targets.

## Documentation

For more detailed information, please refer to the `docs/` directory:
- **[DEVELOPMENT.MD](docs/DEVELOPMENT.MD):** Development process, coding conventions, and detailed setup instructions.
- **[TECH.MD](docs/TECH.MD):** Technical details about the architecture, technologies, libraries, and tools used.
- **[FEATURE.MD](docs/FEATURE.MD):** (To be updated) Features of the bot including commands and their descriptions.
- **[FEATURE_FLAGS.MD](docs/FEATURE_FLAGS.MD):** How to manage feature flags using Cloudflare KV.
- **[ENVIRONMENTS.MD](docs/ENVIRONMENTS.MD):** Configuration and deployment for different environments (dev, staging, prod).

## CI/CD

Continuous Integration and Deployment are managed via GitHub Actions. The workflow (`.github/workflows/ci.yml`) includes:
- Code formatting checks (`rustfmt`).
- Linting (`clippy`).
- Running tests with code coverage (`cargo-llvm-cov`).
- Building the Wasm worker.
- Deploying to Cloudflare Workers on pushes to the `main` branch (for the production environment).

## Code Coverage

Code coverage is tracked using [Codecov](https://codecov.io/gh/irfndi/meetsmatch-py). The goal is to maintain high test coverage.

## Contributing

Contributions are welcome! Please refer to `docs/CONTRIBUTING.md` (if it exists, or create one) and ensure that your contributions pass all CI checks.

*(Self-correction: The GitHub repo URL in badges and clone command should be generic or correct. The current one `irfndi/meetsmatch-py` seems to be a placeholder from the original problem description, but I'll keep it as is for now since I cannot verify the actual URL.)*
