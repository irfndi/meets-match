// src/config_service/mod.rs
use serde::{Deserialize, Serialize};
use worker::{Env, Result, kv::KvStore, console_log, console_warn, console_error};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FeatureFlags {
    pub enable_new_matching_algorithm: bool,
    pub enable_real_time_chat: bool,
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
    pub environment: String,
    pub session_timeout_minutes: u32, // New field
}

impl Default for EnvironmentConfig {
    fn default() -> Self {
        Self {
            log_level: "INFO".to_string(),
            environment: "dev".to_string(),
            session_timeout_minutes: 30, // Default to 30 minutes
        }
    }
}
pub struct ConfigService;

impl ConfigService {
    pub fn new() -> Self {
        Self
    }

    pub async fn get_feature_flags(&self, env: &Env) -> Result<FeatureFlags> {
        console_log!("[ConfigService] Attempting to load feature flags from KV 'FEATURE_FLAGS_KV'.");

        let store_result = env.kv("FEATURE_FLAGS_KV");
        let store = match store_result {
            Ok(s) => s,
            Err(e) => {
                console_error!("[ConfigService] Failed to bind to KV 'FEATURE_FLAGS_KV': {}. Using default flags.", e);
                return Ok(FeatureFlags::default());
            }
        };

        match store.get("current_flags").json::<FeatureFlags>().await {
            Ok(Some(flags)) => {
                console_log!("[ConfigService] Successfully loaded feature flags from KV: {:?}", flags);
                Ok(flags)
            },
            Ok(None) => {
                console_warn!("[ConfigService] No 'current_flags' key in KV 'FEATURE_FLAGS_KV'. Using default flags.");
                Ok(FeatureFlags::default())
            },
            Err(e) => {
                console_error!("[ConfigService] Error reading/parsing flags from KV 'FEATURE_FLAGS_KV': {}. Using default flags.", e);
                Ok(FeatureFlags::default())
            }
        }
    }

    pub async fn get_environment_config(&self, env: &Env) -> Result<EnvironmentConfig> {
        console_log!("[ConfigService] Loading environment config.");
        let environment = match env.var("ENVIRONMENT") {
            Ok(var) => var.to_string(),
            Err(_) => {
                console_warn!("[ConfigService] ENVIRONMENT variable not set, using default '{}'.", EnvironmentConfig::default().environment);
                EnvironmentConfig::default().environment
            }
        };
        let log_level = match env.var("LOG_LEVEL") {
            Ok(var) => var.to_string(),
            Err(_) => {
                console_warn!("[ConfigService] LOG_LEVEL variable not set, using default '{}'.", EnvironmentConfig::default().log_level);
                EnvironmentConfig::default().log_level
            }
        };

        let session_timeout_minutes = match env.var("SESSION_TIMEOUT_MINUTES") {
            Ok(var_str) => match var_str.to_string().parse::<u32>() {
                Ok(val) => val,
                Err(_) => {
                    console_warn!("[ConfigService] SESSION_TIMEOUT_MINUTES is not a valid u32 ('{}'). Using default {}.", var_str.to_string(), EnvironmentConfig::default().session_timeout_minutes);
                    EnvironmentConfig::default().session_timeout_minutes
                }
            },
            Err(_) => {
                console_warn!("[ConfigService] SESSION_TIMEOUT_MINUTES variable not set, using default {}.", EnvironmentConfig::default().session_timeout_minutes);
                EnvironmentConfig::default().session_timeout_minutes
            }
        };

        Ok(EnvironmentConfig {
            environment,
            log_level,
            session_timeout_minutes,
        })
    }
}
