mod utils;
mod config_service;
mod monitoring_service;
mod security_service;
mod user_service;
mod matching_service;
mod communication_service;
mod analytics_service;
mod notification_service;
// Potentially a router module
// mod router;

use worker::*;
use config_service::ConfigService; // Ensure this is imported
use user_service::UserService;


#[event(fetch)]
pub async fn main(req: Request, env: Env, _ctx: worker::Context) -> Result<Response> {
    utils::set_panic_hook();

    console_log!(
        "Received {} request to: {}",
        req.method().to_string(),
        req.url()?.to_string()
    );

    let config_service = ConfigService::new();

    // Load Feature Flags
    let features = match config_service.get_feature_flags(&env).await {
        Ok(flags) => {
            console_log!("[SUCCESS] Feature flags loaded: {:?}", flags);
            flags
        }
        Err(e) => {
            // This path should ideally not be hit given the current get_feature_flags implementation
            // as it returns Ok(FeatureFlags::default()) on errors.
            // However, keeping it for robustness in case of future changes to get_feature_flags.
            console_error!("[ERROR] Critical error loading feature flags: {}. Using defaults.", e);
            config_service::FeatureFlags::default()
        }
    };

    // Load Environment Configuration
    match config_service.get_environment_config(&env).await {
       Ok(config) => console_log!("[SUCCESS] Env config loaded: {:?}", config),
       Err(e) => console_error!("[ERROR] Loading env config: {}", e), // Similar to above, new() might handle this.
    }

    // Initialize and use UserService (example)
    match UserService::new(&env) {
        Ok(user_service) => {
            console_log!("[SUCCESS] UserService initialized.");
            // Example user operations (can be kept or removed for clarity of this subtask)
            match user_service.register_user(123456, Some("rust_user_feature_test".to_string())).await {
                Ok(user) => console_log!("[SUCCESS] Registered user: {:?}", user),
                Err(e) => console_error!("[ERROR] Registering user: {}", e),
            }
        }
        Err(e) => console_error!("[ERROR] Initializing UserService: {}", e),
    }

    // ----- DEMONSTRATE CONDITIONAL LOGIC BASED ON FEATURE FLAGS -----
    let mut message = "Hello from MeetsMatch Rust Worker!".to_string();

    if features.enable_real_time_chat {
        message.push_str(" Real-time chat is ENABLED!");
        console_log!("FEATURE_FLAG_LOGIC: Feature 'enable_real_time_chat' is ON");
        // TODO: Add logic specific to real-time chat if it were enabled
    } else {
        message.push_str(" Real-time chat is disabled.");
        console_log!("FEATURE_FLAG_LOGIC: Feature 'enable_real_time_chat' is OFF");
    }

    if features.enable_new_matching_algorithm {
        console_log!("FEATURE_FLAG_LOGIC: Feature 'enable_new_matching_algorithm' is ON. Using new algorithm (conceptually).");
        // TODO: Divert to new matching algorithm logic
    } else {
        console_log!("FEATURE_FLAG_LOGIC: Feature 'enable_new_matching_algorithm' is OFF. Using old algorithm (conceptually).");
    }
    // ----- END OF FEATURE FLAG DEMONSTRATION -----

    Response::ok(message)
}
