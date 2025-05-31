# Development Guide for MeetsMatch Telegram Bot (Rust Edition)

## Table of Contents
- [Project Overview](#project-overview)
- [Core Services](#core-services)
- [Development Environment Setup](#development-environment-setup)
  - [Prerequisites](#prerequisites)
  - [Installation Steps](#installation-steps)
  - [Configuration & Secrets](#configuration--secrets)
- [Project Structure](#project-structure)
- [Command Handling](#command-handling)
  - [Adding New Commands](#adding-new-commands)
- [User Journeys](#user-journeys)
  - [Onboarding Flow](#onboarding-flow)
  - [Profile Management](#profile-management)
- [Session Management](#session-management)
- [Input Validation](#input-validation)
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
This Telegram bot assists users in finding and scheduling meetups. Key technologies include Rust compiled to WebAssembly (Wasm), running on Cloudflare Workers. It utilizes Cloudflare D1 for database, KV for caching/feature flags/session data, and Cloudflare R2 for media storage. The bot features a modular service architecture, a command dispatcher, RBAC, and an initial user onboarding process with profile editing and media management capabilities.

## Core Services
The bot's functionality is organized into several services found under `src/`:
- **`UserService` (`src/user_service/mod.rs`):**
    - Manages all user data persisted in D1. This includes internal ID, Telegram ID, username, collected name, detailed profile fields (age, gender, bio, location text, latitude, longitude), and a list of `media_keys` (referencing objects in R2).
    - Handles user state transitions via `UserState` enum (`New`, `Onboarding`, `Active`, `Blocked`).
    - Manages user roles (`Vec<Role>`), serialized as JSON in D1, defaulting new users to `Role::User`.
    - Provides methods for creating, fetching, and updating user profiles. This includes methods for specific field updates (e.g., `update_user_name`, `update_user_age`, `update_user_location`) and methods for managing the `media_keys` list (`add_media_key_to_user`, `remove_media_key_from_user` while respecting `MAX_USER_MEDIA_ITEMS`).
    - Tracks `last_interaction_at` for session management.
- **`ConfigService` (`src/config_service/mod.rs`):**
    - Loads application configuration, primarily feature flags from Cloudflare KV and environment-specific settings (e.g., `LOG_LEVEL`, `SESSION_TIMEOUT_MINUTES`) from environment variables.
- **`RBACService` (`src/rbac_service/mod.rs`):**
    - Implements Role-Based Access Control.
    - Defines `Role` enums (e.g., `User`, `Admin`).
    - Its `check_permission` method is used by the command dispatcher to authorize command execution based on user roles. Permissions are currently hardcoded.
- **`MediaService` (`src/media_service/mod.rs`):**
    - Handles all interactions with Cloudflare R2 for media storage, using the `MEDIA_BUCKET` binding.
    - Key methods include:
        - `generate_object_key`: Creates unique, structured keys for R2 objects (e.g., `user_id/sanitized_filename_uuid.ext`).
        - `upload_media`: Uploads file bytes to R2, setting appropriate MIME types via `R2PutOptions`.
        - `delete_media`: Deletes objects from R2 by key.
        - `get_media_public_url` / `get_presigned_media_url`: Placeholder methods for URL generation (actual implementation depends on R2 bucket public access settings or presigned URL capabilities).
- **Other Services:** Placeholder services like `MatchingService`, `CommunicationService`, etc., are defined for future expansion.

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
    For detailed information on environment variables and `wrangler.toml` setup, see [ENVIRONMENTS.MD](docs/ENVIRONMENTS.MD).

### Configuration & Secrets
- **`wrangler.toml`:** This is the primary configuration file for your worker. Ensure all necessary bindings are correctly defined for each environment:
    - `DB`: D1 database binding.
    - `SESSIONS_KV`: KV namespace for profile editing sessions.
    - `FEATURE_FLAGS_KV`: KV namespace for feature flags.
    - `MEDIA_BUCKET`: R2 bucket for user media storage. You must create the R2 buckets in your Cloudflare dashboard and update the `bucket_name` (and `preview_bucket_name` for dev) in `wrangler.toml`.
- **`TELEGRAM_TOKEN`:** This crucial secret must be set using `wrangler secret put TELEGRAM_TOKEN` for each environment. It's required by the worker to download files from Telegram for media uploads.
- Refer to `docs/ENVIRONMENTS.MD` for comprehensive details on setting up environment-specific configurations and secrets.

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
    For detailed information on environment variables and `wrangler.toml` setup, see [ENVIRONMENTS.MD](docs/ENVIRONMENTS.MD).

## Project Structure
The project follows a modular structure:
- `src/`: Contains all Rust source code.
  - `lib.rs`: Main worker entry point, request parsing, and command dispatching.
  - `utils.rs`: Common utility functions.
  - `user_service/mod.rs`, `config_service/mod.rs`, `rbac_service/mod.rs`, etc.: Modular services.
- `worker/`: (Generated) Output directory for the compiled Wasm and JS shim.
- `scripts/`: Helper shell scripts.
- `Cargo.toml`: Rust package manifest.
- `Makefile`: Common development commands.
- `wrangler.toml`: Cloudflare Wrangler configuration.
- `docs/`: Project documentation.

## Command Handling
Command handling is managed in `src/lib.rs` using a dispatcher pattern:
1.  The main `fetch` handler parses the incoming Telegram update.
2.  If the message text starts with `/start`, the dedicated `handle_start_command` is called. This command is special as it handles user creation and the initial onboarding prompt or main menu display.
3.  If the text starts with another `/` (e.g., `/profile`, `/help`), the `dispatch_command` function is invoked.
4.  `dispatch_command`:
    a.  Parses the command string and any arguments.
    b.  Fetches the `DomainUser` (expecting the user to exist, created via `/start`).
    c.  Performs a session timeout check (currently a placeholder).
    d.  Calls `rbac_service.check_permission()` to authorize the command for the user's roles.
    e.  If authorized, it matches the command string and calls the corresponding specific command handler function (e.g., `handle_profile_command`).
    f.  Each specific command handler (e.g., `handle_profile_command`, `handle_find_match_command`) contains the logic for that command. It receives the fetched `DomainUser` and other necessary context.

### Adding New Commands
To add a new command (e.g., `/mycommand`):
1.  **Define Handler Function:** Create an `async fn handle_my_command(...)` in `src/lib.rs` with a signature like:
    ```rust
    async fn handle_my_command(
        user_service: &UserService,
        rbac_service: &RBACService,
        env_config: &EnvironmentConfig,
        user: &DomainUser, // The authenticated user
        chat_id: i64,
        args: Vec<&str>,   // Parsed arguments
    ) -> Result<Response> { /* ... */ }
    ```
2.  **Add to Dispatcher:** In `dispatch_command`'s `match command_str.as_str()` block, add a new arm:
    ```rust
    "/mycommand" => handle_my_command(user_service, rbac_service, env_config, &domain_user, chat_id, args).await,
    ```
3.  **Define Permissions:** In `RBACService::check_permission` (`src/rbac_service/mod.rs`), add `"/mycommand"` to the appropriate `HashSet` for user or admin roles, or define custom logic.
4.  **Implement Handler Logic:** Write the core functionality within `handle_my_command`.
5.  **Update Help Text:** Add the new command to `handle_help_command`.
6.  **Write Tests:** Add unit tests for any new validation or service logic, and consider integration tests for the command flow.

## User Journeys

### Onboarding Flow
The current onboarding process is primarily focused on name collection and is initiated by the `/start` command:
1.  **New User via `/start`:** `UserService` creates a user with `state: UserState::Onboarding`, `name: None`, and default `roles: [Role::User]`. The bot prompts for their name.
2.  **Name Submission:** The user's next non-command text message is processed by `handle_text_message`.
3.  **Validation & Activation:** The submitted name is validated (e.g., length). If valid, `UserService` updates the user's name and sets their `state` to `UserState::Active`. `last_interaction_at` is also updated.
4.  **Confirmation & Main Menu:** The bot confirms the name update and displays the main menu.
5.  **Existing User (Incomplete Profile via `/start`):** If an existing user lacks a name or isn't `Active`, `/start` guides them to the appropriate step (e.g., name prompt or activation).
6.  **Existing User (Complete Profile via `/start`):** Active users are shown the main menu.

### Profile Management
Users can view and edit their profile information.
- **Viewing Profile (`/profile`):**
    - Displays a formatted summary of the user's profile data including name, age, gender, bio, location, media count, and some technical details (Telegram ID, internal ID, roles, state, timestamps).
    - Handles optional fields gracefully, showing "Not set" if data is missing.
    - Lists placeholders for media items (e.g., "1. Media Item 1").
- **Editing Profile Fields (`/profile edit`):**
    1.  **Initiation:** `/profile edit` starts the editing flow.
    2.  **Session & Field Selection:** A `ProfileEditingSession` (with `step: CurrentEditingStep::SelectingField`) is created in KV. The bot prompts the user to type the name of the field they want to edit (Name, Age, Gender, Bio, Location).
    3.  **Value Input Prompt:** When the user chooses a field, the session updates to `step: CurrentEditingStep::AwaitingValue(ChosenField)`. The bot prompts for the new value, often showing the current value.
    4.  **Value Processing & Validation:** The user's next text message (or shared Telegram location for location editing) is processed:
        - Input is validated using specific functions (e.g., `validate_name`).
        - If valid, the relevant `UserService` method (e.g., `update_user_name`) updates D1.
        - If invalid, an error message is sent, and the session is kept for retry.
    5.  **Location Editing:** Users can provide location as text or by sharing a Telegram location object. Both are handled and update the respective fields in the `User` model via `UserService::update_user_location`.
    6.  **Confirmation & Session Clearance:** On success, the KV session is cleared, and a confirmation is sent.
    7.  **Cancellation:** Users can type `cancel` to abort.
- **Adding Media (`/profile add_media`):**
    1.  **Initiation:** `/profile add_media` starts the flow.
    2.  **Limit Check:** The bot checks if the user is under the `MAX_USER_MEDIA_ITEMS` limit.
    3.  **Session & Prompt:** A session with `step: CurrentEditingStep::AwaitingMediaFile` is created in KV. The user is prompted to send a photo/video.
    4.  **Media Reception:** When the user sends a photo, video, or suitable document:
        - The `handle_media_message` function processes it.
        - The file is downloaded from Telegram (requires `TELEGRAM_TOKEN` secret).
        - `MediaService::upload_media` uploads the file to the R2 `MEDIA_BUCKET`.
        - `UserService::add_media_key_to_user` saves the returned R2 object key to the user's `media_keys` list in D1.
    5.  **Confirmation & Session Clearance:** On success, the KV session is cleared, and confirmation is sent. Errors (download, upload, DB update) are handled, with an attempt to delete orphaned R2 files if D1 update fails.
- **Deleting Media (`/profile delete_media`):**
    1.  **Initiation:** `/profile delete_media` starts the flow.
    2.  **Media Listing & Session:** If the user has media, items are listed with numbers. A session with `step: CurrentEditingStep::AwaitingMediaDeletionChoice(Vec<keys>)` is created in KV.
    3.  **User Choice:** The user replies with the number of the item to delete.
    4.  **Deletion Process:**
        - The chosen R2 object key is identified from the session.
        - `MediaService::delete_media` removes the file from R2.
        - `UserService::remove_media_key_from_user` removes the key from D1.
    5.  **Confirmation & Session Clearance:** On success, the KV session is cleared, and confirmation is sent. Error handling includes managing potential inconsistencies if R2 delete succeeds but D1 update fails.

## Session Management
- **User Interaction Tracking:** The `User.last_interaction_at` field is updated on most user interactions.
- **Conversational State (Profile Editing & Media Management):**
    - Uses Cloudflare KV (via `SESSIONS_KV` binding) for short-lived session data (15-minute TTL).
    - Key structs/enums in `src/lib.rs`: `ProfileEditingSession`, `CurrentEditingStep` (values: `SelectingField`, `AwaitingValue(EditingField)`, `AwaitingMediaFile`, `AwaitingMediaDeletionChoice(Vec<String>`), `EditingField`.
    - Helper functions in `src/lib.rs` (`set_profile_editing_session`, etc.) manage KV operations.
- **General Session Timeout (Placeholder):**
    - `ConfigService` loads `session_timeout_minutes`.
    - Placeholder checks exist in `handle_start_command` and `dispatch_command`.
    - **TODO:** Full enforcement logic for general session timeouts is pending.

## Input Validation
- Validation functions for profile fields (e.g., `validate_name`, `validate_age`, `validate_gender`, `validate_bio`, `validate_location_text`) are defined in `src/lib.rs`.
- These functions return `Result<(), ValidationError>` or `Result<ParsedValue, ValidationError>`.
- The `ValidationError` enum provides structured error types (`TooShort`, `TooLong`, `InvalidFormat`, `OutOfRange`).
- `handle_text_message` uses these functions during the `AwaitingValue` step of profile editing to validate user input before saving. Error messages are sent back to the user if validation fails.

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
Execute unit tests defined within service modules:
```bash
make test
# This runs `cargo test`.
```
For code coverage details, see the "Testing & Quality Assurance" section.

### Running Locally
Simulate the Cloudflare environment and run your worker:
```bash
wrangler dev
```
This command reads `wrangler.toml`. If an `[env.dev]` section is present, its configuration (including variables and bindings with `preview_id`s) will be used.

## Testing & Quality Assurance
- **Unit Tests:**
    - Test modules are co-located with source files (e.g., `src/user_service/mod.rs` contains `mod tests {}`, `src/lib.rs` contains `mod lib_tests {}`).
    - Current unit tests cover:
        - `User` struct logic (e.g., `is_profile_complete`, default initializations for all fields including new profile and media fields).
        - `RBACService` permission checking.
        - Input validation functions for profile fields (`validate_name`, `validate_age`, etc.).
        - Profile view formatting (`format_user_profile_view`, `escape_markdown_v2`).
        - Deserialization of Telegram media-related JSON structures into Rust structs.
        - Simulated logic for `UserService` media key list manipulation (add/remove/limit checks).
- **Integration Tests (Future - Conceptual Outline):**
    - A plan exists for future integration tests using a framework like `mf-test`.
    - This would cover end-to-end command flows, `UserService` D1 operations, `MediaService` R2 interactions, Telegram API mocking (for downloads), and KV session state management.
- **Coverage:** `cargo-llvm-cov` is used in CI for code coverage. Local HTML reports can be generated with `cargo llvm-cov --all-features --workspace --html --output-dir coverage/html`.
- **Local CI Simulation:** `make ci` runs format checks, clippy lints, and all unit tests.

## Makefile Usage
The project includes a `Makefile` for common operations. View all available commands:
```bash
make help
```
Key targets include `make build`, `make check`, `make test`, `make ci`, `make clean`, `make deploy-dev`, etc.

## Feature Flags
The application supports dynamic feature flags managed via Cloudflare KV. For details on how to configure and update these flags, refer to [FEATURE_FLAGS.MD](docs/FEATURE_FLAGS.MD).

## Environments
The project is configured for multiple environments (dev, staging, production) using `wrangler.toml`. For details on environment-specific configurations, variables, and deployment, see [ENVIRONMENTS.MD](docs/ENVIRONMENTS.MD).

## Deployment
Deployments are handled by Wrangler, orchestrated via the `Makefile` and `scripts/deploy.sh`.
- Deploy to development: `make deploy-dev`
- Deploy to staging: `make deploy-staging`
- Deploy to production: `make deploy-prod` (includes a confirmation prompt)

These commands use `wrangler deploy --env <environment_name>`, which relies on the configurations in `wrangler.toml`.

## CI/CD
- **Provider:** GitHub Actions (see `.github/workflows/ci.yml`).
- **Key CI Stages:**
  1. Code checkout.
  2. Setup Rust, `wasm-pack`, `cargo-llvm-cov`.
  3. Format check (`cargo fmt -- --check`).
  4. Lint (`cargo clippy -- -D warnings`).
  5. Unit tests with coverage (`cargo llvm-cov`).
  6. Upload coverage to Codecov.
  7. Build Wasm worker (`wasm-pack build`).
  8. Deploy to production on pushes to `main` branch.

## Debugging
- **Logging:** Use `console_log!`, `console_warn!`, and `console_error!` macros from the `worker` crate. These logs will appear in the `wrangler dev` console output during local development.
- **Cloudflare Logs:** For deployed workers, view logs in the Cloudflare dashboard under your Worker's details.
- **Error Handling:** Implement robust error handling using Rust's `Result` type. `console_error_panic_hook` is set up in `src/utils.rs` to provide better panic messages in Wasm.

## Contributing
Please refer to `CONTRIBUTING.md` for guidelines on contributing to this project. (If `CONTRIBUTING.md` does not exist, this is a good place to add one).
Ensure your changes pass `make ci` locally before submitting a pull request.
