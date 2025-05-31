# Managing Feature Flags

Feature flags allow us to enable or disable functionality in the application without deploying new code. They are stored in a Cloudflare KV namespace typically bound to the name `FEATURE_FLAGS_KV` in `wrangler.toml`.

### Current Flags

The `FeatureFlags` struct in `src/config_service/mod.rs` defines the available flags. As of the last update, these are:

```rust
// From: src/config_service/mod.rs
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FeatureFlags {
    pub enable_new_matching_algorithm: bool,
    pub enable_real_time_chat: bool,
    // Add other flags as needed from PRD
}
```

### Reading Flags

The `ConfigService` reads these flags from the KV namespace bound to `FEATURE_FLAGS_KV`. It looks for a key named `current_flags`. The value associated with this key must be a JSON object that matches the structure of the `FeatureFlags` Rust struct.

If the `current_flags` key is not found, if there's an error accessing the KV namespace, or if the JSON value is malformed, the application will log the issue and fall back to using default values defined in `FeatureFlags::default()`.

### Updating Flags

To update the feature flags, you can use the `wrangler kv:key put` command.

**Prerequisites:**
- Ensure you are logged in with Wrangler (`wrangler login`).
- Your `wrangler.toml` file should be in the current directory or you should know your `account_id` and the specific `id` of the KV namespace you are targeting. The binding name `FEATURE_FLAGS_KV` is used in these examples, assuming `wrangler.toml` provides the context.

**Command Examples:**

1.  **Enable `enable_real_time_chat` and disable `enable_new_matching_algorithm` using the binding name from `wrangler.toml`:**
    ```bash
    wrangler kv:key put --binding=FEATURE_FLAGS_KV "current_flags" '{"enable_new_matching_algorithm":false,"enable_real_time_chat":true}'
    ```

2.  **Enable both flags (example):**
    ```bash
    wrangler kv:key put --binding=FEATURE_FLAGS_KV "current_flags" '{"enable_new_matching_algorithm":true,"enable_real_time_chat":true}'
    ```

3.  **To use with a specific environment defined in `wrangler.toml` (e.g., `production` or `staging`):**
    ```bash
    # For production
    wrangler kv:key put --binding=FEATURE_FLAGS_KV --env=production "current_flags" '{"enable_new_matching_algorithm":true,"enable_real_time_chat":true}'

    # For staging
    wrangler kv:key put --binding=FEATURE_FLAGS_KV --env=staging "current_flags" '{"enable_new_matching_algorithm":false,"enable_real_time_chat":false}'
    ```

4.  **If you need to specify the namespace ID directly (less common if `wrangler.toml` is set up):**
    ```bash
    # Replace <NAMESPACE_ID> with the actual ID of your FEATURE_FLAGS_KV namespace
    # wrangler kv:key put --namespace-id="<NAMESPACE_ID>" "current_flags" '{"enable_new_matching_algorithm":false,"enable_real_time_chat":true}'
    ```

**JSON Value Structure:**
The JSON value provided to the command *must* be a valid JSON string that correctly maps to the `FeatureFlags` struct. For example:
`'{"enable_new_matching_algorithm":true,"enable_real_time_chat":false}'`

**Verification:**
You can verify the currently set value in KV using:
```bash
# Using binding name
wrangler kv:key get --binding=FEATURE_FLAGS_KV "current_flags"

# Using binding name for a specific environment
wrangler kv:key get --binding=FEATURE_FLAGS_KV --env=production "current_flags"

# Using namespace ID directly
# wrangler kv:key get --namespace-id="<NAMESPACE_ID>" "current_flags"
```

### Local Development and Testing (`wrangler dev`)

For local development using `wrangler dev`, you need to use the `--preview` flag with your KV commands to interact with the preview KV store. Ensure your `wrangler.toml` has a `preview_id` for the `FEATURE_FLAGS_KV` namespace.

1.  **Set flags in the preview KV:**
    ```bash
    wrangler kv:key put --binding=FEATURE_FLAGS_KV --preview "current_flags" '{"enable_new_matching_algorithm":true,"enable_real_time_chat":true}'
    ```

2.  **Get flags from the preview KV:**
    ```bash
    wrangler kv:key get --binding=FEATURE_FLAGS_KV --preview "current_flags"
    ```

If you prefer not to set up preview KV for initial testing, you can temporarily modify the `Default::default()` implementation for `FeatureFlags` in `src/config_service/mod.rs` to simulate different flag configurations. However, using the preview KV is recommended for more realistic testing.
