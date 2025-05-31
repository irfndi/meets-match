# Technical Documentation for MeetsMatch Telegram Bot (Rust Edition)

This document outlines the core technologies, libraries, and tools used in the development of this Telegram bot, now built with Rust and deployed on Cloudflare Workers.

## Core Technologies

*   **Rust (Latest Stable Edition):** The primary programming language, offering performance, safety, and modern tooling. Compiled to WebAssembly (Wasm).
*   **WebAssembly (Wasm):** The compilation target for the Rust code, enabling it to run in serverless environments like Cloudflare Workers.
*   **Cloudflare Workers:** Serverless execution environment for running the Wasm-compiled Rust code globally.
*   **Cloudflare D1:** Serverless SQL database (SQLite compatible) for persistent relational data (e.g., user profiles, matches).
*   **Cloudflare KV:** Global, low-latency key-value store used for caching, session data, and dynamic configuration like feature flags.
*   **Cloudflare R2 (Optional):** S3-compatible object storage, available for storing larger files or media if needed.

## Key Libraries and Tools (Rust Ecosystem)

*   **`workers-rs` (Cloudflare Workers Rust SDK):** Essential crate for writing Cloudflare Workers in Rust. Provides types, macros (`#[event(fetch)]`), and bindings to interact with the Workers runtime environment (e.g., `Request`, `Response`, `Env`).
*   **`wasm-pack`:** Tool for building Rust-generated WebAssembly and JavaScript bindings, packaging it for use in environments like Cloudflare Workers.
*   **`cargo`:** The Rust package manager and build tool, used for managing dependencies, building the project, running tests, etc.
*   **`serde` (`serde_json`):** Framework for serializing and deserializing Rust data structures efficiently, commonly used for JSON.
*   **`console_error_panic_hook`:** Utility to forward Rust panics to the browser console or Cloudflare Worker logs, improving debuggability of Wasm modules.
*   **`chrono`:** Crate for date and time manipulation.
*   **`url`:** Crate for URL parsing and manipulation.
*   **`http`:** Crate providing HTTP types (Request, Response, Headers, etc.).
*   **`cargo-llvm-cov`:** Tool for collecting code coverage information for Rust projects.
*   **`rustfmt`:** Code formatter for Rust, ensuring consistent style.
*   **`clippy`:** Rust linter to catch common mistakes and improve code quality.
*   **`reqwest` (Optional):** A popular HTTP client for making outbound requests from the worker, if needed.

## Development Environment

*   **Rust Toolchain (via `rustup`):** Manages Rust versions and components (compiler, `cargo`, `rustfmt`, `clippy`).
*   **`wasm-pack`:** For building the Wasm worker.
*   **Node.js & npm:** Required for `wrangler`.
*   **`wrangler` CLI:** The primary tool for local development (`wrangler dev`), managing Cloudflare resources (D1, KV, R2), and deploying the worker.
*   **Code Editor/IDE:** With Rust support (e.g., VS Code with `rust-analyzer` extension).
*   **Git:** For version control.
*   **Makefile:** Provides convenient shortcuts for common development tasks.

## CI/CD Tools

*   **GitHub Actions:** Automates the build, test, and deployment pipeline defined in `.github/workflows/ci.yml`.
    *   Checks include: `cargo fmt -- --check`, `cargo clippy -- -D warnings`.
    *   Testing: `cargo llvm-cov` for running tests and generating coverage reports.
    *   Deployment: `wrangler deploy` for publishing the worker to Cloudflare.
*   **Codecov:** Integrated with GitHub Actions to track code coverage over time and provide reports.

## Testing Framework

*   **Rust's Built-in Test Framework:** Used for writing unit and integration tests (`#[test]` attribute). `cargo test` is the command to run these.
*   **`cargo-llvm-cov`:** Used in CI (and locally) to generate code coverage reports from test runs.

## Code Quality Tools

*   **`rustfmt`:** Enforces consistent code style. Run via `cargo fmt`.
*   **`clippy`:** Provides extensive linting to catch errors and improve code. Run via `cargo clippy`.
    Both are typically executed via `make check` or `make ci`.

## Monitoring and Analytics

*   **Cloudflare Workers Analytics:** Provides metrics for requests, CPU time, errors, etc., accessible via the Cloudflare dashboard.
*   **Cloudflare Logs:** Access to worker logs (from `console_log!`, `console_error!`, etc.) via the Cloudflare dashboard or `wrangler tail`.
*   **`console_log!`, `console_warn!`, `console_error!` (from `workers-rs`):** Used within the Rust code for logging.
*   **Codecov:** Tracks code coverage trends, which is an indirect measure of code quality and testing thoroughness.

## Deployment

*   **Cloudflare Worker:** The application is deployed as a Wasm module with a JS shim.
*   **`wrangler.toml`:** Central configuration file for `wrangler`. Defines the worker name, entry point, compatibility settings, environments (`dev`, `staging`, `production`), and bindings to Cloudflare services (D1, KV, R2).
*   **`wrangler deploy`:** The command used to publish the worker. The `Makefile` and `scripts/deploy.sh` provide helpers (`make deploy-dev`, etc.) to deploy specific environments.

## Key Concepts (Rust on Cloudflare Workers)

*   **Compilation to Wasm:** Rust code is compiled to WebAssembly, allowing it to run in the Cloudflare Workers environment.
*   **`workers-rs` SDK:** Provides the necessary abstractions to interact with the Worker runtime (handling requests, accessing bindings, etc.).
*   **Event Handlers (`#[event(fetch)]`):** The primary way to define the worker's entry point for handling HTTP requests.
*   **Bindings:** Securely configured access to Cloudflare resources like D1 databases, KV namespaces, R2 buckets, and secrets. These are defined in `wrangler.toml` and accessed via the `Env` object in Rust.
*   **`Cargo.toml` & Crates:** Dependencies (crates) are managed in `Cargo.toml`. The Rust ecosystem provides a rich set of libraries.
*   **Error Handling:** Rust's `Result<T, E>` enum is heavily used for robust error handling.
*   **Ownership and Borrowing:** Core Rust concepts ensuring memory safety without a garbage collector.

## Data Persistence & Storage

*   **Cloudflare D1:** Primary storage for structured, relational data (e.g., user information, application state).
*   **Cloudflare KV:** Used for:
    *   **Feature Flags:** Dynamically enabling/disabling features.
    *   **Caching:** Storing frequently accessed data to reduce D1 load.
    *   **Session Management:** Storing temporary user session data.
*   **Cloudflare R2 (Potentially):** For storing larger binary objects like user-uploaded files, if required by the application.

## Architectural Diagrams

(The existing Mermaid diagrams for System Components and Service Interactions are likely still relevant at a high level, but the implementation details within the "Worker" component are now Rust-based.)

### System Components
```mermaid
graph LR
    A[Telegram API] <--> B(Cloudflare Worker [Rust/Wasm])
    B <--> C[(D1 Database)]
    B <--> D[(KV Store)]
    B <--> E[(R2 Storage - Optional)]
```

### Service Interactions (Example: User Registration)
```mermaid
sequenceDiagram
    User->>+Telegram: /start command
    Telegram->>+Worker: Webhook POST (User Info)
    Worker->>+D1: Check if user exists
    D1-->>-Worker: User record or not found
    alt User Not Found
        Worker->>D1: Create new user record
        D1-->>-Worker: New user created
    end
    Worker->>+ConfigService: Get Feature Flags (from KV)
    ConfigService-->>-Worker: Flags
    Worker->>Telegram: Send welcome message (potentially varied by flags)
    Telegram-->>-User: Display welcome message
```

This document provides a snapshot of the current technology stack. As the project evolves, specific libraries or tools might be added or changed. Always refer to `Cargo.toml` for the definitive list of Rust dependencies.
