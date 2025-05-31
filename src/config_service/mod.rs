// src/config_service/mod.rs
use serde::{Deserialize, Serialize};
use worker::{Env, Result, kv::KvStore, console_log, console_warn, console_error}; // Ensure all console types are imported

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FeatureFlags {
    pub enable_new_matching_algorithm: bool,
    pub enable_real_time_chat: bool,
    // Add other flags as needed from PRD
}

impl Default for FeatureFlags {
    fn default() -> Self {
        Self {
            enable_new_matching_algorithm: false,
            enable_real_time_chat: false,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct EnvironmentConfig {
    pub log_level: String,
    pub environment: String, // "dev", "prod", "test"
}

impl Default for EnvironmentConfig {
    fn default() -> Self {
        Self {
            log_level: "INFO".to_string(),
            environment: "dev".to_string(),
        }
    }
}
pub struct ConfigService;

impl ConfigService {
    pub fn new() -> Self {
        Self
    }

    pub async fn get_feature_flags(&self, env: &Env) -> Result<FeatureFlags> {
        console_log!("ConfigService: Attempting to load feature flags from KV namespace 'FEATURE_FLAGS_KV'.");

        let store_result = env.kv("FEATURE_FLAGS_KV");

        let store = match store_result {
            Ok(s) => s,
            Err(e) => {
                console_error!("Failed to bind to KV namespace 'FEATURE_FLAGS_KV': {}. Using default feature flags.", e);
                return Ok(FeatureFlags::default()); // Fallback to defaults if namespace binding fails
            }
        };

        match store.get("current_flags").json::<FeatureFlags>().await {
            Ok(Some(flags)) => {
                console_log!("Successfully loaded feature flags from KV: {:?}", flags);
                Ok(flags)
            },
            Ok(None) => {
                console_warn!("No 'current_flags' key found in KV namespace 'FEATURE_FLAGS_KV'. Using default feature flags.");
                Ok(FeatureFlags::default())
            },
            Err(e) => {
                // This error could be due to deserialization issues (e.g. malformed JSON in KV)
                // or other KV store errors.
                console_error!("Error reading or parsing feature flags from KV 'FEATURE_FLAGS_KV': {}. Using default feature flags.", e);
                Ok(FeatureFlags::default()) // Fallback to defaults on error
            }
        }
    }

    pub async fn get_environment_config(&self, env: &Env) -> Result<EnvironmentConfig> {
        console_log!("ConfigService: Loading environment config.");
        let environment = match env.var("ENVIRONMENT") {
            Ok(var) => var.to_string(),
            Err(_) => {
                console_warn!("ENVIRONMENT variable not set, using default 'dev'.");
                "dev".to_string()
            }
        };
        let log_level = match env.var("LOG_LEVEL") {
            Ok(var) => var.to_string(),
            Err(_) => {
                console_warn!("LOG_LEVEL variable not set, using default 'INFO'.");
                "INFO".to_string()
            }
        };

        Ok(EnvironmentConfig {
            environment,
            log_level,
        })
    }
}
