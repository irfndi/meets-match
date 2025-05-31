# Technical Documentation for MeetsMatch Telegram Bot (Rust Edition)

This document outlines the core technologies, architecture, libraries, and tools used in the development of this Telegram bot, built with Rust and deployed on Cloudflare Workers.

## Architecture Overview
The bot operates as a single Cloudflare Worker written in Rust and compiled to WebAssembly (Wasm).
- **Request Handling:** Incoming Telegram webhook requests are processed by the main `fetch` handler in `src/lib.rs`. This handler now also distinguishes between text, location, and media (photo/video/document) messages for initial routing.
- **Command Dispatching:** A dispatcher pattern (`dispatch_command` function) routes recognized text commands (e.g., `/profile`, `/help`, `/profile edit`, `/profile add_media`, `/profile delete_media`) to specific handler functions. The `/start` command has dedicated pre-dispatcher handling.
- **Session Management (for multi-step interactions):** Cloudflare KV (via `SESSIONS_KV` binding) stores temporary session state for profile editing and media management flows. This uses `ProfileEditingSession` with `CurrentEditingStep` (now including `AwaitingMediaFile`, `AwaitingMediaDeletionChoice`) and `EditingField` enums. Sessions have a TTL (e.g., 15 minutes).
- **Service Layer:**
    - `UserService`: Manages user data in D1, including profile fields (name, age, gender, bio, location, `media_keys` list), state, roles, and interaction timestamps. Provides CRUD operations for users and specific field/media key updates.
    - `ConfigService`: Handles feature flags (from KV) and environment variables.
    - `RBACService`: Manages command authorization based on user roles.
    - `MediaService`: Interfaces with Cloudflare R2 (via `MEDIA_BUCKET` binding) for media file storage (upload, delete) and key generation.
    - Other placeholder services.
- **Data Persistence & Storage:**
    - Cloudflare D1: For the `users` table (including new profile fields and `media_keys` as JSON text).
    - Cloudflare KV: For feature flags and `ProfileEditingSession` data.
    - Cloudflare R2: For storing actual media files (photos, videos) uploaded by users, referenced by keys in `User.media_keys`.
- **External API Interaction:**
    - Telegram Bot API: Used for receiving messages (text, location, photo, video, document) and sending responses. The `getFile` method and file download URLs are used to retrieve user-uploaded media. Requires `TELEGRAM_TOKEN` secret.

## Core Technologies

*   **Rust (Latest Stable Edition):** The primary programming language, offering performance, safety, and modern tooling. Compiled to WebAssembly (Wasm).
*   **WebAssembly (Wasm):** The compilation target for the Rust code, enabling it to run in serverless environments like Cloudflare Workers.
*   **Cloudflare Workers:** Serverless execution environment for running the Wasm-compiled Rust code globally.
*   **Cloudflare D1:** Serverless SQL database (SQLite compatible) for persistent relational data (e.g., user profiles, matches).
*   **Cloudflare KV:** Global, low-latency key-value store used for caching, session data, and dynamic configuration like feature flags.
*   **Cloudflare R2 (Optional):** S3-compatible object storage, available for storing larger files or media if needed.

## Key Libraries and Tools (Rust Ecosystem)

*   **`workers-rs` (Cloudflare Workers Rust SDK):** Essential crate for writing Cloudflare Workers in Rust. Provides types, macros (e.g., `#[event(fetch)]`), and bindings to interact with the Workers runtime.
*   **`wasm-pack`:** Tool for building Rust-generated WebAssembly and JavaScript bindings.
*   **`cargo`:** Rust's package manager and build system.
*   **`serde` & `serde_json`:** For efficient serialization and deserialization of Rust data structures, particularly for JSON interactions with Telegram API and D1 (for JSON-formatted fields like `roles`).
*   **`console_error_panic_hook`:** Forwards Rust panics to browser/worker console for better debugging.
*   **`chrono`:** Date and time manipulation, used for `created_at`, `updated_at`, `last_interaction_at`.
*   **Core Internal Components:**
    - `UserService`: Manages user lifecycle, profile data (including `media_keys`), state, and persistence.
    *   `ConfigService`: Manages dynamic configuration and feature flags.
    *   `RBACService`: Handles role-based command authorization.
    - `MediaService`: Manages R2 bucket interactions for media.
    - Command Dispatcher & specific command handlers (in `src/lib.rs`).

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

*   **Rust's Built-in Test Framework (`#[test]`):** Used for unit tests within modules.
*   **`cargo test`:** Command to run these tests.
*   **`cargo-llvm-cov`:** Used in CI (and locally) for code coverage reports.
*   **Integration Testing (Future):** Requires a test harness like `mf-test` for full environment simulation with D1/KV.

## Code Quality Tools

*   **`rustfmt`:** Enforces consistent code style (`make check` or `cargo fmt`).
*   **`clippy`:** Rust linter for catching common errors and improving code (`make check` or `cargo clippy -- -D warnings`).
    Both are part of the local `make ci` checks and the GitHub Actions CI pipeline.

## Monitoring and Analytics

*   **Cloudflare Workers Analytics:** Built-in metrics (requests, CPU, errors) via Cloudflare dashboard.
*   **Cloudflare Logs:** Access to worker logs (`console_log!`, etc.) via `wrangler tail` or Cloudflare dashboard.
*   **Codecov:** Tracks code coverage trends.

## Security
- **Role-Based Access Control (RBAC):**
    - Implemented via `RBACService` in `src/rbac_service/mod.rs`.
    - User roles (e.g., `User`, `Admin`) are defined in the `Role` enum and stored as part of the `User` data in D1 (as a JSON string array).
    - `RBACService::check_permission` is called by the command dispatcher.
    - New users default to the `User` role.
- **Secrets Management:** API keys (e.g., `TELEGRAM_TOKEN`) are managed via `wrangler secret put` and accessed as environment secrets.
- **Input Validation:**
    - Synchronous validation functions (e.g., `validate_name`, `validate_age`) are defined in `src/lib.rs` (or a dedicated `validation.rs`).
    - These functions use a `ValidationError` enum to return specific error types.
    - They are employed during profile editing (in `handle_text_message`) to validate user-provided values before updating the database.

## Deployment

*   **Cloudflare Worker:** The application is deployed as a Wasm module with a JS shim.
*   **`wrangler.toml`:** Central configuration file for `wrangler`. Defines the worker name, entry point, compatibility settings, environments (`dev`, `staging`, `production`), and bindings to Cloudflare services (D1, KV, R2).
*   **`wrangler deploy`:** The command used to publish the worker. The `Makefile` and `scripts/deploy.sh` provide helpers (`make deploy-dev`, etc.) to deploy specific environments.

## Key Concepts (Rust on Cloudflare Workers)

*   **Compilation to Wasm & `workers-rs` SDK:** As previously described.
*   **Command Dispatcher:** The `dispatch_command` function in `src/lib.rs` acts as a central router for incoming text commands (excluding `/start`, which has pre-dispatcher handling). It parses commands, fetches user data, checks permissions via `RBACService`, and then calls the appropriate command-specific handler function.
*   **Event-Driven (`#[event(fetch)]`):** The main entry point for HTTP requests.
*   **Bindings & `Env`:** Access to D1, KV, R2, Vars, Secrets via `wrangler.toml` configuration and the `Env` object.
*   **State Management:** User state (`UserState::New`, `Onboarding`, `Active`, `Blocked`) is managed in the `User` struct and persisted in D1, guiding user flow and command availability.
*   **Error Handling (`Result<T, E>`):** Standard Rust error handling.
*   **Ownership & Borrowing:** Core Rust principles.

## Data Management / State

*   **Cloudflare D1:** Primary storage for:
    *   `User` data: Includes `id` (UUID), `telegram_id`, `telegram_username`, `name`, `age`, `gender`, `bio`, `location_text`, `latitude`, `longitude`, `media_keys` (JSON string array of R2 object keys), `state` (enum as string), `roles` (JSON string array of role strings), and timestamps (`created_at`, `updated_at`, `last_interaction_at`).
*   **Cloudflare KV:** Used for:
    *   **Feature Flags:** Loaded by `ConfigService`.
    *   **Session Management:** Temporary session data for multi-step interactions like profile editing and media management (add/delete flows) is stored in the `SESSIONS_KV` namespace. The `ProfileEditingSession` struct (with `CurrentEditingStep` states like `AwaitingMediaFile`, `AwaitingMediaDeletionChoice`) defines the session state. Sessions have a TTL.
    *   The `last_interaction_at` field in the D1 `User` table, combined with `session_timeout_minutes` from `EnvironmentConfig`, provides a basis for longer-term session/activity tracking (placeholder logic currently).
*   **Cloudflare R2:** Primary storage for user-uploaded media files (photos, videos), using the `MEDIA_BUCKET` binding. Files are referenced by keys stored in the user's `media_keys` list in D1.

## External API Interactions
- **Telegram Bot API:**
    - Receiving messages: Text, Location, Photo (array of sizes), Video, Document.
    - Sending messages: Using `sendMessage` method with JSON payloads, including MarkdownV2 formatting.
    - File Download: For media uploads, the bot uses the `getFile` method (requires `TELEGRAM_TOKEN`) to get a `file_path`, then constructs a download URL (`https://api.telegram.org/file/bot<TOKEN>/<file_path>`) to fetch the file bytes.

## Error Handling & Resilience (Conceptual)
- **Service Errors:** Methods in `UserService`, `MediaService`, etc., return `Result<T, E>` to propagate errors.
- **Telegram API Errors:** Failures in `download_telegram_file` or sending messages are logged.
- **R2/D1 Errors:** Errors from Cloudflare services are propagated and logged. For media uploads, if an R2 upload succeeds but a subsequent D1 update (adding `media_key`) fails, an attempt is made to delete the orphaned R2 object to maintain consistency.
- **Session Management:** Corrupt session data in KV is detected (on deserialization error) and automatically deleted to allow users to restart flows.

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
