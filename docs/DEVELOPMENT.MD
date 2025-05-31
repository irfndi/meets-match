# Development Guide for MeetsMatch Telegram Bot (Rust Edition)

## Table of Contents
- [Project Overview](#project-overview)
- [Development Environment Setup](#development-environment-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Makefile Usage](#makefile-usage)
- [Feature Flags](#feature-flags)
- [Environments](#environments)
- [Deployment](#deployment)
- [CI/CD](#cicd)
- [Debugging](#debugging)
- [Contributing](#contributing)

## Project Overview
This Telegram bot is designed to help users find and schedule meetups. It's built using:
- **Rust** as the primary programming language, compiled to WebAssembly (Wasm).
- **Cloudflare Workers** as the serverless execution environment.
- The **`workers-rs`** crate (Cloudflare Workers Rust SDK) for interacting with the Workers runtime.
- **Cloudflare D1** for the primary database.
- **Cloudflare KV** for caching, session data, and feature flags.
- **Cloudflare R2** (potentially) for larger object storage.

## Development Environment Setup

### Prerequisites
1.  **Rust (Stable Toolchain):**
    Install Rust via `rustup` if you haven't already:
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
    # Follow the on-screen instructions, then ensure the toolchain is up to date:
    rustup update stable
    ```
2.  **`wasm-pack`:**
    This tool is used to build Rust-generated WebAssembly and JavaScript bindings.
    ```bash
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
    ```
3.  **Node.js and npm:**
    Required for installing and running `wrangler`. Download from [nodejs.org](https://nodejs.org/).
4.  **Wrangler CLI:**
    The command-line tool for managing Cloudflare Workers projects.
    ```bash
    npm install -g wrangler
    ```
    After installation, log in to your Cloudflare account:
    ```bash
    wrangler login
    ```
5.  **Git:** For version control.

### Installation Steps
1.  **Clone the repository:**
    ```bash
    # Replace with the correct repository URL
    git clone https://github.com/irfndi/meetsmatch-py.git
    cd meetsmatch-py
    ```
2.  **Set up local environment configuration:**
    Use the Makefile target to create an example environment file:
    ```bash
    make setup-dev-env
    # This runs scripts/setup_env_dev.sh and creates .env.example
    ```
3.  **Configure your `.env` file:**
    Copy the example to `.env` and customize it for your local development needs. This is particularly important if you plan to use `wrangler dev` with specific preview IDs for KV or D1 namespaces.
    ```bash
    cp .env.example .env
    # Open .env and fill in necessary values (e.g., CF_ACCOUNT_ID, preview IDs)
    ```
    For detailed information on environment variables and `wrangler.toml` setup for different environments, see [ENVIRONMENTS.MD](ENVIRONMENTS.MD).

## Project Structure
- `src/`: Contains all Rust source code.
  - `lib.rs`: The main entry point for the Cloudflare Worker.
  - `utils.rs`: Utility functions.
  - `<service_name>/mod.rs`: Individual service modules (e.g., `user_service`, `config_service`).
- `tests/`: Contains integration tests (unit tests are typically co-located within `src/`).
- `worker/`: (Generated) Output directory for the compiled Wasm and JS shim from `wasm-pack`.
- `scripts/`: Helper shell scripts for tasks like building, linting, testing, deploying.
- `Cargo.toml`: Rust package manifest (dependencies, workspace config).
- `Makefile`: For easy execution of common development tasks.
- `wrangler.toml`: Configuration for Cloudflare Wrangler.
- `docs/`: Project documentation.

## Development Workflow

### Building the Worker
Compile the Rust code to WebAssembly using `wasm-pack` (via Makefile):
```bash
make build
```
This command typically invokes `wasm-pack build --target bundler -d worker`.

### Formatting Code
Keep your code consistently formatted using `rustfmt`:
```bash
cargo fmt
# Or use the Makefile check which includes formatting:
make check
```

### Linting
Check for common mistakes and code style issues using `clippy`:
```bash
cargo clippy -- -D warnings
# Or use the Makefile check:
make check
```
The `-D warnings` flag treats warnings as errors.

### Running Tests
Execute unit and integration tests:
```bash
make test
# This typically runs `cargo test`.
```
For code coverage, see the [Testing & Quality Assurance](#testing--quality-assurance) section.

### Running Locally
Simulate the Cloudflare environment and run your worker locally using `wrangler dev`:
```bash
wrangler dev
```
This command reads `wrangler.toml`. If an `[env.dev]` section is present, its configuration (including variables and bindings with `preview_id`s) will be used. Ensure your `.env` file is set up if your `wrangler.toml` or local workflow relies on it (e.g. for `dotenv_override` in `wrangler dev` or scripts sourcing it).

## Testing & Quality Assurance
- **Unit Tests:** Written within each Rust module.
- **Integration Tests:** May reside in the `tests/` directory.
- **Coverage:** Code coverage is generated using `cargo-llvm-cov`. The CI pipeline runs this and uploads reports to Codecov.
  To run coverage locally (if `cargo-llvm-cov` is installed: `cargo install cargo-llvm-cov`):
  ```bash
  cargo llvm-cov --all-features --workspace --lcov --output-path coverage/lcov.info
  # Or generate an HTML report
  cargo llvm-cov --all-features --workspace --html --output-dir coverage/html
  ```
- **Local CI Simulation:** Run all primary checks (format, lint, test) as the CI server would:
  ```bash
  make ci
  ```

## Makefile Usage
The project includes a `Makefile` for common operations. View all available commands:
```bash
make help
```
Key targets include `make build`, `make check`, `make test`, `make ci`, `make clean`, `make deploy-dev`, etc.

## Feature Flags
The application supports dynamic feature flags managed via Cloudflare KV. For details on how to configure and update these flags, refer to [FEATURE_FLAGS.MD](FEATURE_FLAGS.MD).

## Environments
The project is configured for multiple environments (dev, staging, production) using `wrangler.toml`. For details on environment-specific configurations, variables, and deployment, see [ENVIRONMENTS.MD](ENVIRONMENTS.MD).

## Deployment
Deployments are handled by Wrangler, orchestrated via the `Makefile` and `scripts/deploy.sh`.
- Deploy to development: `make deploy-dev`
- Deploy to staging: `make deploy-staging`
- Deploy to production: `make deploy-prod` (includes a confirmation prompt)

These commands use `wrangler deploy --env <environment_name>`, which relies on the configurations in `wrangler.toml`.

## CI/CD
- **Provider:** GitHub Actions (`.github/workflows/ci.yml`).
- **Key Stages:**
  1.  Checkout code.
  2.  Setup Rust, `wasm-pack`, `cargo-llvm-cov`.
  3.  Run format checks (`cargo fmt -- --check`).
  4.  Run linter (`cargo clippy -- -D warnings`).
  5.  Run tests with code coverage (`cargo llvm-cov`).
  6.  Upload coverage report to Codecov.
  7.  Build the Wasm worker (`wasm-pack build`).
  8.  On pushes to `main`, deploy to the production environment using Wrangler.

## Debugging
- **Logging:** Use `console_log!`, `console_warn!`, and `console_error!` macros from the `worker` crate. These logs will appear in the `wrangler dev` console output during local development.
- **Cloudflare Logs:** For deployed workers, view logs in the Cloudflare dashboard under your Worker's details.
- **Error Handling:** Implement robust error handling using Rust's `Result` type. `console_error_panic_hook` is set up in `src/utils.rs` to provide better panic messages in Wasm.

## Contributing
Please refer to `CONTRIBUTING.md` for guidelines on contributing to this project. (If `CONTRIBUTING.md` does not exist, this is a good place to add one).
Ensure your changes pass `make ci` locally before submitting a pull request.
