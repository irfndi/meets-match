mod utils;
mod config_service;
mod monitoring_service;
mod security_service;
mod user_service;
mod matching_service;
mod communication_service;
mod analytics_service;
mod notification_service;
mod rbac_service;

use worker::*;
use serde::Deserialize;
use serde_json::json;

use config_service::{ConfigService, EnvironmentConfig};
use user_service::{UserService, User as DomainUser, UserState};
use rbac_service::{RBACService, Role as UserRole}; // UserRole alias for clarity
use chrono::Duration;


// --- Telegram Type Definitions ---
#[derive(Deserialize, Debug)]
pub struct TelegramUpdate {
    pub message: Option<TelegramMessage>,
    // pub callback_query: Option<CallbackQuery>, // For future button interactions
}

#[derive(Deserialize, Debug)]
pub struct TelegramMessage {
    pub from: Option<TelegramUser>,
    pub chat: TelegramChat,
    pub text: Option<String>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct TelegramUser {
    pub id: i64,
    pub username: Option<String>,
}

#[derive(Deserialize, Debug)]
pub struct TelegramChat {
    pub id: i64,
}
// --- End of Telegram Type Definitions ---

// --- Placeholder Command Handlers ---
async fn handle_profile_command(_user_service: &UserService, _rbac_service: &RBACService, _env_config: &EnvironmentConfig, user: &DomainUser, chat_id: i64, _args: Vec<&str>) -> Result<Response> {
    console_log!("[CmdHandler] /profile for user {}", user.id);
    Response::from_json(&json!({
        "method": "sendMessage", "chat_id": chat_id,
        "text": format!("Placeholder for /profile. Hello, {}!", user.name.as_deref().unwrap_or("User"))
    }))
}

async fn handle_find_match_command(_user_service: &UserService, _rbac_service: &RBACService, _env_config: &EnvironmentConfig, user: &DomainUser, chat_id: i64, _args: Vec<&str>) -> Result<Response> {
    console_log!("[CmdHandler] /find_match for user {}", user.id);
    Response::from_json(&json!({
        "method": "sendMessage", "chat_id": chat_id,
        "text": "Placeholder for /find_match. Searching for potential matches..."
    }))
}

async fn handle_help_command(_user_service: &UserService, rbac_service: &RBACService, _env_config: &EnvironmentConfig, user: &DomainUser, chat_id: i64, _args: Vec<&str>) -> Result<Response> {
    console_log!("[CmdHandler] /help for user {}", user.id);
    let mut help_text = "Available commands:\n\n/start - Restart interaction or show main menu\n/profile - View or manage your profile\n/find_match - Find a match\n/help - Show this help message".to_string();

    // Example: Add admin commands to help if user is admin
    if user.roles.contains(&UserRole::Admin) {
        help_text.push_str("\n\nAdmin Commands:\n/status - Check bot status");
        // Add other admin commands
    }

    Response::from_json(&json!({
        "method": "sendMessage", "chat_id": chat_id,
        "text": help_text
    }))
}

async fn handle_admin_status_command(_user_service: &UserService, _rbac_service: &RBACService, _env_config: &EnvironmentConfig, user: &DomainUser, chat_id: i64, _args: Vec<&str>) -> Result<Response> {
    console_log!("[CmdHandler] /status (admin) for user {}", user.id);
    Response::from_json(&json!({
        "method": "sendMessage", "chat_id": chat_id,
        "text": "Bot status: Healthy! (Admin View)"
    }))
}
// --- End Placeholder Command Handlers ---


// --- Command Dispatcher ---
async fn dispatch_command(
    user_service: &UserService,
    rbac_service: &RBACService,
    env_config: &EnvironmentConfig,
    telegram_user_opt: Option<TelegramUser>,
    chat_id: i64,
    text: &str, // Full message text
) -> Result<Response> {
    let mut parts = text.split_whitespace();
    let command_str = parts.next().unwrap_or("").to_lowercase();
    let args: Vec<&str> = parts.collect();

    console_log!("[Dispatcher] Dispatching command: '{}', args: {:?}", command_str, args);

    let telegram_user = match telegram_user_opt {
        Some(tu) => tu,
        None => {
            console_error!("[Dispatcher] No Telegram user for command: {}", command_str);
            return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Cannot identify sender."}));
        }
    };

    // For any command other than /start (which handles its own creation), user must exist.
    // /start is handled before this dispatcher is called.
    let domain_user = match user_service.get_user_by_telegram_id(telegram_user.id).await? {
        Some(user) => {
            // ---- SESSION TIMEOUT CHECK (Placeholder for dispatched commands) ----
            let time_since_last_interaction = Utc::now().signed_duration_since(user.last_interaction_at);
            if time_since_last_interaction > Duration::minutes(env_config.session_timeout_minutes.into())
                && user.state != UserState::Onboarding
            {
                console_log!("[Dispatcher] User {} session timed out for command '{}'. Last seen {} mins ago.",
                    user.id, command_str, time_since_last_interaction.num_minutes());
                // TODO: Define behavior for timed-out sessions (e.g., force /start, clear state, etc.)
                // For now, just log. Some commands might be allowed, others might require "re-authentication" via /start.
                // Potentially return a message asking them to use /start to refresh their session.
                // return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Your session has expired. Please use /start to continue."}));
            }
            // ---- END SESSION TIMEOUT CHECK ----
            user
        },
        None => {
            console_warn!("[Dispatcher] User {} not found for command '{}'. Must /start first.", telegram_user.id, command_str);
            return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Please use /start to begin."}));
        }
    };

    // RBAC Check
    if !rbac_service.check_permission(&domain_user.roles, &command_str) {
        console_warn!("[Dispatcher] User {} (roles: {:?}) DENIED for command '{}'", domain_user.id, domain_user.roles, command_str);
        return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "You don't have permission for that."}));
    }
    console_log!("[Dispatcher] User {} (roles: {:?}) ALLOWED for command '{}'", domain_user.id, domain_user.roles, command_str);

    // Dispatch to specific command handlers
    match command_str.as_str() {
        "/profile" => handle_profile_command(user_service, rbac_service, env_config, &domain_user, chat_id, args).await,
        "/find_match" => handle_find_match_command(user_service, rbac_service, env_config, &domain_user, chat_id, args).await,
        "/help" => handle_help_command(user_service, rbac_service, env_config, &domain_user, chat_id, args).await,
        "/status" => { // Example: Admin command check can also be here if more granular than RBACService for some reason
            if domain_user.roles.contains(&UserRole::Admin) { // Double check, though RBACService should handle it.
                handle_admin_status_command(user_service, rbac_service, env_config, &domain_user, chat_id, args).await
            } else {
                 Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "This command is admin-only."}))
            }
        }
        _ => {
            console_log!("[Dispatcher] Unknown command: {}", command_str);
            Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": format!("Unknown command: {}. Try /help.", command_str)}))
        }
    }
}
// --- End Command Dispatcher ---


// --- Core Command Handlers (modified signatures) ---
async fn handle_start_command(
    user_service: &UserService,
    rbac_service: &RBACService,
    env_config: &EnvironmentConfig,
    telegram_user_opt: Option<TelegramUser>,
    chat_id: i64
) -> Result<Response> { // Return just Response, user_id for interaction is handled in main
    console_log!("[StartHandler] /start for chat_id: {}", chat_id);

    let telegram_user = match telegram_user_opt {
        Some(tu) => tu,
        None => {
            console_error!("[StartHandler] No Telegram user info.");
            return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Cannot identify you."}));
        }
    };

    match user_service.get_user_by_telegram_id(telegram_user.id).await {
        Ok(Some(mut domain_user)) => {
            console_log!("[StartHandler] Existing user: id={}, roles: {:?}, last_interaction: {}", domain_user.id, domain_user.roles, domain_user.last_interaction_at);

            // Session timeout check (conceptual)
            let time_since_last_interaction = Utc::now().signed_duration_since(domain_user.last_interaction_at);
            if time_since_last_interaction > Duration::minutes(env_config.session_timeout_minutes.into()) && domain_user.state != UserState::Onboarding {
                console_log!("[StartHandler] User {} session timed out ({} mins ago).", domain_user.id, time_since_last_interaction.num_minutes());
                // Potentially reset state or re-verify. For /start, usually means refresh.
            }

            if !rbac_service.check_permission(&domain_user.roles, "/start") {
                console_error!("[StartHandler] User {} DENIED /start. Roles: {:?}", domain_user.id, domain_user.roles);
                return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Access denied."}));
            }

            if domain_user.state == UserState::Blocked {
                return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Your account is blocked."}));
            }

            if domain_user.is_profile_complete() {
                let user_name = domain_user.name.as_deref().unwrap_or("there");
                let menu_text = format!("Welcome back, {}!\n\nMenu:\n/find_match\n/profile\n/help", user_name);
                return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": menu_text}));
            } else {
                if domain_user.name.is_none() {
                    return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Welcome! What's your name?"}));
                } else {
                    match user_service.update_user_state_and_name(domain_user.id.clone(), domain_user.name.clone(), UserState::Active).await {
                        Ok(updated_user) => {
                            let menu_text = format!("Thanks, {}! Profile active.\n\nMenu:\n/find_match\n/profile\n/help", updated_user.name.as_deref().unwrap_or_default());
                            return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": menu_text}));
                        }
                        Err(e) => {
                            console_error!("[StartHandler] Failed to activate user {}: {}", domain_user.id, e);
                            return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Error activating profile."}));
                        }
                    }
                }
            }
        }
        Ok(None) => { // New user
            match user_service.create_user_from_telegram_user(&telegram_user).await {
                Ok(new_user) => {
                    console_log!("[StartHandler] New user created: id={}, roles: {:?}", new_user.id, new_user.roles);
                    if !rbac_service.check_permission(&new_user.roles, "/start") {
                        console_error!("[StartHandler] New user {} DENIED /start. Roles: {:?}", new_user.id, new_user.roles);
                        return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Account permission error."}));
                    }
                    return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Welcome! What's your name?"}));
                }
                Err(e) => {
                    console_error!("[StartHandler] Failed to create user {}: {}", telegram_user.id, e);
                    return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Account creation failed."}));
                }
            }
        }
        Err(e) => {
            console_error!("[StartHandler] DB error for {}: {}", telegram_user.id, e);
            return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Error fetching account."}));
        }
    }
}

async fn handle_onboarding_message(
    user_service: &UserService,
    _env_config: &EnvironmentConfig, // Keep for future use if needed
    telegram_user_opt: Option<TelegramUser>,
    chat_id: i64,
    text: &str
) -> Result<Response> {
    let telegram_user = match telegram_user_opt {
        Some(tu) => tu,
        None => return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Cannot identify sender."})),
    };

    match user_service.get_user_by_telegram_id(telegram_user.id).await? {
        Some(current_user) => {
            if current_user.state == UserState::Onboarding && current_user.name.is_none() {
                console_log!("[OnboardingHandler] User {} processing name: '{}'", current_user.id, text);
                let name_to_set = text.trim();
                if name_to_set.is_empty() || name_to_set.len() > 50 || name_to_set.starts_with("/") {
                    return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Invalid name. 1-50 chars, no commands."}));
                }
                match user_service.update_user_state_and_name(current_user.id.clone(), Some(name_to_set.to_string()), UserState::Active).await {
                    Ok(updated_user) => {
                        let menu_text = format!("Great, {}! Profile complete.\n\nMenu:\n/find_match\n/profile\n/help", updated_user.name.as_deref().unwrap_or_default());
                        Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": menu_text}))
                    }
                    Err(e) => {
                        console_error!("[OnboardingHandler] Failed to update name for user {}: {}", current_user.id, e);
                        Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Error saving name."}))
                    }
                }
            } else {
                Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Not sure what you mean. Try /start."}))
            }
        }
        None => Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Please /start to begin."})),
    }
}
// --- End Core Command Handlers ---


#[event(fetch)]
pub async fn main(mut _req: Request, env: Env, _ctx: worker::Context) -> Result<Response> {
    utils::set_panic_hook();
    let method = _req.method();

    if method != Method::Post {
        return Response::error("Only POST requests are accepted", 405);
    }

    let config_service = ConfigService::new();
    let env_config = match config_service.get_environment_config(&env).await {
        Ok(config) => config,
        Err(e) => {
            console_error!("[Main] Critical error loading env config: {}. Using defaults.", e);
            EnvironmentConfig::default()
        }
    };

    let update: TelegramUpdate = match _req.json().await {
        Ok(upd) => {
            // console_debug!("Parsed update: {:?}", upd);
            upd
        },
        Err(e) => {
            console_error!("[Main] Failed to parse JSON update: {}", e);
            return Response::error(format!("Bad request: {}.", e), 400);
        }
    };

    let mut final_response: Result<Response> = Response::empty()?.with_status(200);
    let mut user_internal_id_for_interaction_update: Option<String> = None;

    if let Some(message) = update.message {
        let chat_id = message.chat.id;
        let telegram_user_opt = message.from.clone();

        let user_service = match UserService::new(&env) {
            Ok(s) => s,
            Err(e) => {
                console_error!("[Main] Failed to init UserService: {}", e);
                return Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "Internal error. Try later."}));
            }
        };
        let rbac_service = RBACService::new();

        if let Some(text) = message.text {
            let text_trimmed = text.trim();
            if text_trimmed.starts_with("/start") {
                // handle_start_command returns only Response now
                final_response = handle_start_command(&user_service, &rbac_service, &env_config, telegram_user_opt.clone(), chat_id).await;
                if let Some(ref tu) = telegram_user_opt {
                    if let Ok(Some(user)) = user_service.get_user_by_telegram_id(tu.id).await { // Re-fetch to get ID for new/existing user
                        user_internal_id_for_interaction_update = Some(user.id.clone());
                    }
                }
            } else if text_trimmed.starts_with("/") {
                final_response = dispatch_command(&user_service, &rbac_service, &env_config, telegram_user_opt.clone(), chat_id, &text_trimmed).await;
                if let Some(ref tu) = telegram_user_opt {
                    if let Ok(Some(user)) = user_service.get_user_by_telegram_id(tu.id).await {
                        user_internal_id_for_interaction_update = Some(user.id.clone());
                    }
                }
            } else {
                final_response = handle_onboarding_message(&user_service, &env_config, telegram_user_opt.clone(), chat_id, &text_trimmed).await;
                if let Some(ref tu) = telegram_user_opt {
                    if let Ok(Some(user)) = user_service.get_user_by_telegram_id(tu.id).await {
                        user_internal_id_for_interaction_update = Some(user.id.clone());
                    }
                }
            }
        } else {
            final_response = Ok(Response::from_json(&json!({"method": "sendMessage", "chat_id": chat_id, "text": "I only understand text."}))?);
        }

        if let Some(user_id) = user_internal_id_for_interaction_update {
            if let Err(e) = user_service.record_user_interaction(&user_id).await {
                console_error!("[Main] Failed to record interaction for user {}: {}", user_id, e);
            }
        }

    } else {
        console_log!("[Main] Received update without a message. Ignoring.");
        // final_response remains default empty 200 OK
    }

    final_response
}
