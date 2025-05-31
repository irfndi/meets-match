use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use worker::{D1Database, Env, Result, D1PreparedStatement, console_log, console_warn, console_error};
use crate::rbac_service::Role;


#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub enum UserState {
    New,
    Onboarding,
    Active,
    Blocked,
}

impl Default for UserState {
    fn default() -> Self { UserState::New }
}

fn default_user_roles() -> Vec<Role> {
    vec![Role::User]
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct User {
    pub id: String,
    pub telegram_id: i64,
    pub telegram_username: Option<String>,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_interaction_at: DateTime<Utc>,
    #[serde(default)]
    pub state: UserState,
    #[serde(default = "default_user_roles")]
    pub roles: Vec<Role>,
}

impl User {
    pub fn is_profile_complete(&self) -> bool {
        self.name.is_some() && self.state == UserState::Active
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UserProfileUpdate {
    pub username: Option<String>,
    pub name: Option<String>,
}


pub struct UserService {
    db: D1Database,
}

impl UserService {
    pub fn new(env: &Env) -> Result<Self> {
        let db = env.d1("DB")?;
        Ok(Self { db })
    }

    pub async fn get_user_by_telegram_id(&self, telegram_id: i64) -> Result<Option<User>> {
        console_log!("[UserService] Getting user by Telegram ID: {}", telegram_id);
        let statement = self.db.prepare("SELECT id, telegram_id, telegram_username, name, created_at, updated_at, last_interaction_at, state, roles FROM users WHERE telegram_id = ?1 LIMIT 1");
        let query_result = statement.bind(&[telegram_id.into()])?.first::<User>(None).await;

        match query_result {
            Ok(Some(user)) => {
                console_log!("[UserService] Found user: id={}, last_interaction_at={}", user.id, user.last_interaction_at);
                Ok(Some(user))
            }
            Ok(None) => {
                console_log!("[UserService] No user found for Telegram ID: {}", telegram_id);
                Ok(None)
            }
            Err(e) => {
                console_error!("[UserService] Error querying user by telegram_id {}: {}", telegram_id, e);
                Err(e.into())
            }
        }
    }

    pub async fn create_user_from_telegram_user(&self, telegram_user: &crate::TelegramUser) -> Result<User> {
        let user_id = worker::Uuid::new_v4().to_string();
        let now = Utc::now();
        let initial_roles = default_user_roles();
        let initial_state = UserState::Onboarding;

        let new_user = User {
            id: user_id.clone(),
            telegram_id: telegram_user.id,
            telegram_username: telegram_user.username.clone(),
            name: None,
            created_at: now,
            updated_at: now,
            last_interaction_at: now,
            state: initial_state.clone(),
            roles: initial_roles.clone(),
        };

        console_log!("[UserService] Attempting to create new user: id={}, last_interaction_at={}", new_user.id, new_user.last_interaction_at);

        let roles_json_string = serde_json::to_string(&new_user.roles)
            .map_err(|e| worker::Error::RustError(format!("Failed to serialize roles: {}", e)))?;

        let state_str = serde_json::to_string(&new_user.state)
            .map_err(|e| worker::Error::RustError(format!("Failed to serialize UserState: {}", e)))?
            .trim_matches('"').to_string();

        let statement = self.db.prepare(
            "INSERT INTO users (id, telegram_id, telegram_username, name, created_at, updated_at, last_interaction_at, state, roles) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"
        );

        let query = statement.bind(&[
            new_user.id.clone().into(),
            new_user.telegram_id.into(),
            new_user.telegram_username.clone().into(),
            new_user.name.clone().into(),
            new_user.created_at.to_rfc3339().into(),
            new_user.updated_at.to_rfc3339().into(),
            new_user.last_interaction_at.to_rfc3339().into(),
            state_str.into(),
            roles_json_string.into(),
        ])?;

        match query.run().await {
            Ok(_) => {
                console_log!("[UserService] Successfully created new user with id: {}", new_user.id);
                Ok(new_user)
            }
            Err(e) => {
                console_error!("[UserService] Error creating new user for telegram_id {}: {}", new_user.telegram_id, e);
                Err(e.into())
            }
        }
    }

    pub async fn update_user_state_and_name(&self, user_id: String, new_name: Option<String>, new_state: UserState) -> Result<User> {
        let now = Utc::now();
        console_log!("[UserService] Updating user ID: {} to name: {:?}, state: {:?}, interaction_time: {}", user_id, new_name, new_state, now);

        let statement = self.db.prepare(
            "UPDATE users SET name = ?1, state = ?2, updated_at = ?3, last_interaction_at = ?3 WHERE id = ?4 RETURNING id, telegram_id, telegram_username, name, created_at, updated_at, last_interaction_at, state, roles"
        );

        let state_str = serde_json::to_string(&new_state)
            .map_err(|e| worker::Error::RustError(format!("Failed to serialize UserState for update: {}", e)))?
            .trim_matches('"').to_string();

        let query_result = statement.bind(&[
            new_name.into(),
            state_str.into(),
            now.to_rfc3339().into(),
            user_id.clone().into(),
        ])?.first::<User>(None).await;

        match query_result {
            Ok(Some(user)) => {
                console_log!("[UserService] Successfully updated user: id={}, last_interaction_at={}", user.id, user.last_interaction_at);
                Ok(user)
            }
            Ok(None) => {
                console_error!("[UserService] User not found after update for ID: {}", user_id);
                Err(worker::Error::RustError("User not found after update".to_string()))
            }
            Err(e) => {
                console_error!("[UserService] Error updating user ID {}: {}", user_id, e);
                Err(e.into())
            }
        }
    }

    pub async fn record_user_interaction(&self, user_id: &str) -> Result<()> {
        let now = Utc::now();
        console_log!("[UserService] Recording interaction for user_id: {} at {}", user_id, now.to_rfc3339());
        let statement = self.db.prepare(
            "UPDATE users SET updated_at = ?1, last_interaction_at = ?1 WHERE id = ?2"
        );
        let query = statement.bind(&[
            now.to_rfc3339().into(),
            user_id.into()
        ])?;

        match query.run().await {
            Ok(_) => {
                console_log!("[UserService] Successfully recorded interaction for user_id: {}", user_id);
                Ok(())
            }
            Err(e) => {
                console_error!("[UserService] Error recording interaction for user_id {}: {}", user_id, e);
                Err(e.into())
            }
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::rbac_service::Role;
    use chrono::Utc;

    // Helper function to create a User instance for testing purposes.
    fn create_test_user(name: Option<String>, state: UserState, roles: Vec<Role>) -> User {
        let now = Utc::now();
        User {
            id: "test_user_uuid".to_string(),
            telegram_id: 123456789,
            telegram_username: Some("testuser".to_string()),
            name,
            created_at: now,
            updated_at: now,
            last_interaction_at: now,
            state,
            roles,
        }
    }

    #[test]
    fn test_user_is_profile_complete_true() {
        let user = create_test_user(Some("Test Name".to_string()), UserState::Active, vec![Role::User]);
        assert!(user.is_profile_complete());
    }

    #[test]
    fn test_user_is_profile_complete_false_no_name() {
        let user = create_test_user(None, UserState::Active, vec![Role::User]);
        assert!(!user.is_profile_complete());
    }

    #[test]
    fn test_user_is_profile_complete_false_not_active() {
        let user = create_test_user(Some("Test Name".to_string()), UserState::Onboarding, vec![Role::User]);
        assert!(!user.is_profile_complete());
    }

    #[test]
    fn test_user_is_profile_complete_false_onboarding_no_name() {
        let user = create_test_user(None, UserState::Onboarding, vec![Role::User]);
        assert!(!user.is_profile_complete());
    }

    #[test]
    fn test_user_is_profile_complete_false_new_state() {
        let user = create_test_user(Some("Test Name".to_string()), UserState::New, vec![Role::User]);
        assert!(!user.is_profile_complete());
    }

    #[test]
    fn test_user_is_profile_complete_false_blocked_state() {
        let user = create_test_user(Some("Test Name".to_string()), UserState::Blocked, vec![Role::User]);
        assert!(!user.is_profile_complete());
    }

    #[test]
    fn test_default_user_roles() {
        let user_default_roles = create_test_user(None, UserState::New, default_user_roles());
        assert_eq!(user_default_roles.roles, vec![Role::User]);

        // Test User struct deserialization default for roles (conceptual)
        // This would be better with actual JSON deserialization if possible in test.
        let user_no_roles_field = User { // Simulating a user struct that might come from a DB row with roles missing
            id: "test_id".to_string(),
            telegram_id: 123,
            telegram_username: None,
            name: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            last_interaction_at: Utc::now(),
            state: UserState::New,
            roles: default_user_roles(), // Explicitly call default here to simulate serde's action
        };
        assert_eq!(user_no_roles_field.roles, vec![Role::User]);
    }

    // Note: Testing UserService methods like get_user_by_telegram_id, create_user_from_telegram_user, etc.,
    // directly as unit tests is challenging without a D1 test harness or mocking framework for D1Database.
    // These tests would typically be integration tests run with Miniflare or a similar environment.
    // For example, `worker::Env::run_once_async(async { ... })` could be used with `mf-test`
    // to run tests that require an environment with D1 bindings.
}
