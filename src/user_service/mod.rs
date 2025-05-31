// src/user_service/mod.rs
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use worker::{D1Database, Env, Result};
// Potentially use uuid for user IDs
// use uuid::Uuid;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct User {
    pub id: String, // Consider using Uuid
    pub telegram_id: i64,
    pub username: Option<String>,
    pub created_at: DateTime<Utc>,
    // Add other fields from PRD (profile, preferences, etc.)
}

// Example for profile data, can be expanded
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct UserProfileUpdate {
    pub username: Option<String>,
    // Add other updatable fields
}

pub struct UserService {
    db: D1Database, // Assumes D1 binding named "DB"
}

impl UserService {
    pub fn new(env: &Env) -> Result<Self> {
        let db = env.d1("DB")?;
        Ok(Self { db })
    }

    pub async fn register_user(&self, telegram_id: i64, username: Option<String>) -> Result<User> {
        worker::console_log!("UserService: Registering user with Telegram ID: {}", telegram_id);
        // Placeholder: Actual implementation would interact with self.db
        // For now, return a dummy user
        // In a real scenario, you'd use something like Uuid::new_v4().to_string()
        let user_id = format!("user_tg_{}", telegram_id);
        worker::console_log!("Generated user ID: {}", user_id); // Log the generated ID
        Ok(User {
            id: user_id,
            telegram_id,
            username,
            created_at: Utc::now(),
        })
    }

    pub async fn get_user_by_telegram_id(&self, telegram_id: i64) -> Result<Option<User>> {
        worker::console_log!("UserService: Getting user by Telegram ID: {}", telegram_id);
        // Placeholder: Actual implementation would query self.db
        // For now, return None or a dummy user for a specific ID for testing
        if telegram_id == 12345 { // Dummy condition for testing
            worker::console_log!("Found dummy user for Telegram ID: {}", telegram_id);
            return Ok(Some(User {
                id: format!("user_tg_{}", telegram_id), // Consistent ID generation
                telegram_id,
                username: Some("testuser_from_get".to_string()),
                created_at: Utc::now(),
            }));
        }
        worker::console_log!("No user found for Telegram ID: {}", telegram_id);
        Ok(None)
    }

    pub async fn update_user_profile(&self, user_id: String, profile_update: UserProfileUpdate) -> Result<User> {
        worker::console_log!("UserService: Updating profile for user ID: {}", user_id);
        // Placeholder: Actual implementation would update data in self.db
        // This would also likely involve fetching the existing user first.
        // For now, just return a conceptual updated user based on the input.

        // A more realistic placeholder might try to fetch first, then update.
        // For this example, we'll assume the user exists and construct a response.
        // We'd need the original telegram_id and created_at for a full User struct.
        // This is a simplification.
        worker::console_log!("Profile update data: {:?}", profile_update);

        Ok(User {
            id: user_id.clone(),
            telegram_id: 0, // Placeholder: This would need to be fetched from DB
            username: profile_update.username,
            created_at: Utc::now(), // Placeholder: This should be the original creation_at
        })
    }
}
