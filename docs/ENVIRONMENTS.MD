# Managing Environments

This project supports multiple deployment environments, primarily `development` (dev), `staging`, and `production` (prod). This structure allows for isolated testing of changes before they are released to users, enhancing stability and reliability.

### Configuration in `wrangler.toml`

Environment-specific configurations are managed within the `wrangler.toml` file using `[env.<name>]` blocks (e.g., `[env.dev]`, `[env.staging]`, `[env.production]`).

- **Default/Top-Level Configuration:** Settings defined at the root of `wrangler.toml` (outside any `[env.<name>]` block) serve as the defaults. These are typically used for the **production** environment if an explicit `[env.production]` section is not defined or doesn't override all settings.
- **`[env.dev]`:** Configures the development environment. This environment typically uses:
    - A distinct worker name (e.g., `my-worker-dev`).
    - Different backend resource IDs (KV namespaces, D1 databases). For example, `FEATURE_FLAGS_KV` might point to `dev-feature-flags-kv-id`.
    - Specific environment variables, such as `LOG_LEVEL = "DEBUG"` and `ENVIRONMENT = "development"`.
    - `preview_id`s for KV namespaces and `preview_database_id` for D1 databases, which are essential for local development with `wrangler dev` to simulate these resources.
- **`[env.staging]`:** Configures a staging or pre-production environment. This environment should mirror production as closely as possible but use separate resources. It allows for final testing before deploying to production. `LOG_LEVEL` might be `INFO` or `DEBUG` depending on testing needs.
- **`[env.production]`:** While production can implicitly use the top-level default settings, explicitly defining an `[env.production]` section is good practice for clarity and ensures that production settings are deliberate. This section would define production-specific resource IDs and variables like `LOG_LEVEL = "INFO"` and `ENVIRONMENT = "production"`.

**Key Differentiators per Environment:**
- `name`: The deployed worker name (e.g., `meetsmatch-worker-dev` vs. `meetsmatch-worker`).
- `vars`: Environment variables set within the worker (e.g., `ENVIRONMENT`, `LOG_LEVEL`). The application reads these at runtime using `env.var("VAR_NAME")`.
- `kv_namespaces`: Bindings can point to different KV namespace IDs for each environment.
- `d1_databases`: Bindings can point to different D1 database IDs.
- `r2_buckets`: Bindings can point to different R2 bucket names.

**Important:** You must create the actual Cloudflare resources (KV namespaces, D1 databases, R2 buckets) for each environment and update their respective IDs in `wrangler.toml`. Placeholder IDs like `"your-dev-d1-database-id-here"` need to be replaced.

### Deploying to Environments

The `Makefile` and `scripts/deploy.sh` script are configured to facilitate deployments to different environments:

- **Development (`dev`):**
  ```bash
  make deploy-dev
  # or directly:
  ./scripts/deploy.sh dev
  ```
  This deploys the worker using the configuration defined in the `[env.dev]` section of `wrangler.toml`.

- **Staging (`staging`):**
  ```bash
  make deploy-staging
  # or directly:
  ./scripts/deploy.sh staging
  ```
  This deploys the worker using the `[env.staging]` configuration.

- **Production (`prod`):**
  ```bash
  make deploy-prod
  # or directly:
  ./scripts/deploy.sh prod
  ```
  This deploys the worker using the `[env.production]` configuration (if explicitly defined) or the top-level default settings. The script includes a confirmation prompt for production deployments as a safety measure.

The deployment script uses the `wrangler deploy --env <environment_name>` command internally.

### Local Development with `wrangler dev`

When you run `wrangler dev` for local development:
- It typically uses the configuration from `[env.dev]` by default if such a section exists and no other environment is specified via `--env`.
- It utilizes the `preview_id` for KV namespaces and `preview_database_id` for D1 databases specified under `[[env.dev.kv_namespaces]]` or `[[env.dev.d1_databases]]` to simulate these resources locally.
- Variables defined in `[env.dev.vars]` are accessible in your worker code.

To run `wrangler dev` for a different environment (e.g., to test against staging KV preview if configured, though less common):
```bash
wrangler dev --env staging # This is unusual; preview features are mostly for local dev context.
```

### Managing Secrets

Secrets such as API keys (e.g., `TELEGRAM_TOKEN`) **must not** be stored directly in `wrangler.toml` due to security risks. Wrangler provides a secure way to manage secrets per environment:

- **Set a secret for the production (or default) environment:**
  ```bash
  wrangler secret put MY_SECRET_KEY
  ```
  (You will be prompted to enter the secret value.)

- **Set a secret for a specific environment (e.g., `dev`, `staging`):**
  ```bash
  wrangler secret put MY_SECRET_KEY --env dev
  wrangler secret put MY_SECRET_KEY --env staging
  wrangler secret put MY_SECRET_KEY --env production # Explicitly for production
  ```

The application code can access these secrets using `env.secret("MY_SECRET_KEY")`. This ensures that sensitive data is not exposed in your version-controlled codebase. Remember to set secrets for each environment they are needed in.
