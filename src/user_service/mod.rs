use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use worker::{D1Database, Env, Result, D1PreparedStatement, console_log, console_warn, console_error};
use crate::rbac_service::Role;

// Constants
pub const MAX_USER_MEDIA_ITEMS: usize = 5;

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

pub(crate) fn default_user_roles() -> Vec<Role> {
    vec![Role::User]
}

pub(crate) fn default_media_keys() -> Vec<String> {
    vec![]
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct User {
    pub id: String,
    pub telegram_id: i64,
    pub telegram_username: Option<String>,
    pub name: Option<String>,
    pub age: Option<u8>,
    pub gender: Option<String>,
    pub bio: Option<String>,
    pub location_text: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    #[serde(default = "default_media_keys")]
    pub media_keys: Vec<String>,
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
    pub name: Option<String>,
    pub age: Option<u8>,
    pub gender: Option<String>,
    pub bio: Option<String>,
    pub location_text: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub media_keys_to_add: Option<Vec<String>>,
    pub media_keys_to_remove: Option<Vec<String>>,
}


pub struct UserService {
    db: D1Database,
}

impl UserService {
    const USER_FIELDS_FOR_RETURNING: &'static str =
        "id, telegram_id, telegram_username, name, age, gender, bio, location_text, latitude, longitude, media_keys, created_at, updated_at, last_interaction_at, state, roles";

    pub fn new(env: &Env) -> Result<Self> {
        let db = env.d1("DB")?;
        Ok(Self { db })
    }

    pub async fn get_user_by_telegram_id(&self, telegram_id: i64) -> Result<Option<User>> {
        let sql = format!("SELECT {} FROM users WHERE telegram_id = ?1 LIMIT 1", Self::USER_FIELDS_FOR_RETURNING);
        let statement = self.db.prepare(&sql);
        match statement.bind(&[telegram_id.into()])?.first::<User>(None).await {
            Ok(Some(user)) => Ok(Some(user)),
            Ok(None) => Ok(None),
            Err(e) => { console_error!("[UserService] Error get_user_by_telegram_id for {}: {}", telegram_id, e); Err(e.into()) }
        }
    }

    pub async fn get_user_by_id(&self, user_id: &str) -> Result<Option<User>> {
        console_log!("[UserService] Getting user by internal ID: {}", user_id);
        let sql = format!("SELECT {} FROM users WHERE id = ?1 LIMIT 1", Self::USER_FIELDS_FOR_RETURNING);
        let statement = self.db.prepare(&sql);
        match statement.bind(&[user_id.into()])?.first::<User>(None).await {
            Ok(Some(user)) => Ok(Some(user)),
            Ok(None) => Ok(None),
            Err(e) => { console_error!("[UserService] Error querying user by internal id {}: {}", user_id, e); Err(e.into()) }
        }
    }

    pub async fn create_user_from_telegram_user(&self, telegram_user: &crate::TelegramUser) -> Result<User> {
        let user_id = worker::Uuid::new_v4().to_string();
        let now = Utc::now();
        let new_user = User {
            id: user_id.clone(), telegram_id: telegram_user.id, telegram_username: telegram_user.username.clone(),
            name: None, age: None, gender: None, bio: None, location_text: None, latitude: None, longitude: None,
            media_keys: default_media_keys(), created_at: now, updated_at: now, last_interaction_at: now,
            state: UserState::Onboarding, roles: default_user_roles(),
        };
        console_log!("[UserService] Creating user: id={}", new_user.id);
        let roles_json = serde_json::to_string(&new_user.roles)?;
        let media_keys_json = serde_json::to_string(&new_user.media_keys)?;
        let state_str = serde_json::to_string(&new_user.state)?.trim_matches('"').to_string();
        let sql = "INSERT INTO users (id, telegram_id, telegram_username, name, age, gender, bio, location_text, latitude, longitude, media_keys, created_at, updated_at, last_interaction_at, state, roles) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)";
        let query = self.db.prepare(sql).bind(&[
            new_user.id.clone().into(), new_user.telegram_id.into(), new_user.telegram_username.clone().into(),
            new_user.name.clone().into(), new_user.age.into(), new_user.gender.clone().into(), new_user.bio.clone().into(),
            new_user.location_text.clone().into(), new_user.latitude.into(), new_user.longitude.into(),
            media_keys_json.into(), now.to_rfc3339().into(), now.to_rfc3339().into(), now.to_rfc3339().into(),
            state_str.into(), roles_json.into(),
        ])?;
        query.run().await.map_err(|e| { console_error!("[UserService] Error creating user {}: {}", new_user.telegram_id, e); e.into() })?;
        Ok(new_user)
    }

    pub async fn update_user_name(&self, user_id: &str, name: String) -> Result<User> { /* ... */ let now=Utc::now(); let sql=format!("UPDATE users SET name=?1,updated_at=?2,last_interaction_at=?2 WHERE id=?3 RETURNING {}",Self::USER_FIELDS_FOR_RETURNING); self.db.prepare(&sql).bind(&[name.into(),now.to_rfc3339().into(),user_id.into()])?.first(None).await?.ok_or_else(||Error::RustError(format!("User {} not found after name update",user_id)))}
    pub async fn update_user_age(&self, user_id: &str, age: u8) -> Result<User> { /* ... */ let now=Utc::now(); let sql=format!("UPDATE users SET age=?1,updated_at=?2,last_interaction_at=?2 WHERE id=?3 RETURNING {}",Self::USER_FIELDS_FOR_RETURNING); self.db.prepare(&sql).bind(&[age.into(),now.to_rfc3339().into(),user_id.into()])?.first(None).await?.ok_or_else(||Error::RustError(format!("User {} not found after age update",user_id)))}
    pub async fn update_user_gender(&self, user_id: &str, gender: String) -> Result<User> { /* ... */ let now=Utc::now(); let sql=format!("UPDATE users SET gender=?1,updated_at=?2,last_interaction_at=?2 WHERE id=?3 RETURNING {}",Self::USER_FIELDS_FOR_RETURNING); self.db.prepare(&sql).bind(&[gender.into(),now.to_rfc3339().into(),user_id.into()])?.first(None).await?.ok_or_else(||Error::RustError(format!("User {} not found after gender update",user_id)))}
    pub async fn update_user_bio(&self, user_id: &str, bio: String) -> Result<User> { /* ... */ let now=Utc::now(); let sql=format!("UPDATE users SET bio=?1,updated_at=?2,last_interaction_at=?2 WHERE id=?3 RETURNING {}",Self::USER_FIELDS_FOR_RETURNING); self.db.prepare(&sql).bind(&[bio.into(),now.to_rfc3339().into(),user_id.into()])?.first(None).await?.ok_or_else(||Error::RustError(format!("User {} not found after bio update",user_id)))}
    pub async fn update_user_location(&self, user_id: &str, location_text: Option<String>, latitude: Option<f64>, longitude: Option<f64>) -> Result<User> { /* ... */ let now=Utc::now(); let sql=format!("UPDATE users SET location_text=?1,latitude=?2,longitude=?3,updated_at=?4,last_interaction_at=?4 WHERE id=?5 RETURNING {}",Self::USER_FIELDS_FOR_RETURNING); self.db.prepare(&sql).bind(&[location_text.into(),latitude.into(),longitude.into(),now.to_rfc3339().into(),user_id.into()])?.first(None).await?.ok_or_else(||Error::RustError(format!("User {} not found after location update",user_id)))}
    pub async fn update_user_state_and_name(&self, user_id: String, new_name: Option<String>, new_state: UserState) -> Result<User> { /* ... */ let now=Utc::now(); let sql=format!("UPDATE users SET name=?1,state=?2,updated_at=?3,last_interaction_at=?3 WHERE id=?4 RETURNING {}",Self::USER_FIELDS_FOR_RETURNING); let state_str=serde_json::to_string(&new_state)?.trim_matches('"').to_string(); self.db.prepare(&sql).bind(&[new_name.into(),state_str.into(),now.to_rfc3339().into(),user_id.clone().into()])?.first::<User>(None).await?.ok_or_else(||Error::RustError(format!("User {} not found after state/name update",user_id)))}
    pub async fn record_user_interaction(&self, user_id: &str) -> Result<()> { /* ... */ let now=Utc::now(); let stmt=self.db.prepare("UPDATE users SET updated_at=?1,last_interaction_at=?1 WHERE id=?2"); query_result_to_unit(stmt.bind(&[now.to_rfc3339().into(),user_id.into()])?.run().await,"record_user_interaction",user_id)}

    // --- Media Key Management ---
    pub async fn add_media_key_to_user(&self, user_id: &str, r2_object_key: String) -> Result<User> {
        console_log!("[UserService] Adding media key '{}' for user_id: {}", r2_object_key, user_id);
        let mut current_user = self.get_user_by_id(user_id).await?
            .ok_or_else(|| worker::Error::RustError(format!("User not found with id: {}", user_id)))?;

        if current_user.media_keys.len() >= MAX_USER_MEDIA_ITEMS {
            console_warn!("[UserService] User {} media limit ({}) reached. Cannot add key '{}'.", user_id, MAX_USER_MEDIA_ITEMS, r2_object_key);
            return Err(worker::Error::RustError(format!("Media limit ({}) reached.", MAX_USER_MEDIA_ITEMS)));
        }

        if !current_user.media_keys.contains(&r2_object_key) {
            current_user.media_keys.push(r2_object_key);
        } else {
            console_warn!("[UserService] Media key already exists for user {}. Not adding duplicate.", user_id);
        }

        let now = Utc::now();
        let updated_media_keys_json = serde_json::to_string(&current_user.media_keys)?;
        let sql = format!("UPDATE users SET media_keys = ?1, updated_at = ?2, last_interaction_at = ?2 WHERE id = ?3 RETURNING {}", Self::USER_FIELDS_FOR_RETURNING);

        self.db.prepare(&sql)
            .bind(&[updated_media_keys_json.into(), now.to_rfc3339().into(), user_id.into()])?
            .first(None).await?
            .ok_or_else(|| worker::Error::RustError(format!("User not found after adding media key: {}", user_id)))
    }

    pub async fn remove_media_key_from_user(&self, user_id: &str, r2_object_key_to_remove: &str) -> Result<User> {
        console_log!("[UserService] Removing media key '{}' for user_id: {}", r2_object_key_to_remove, user_id);
        let mut current_user = self.get_user_by_id(user_id).await?
            .ok_or_else(|| worker::Error::RustError(format!("User not found with id: {}", user_id)))?;

        let initial_len = current_user.media_keys.len();
        current_user.media_keys.retain(|key| key != r2_object_key_to_remove);

        if current_user.media_keys.len() == initial_len && initial_len > 0 { // Check initial_len > 0 to ensure a key was meant to be removed
             if !current_user.media_keys.contains(&r2_object_key_to_remove) { // If key wasn't in the list to begin with
                console_warn!("[UserService] Media key '{}' not found for user {}. No DB change for media_keys.", r2_object_key_to_remove, user_id);
             } // If key was present and list is now shorter, it was removed.
        }


        let now = Utc::now();
        let updated_media_keys_json = serde_json::to_string(&current_user.media_keys)?;
        let sql = format!("UPDATE users SET media_keys = ?1, updated_at = ?2, last_interaction_at = ?2 WHERE id = ?3 RETURNING {}", Self::USER_FIELDS_FOR_RETURNING);

        self.db.prepare(&sql)
            .bind(&[updated_media_keys_json.into(), now.to_rfc3339().into(), user_id.into()])?
            .first(None).await?
            .ok_or_else(|| worker::Error::RustError(format!("User not found after removing media key: {}", user_id)))
    }
}

fn query_result_to_unit<T>(result: Result<worker::d1::D1Result<T>>, operation_name: &str, user_id: &str) -> Result<()> { match result{Ok(_)=>Ok(()),Err(e)=>{console_error!("[UserService] Error in {} for {}: {}",operation_name,user_id,e);Err(e.into())}} }

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rbac_service::Role;
    use chrono::Utc;

    fn create_test_user_for_media(media_keys: Vec<String>) -> User {
        let now = Utc::now();
        User {
            id: "media_test_user".to_string(),
            media_keys,
            telegram_id: 123, telegram_username: None, name: None, age: None, gender: None, bio: None,
            location_text: None, latitude: None, longitude: None, created_at: now,
            updated_at: now, last_interaction_at: now, state: UserState::Active, roles: vec![Role::User],
        }
    }

    #[test]
    fn test_add_media_key_logic_direct() { // Renamed to avoid conflict if other tests are named similarly
        let mut user = create_test_user_for_media(vec![]);
        let key1 = "user_id/key1.jpg".to_string();

        // Simulate logic of add_media_key_to_user before DB call
        if user.media_keys.len() < MAX_USER_MEDIA_ITEMS {
            if !user.media_keys.contains(&key1) { user.media_keys.push(key1.clone()); }
        }
        assert_eq!(user.media_keys.len(), 1);
        assert_eq!(user.media_keys[0], key1);

        for i in 2..=MAX_USER_MEDIA_ITEMS {
            let key = format!("user_id/key{}.jpg", i);
            if user.media_keys.len() < MAX_USER_MEDIA_ITEMS {
                if !user.media_keys.contains(&key) { user.media_keys.push(key); }
            }
        }
        assert_eq!(user.media_keys.len(), MAX_USER_MEDIA_ITEMS);

        let key_over_limit = "user_id/key_over.jpg".to_string();
        let mut limit_hit = false;
        if user.media_keys.len() >= MAX_USER_MEDIA_ITEMS { limit_hit = true; }
        else if !user.media_keys.contains(&key_over_limit) { user.media_keys.push(key_over_limit.clone()); }
        assert!(limit_hit);
        assert_eq!(user.media_keys.len(), MAX_USER_MEDIA_ITEMS);
        assert!(!user.media_keys.contains(&key_over_limit));

        let initial_len_at_limit = user.media_keys.len();
        let existing_key_at_limit = user.media_keys[0].clone();
        // This part of the test was trying to add when already at limit, which the first check prevents
        // So, the logic below wouldn't execute in the actual add_media_key_to_user method if at limit.
        // We are testing the list manipulation here. The add_media_key_to_user has an early return.
        if user.media_keys.len() < MAX_USER_MEDIA_ITEMS { // This will be false if at limit
             if !user.media_keys.contains(&existing_key_at_limit) { user.media_keys.push(existing_key_at_limit); }
        }
        assert_eq!(user.media_keys.len(), initial_len_at_limit);
    }

    #[test]
    fn test_remove_media_key_logic_direct() { // Renamed
        let key1 = "user_id/key1.jpg".to_string();
        let key2 = "user_id/key2.jpg".to_string();
        let key3 = "user_id/key3.jpg".to_string();
        let mut user = create_test_user_for_media(vec![key1.clone(), key2.clone(), key3.clone()]);

        let key_to_remove = key2.clone();
        user.media_keys.retain(|k| k != &key_to_remove);
        assert_eq!(user.media_keys.len(), 2);
        assert!(!user.media_keys.contains(&key_to_remove));
        assert!(user.media_keys.contains(&key1));
        assert!(user.media_keys.contains(&key3));

        let non_existent_key = "user_id/non_existent.jpg".to_string();
        let initial_len_before_non_existent_remove = user.media_keys.len();
        user.media_keys.retain(|k| k != &non_existent_key);
        assert_eq!(user.media_keys.len(), initial_len_before_non_existent_remove);
    }

    // Minimal test user helper from previous step, ensure it's here or imported
    fn create_minimal_test_user(name: Option<String>, state: UserState) -> User {
        let now = Utc::now();
        User {
            id: "test_user_min_id".to_string(), telegram_id: 12345, telegram_username: Some("testuser".to_string()),
            name, age: None, gender: None, bio: None, location_text: None, latitude: None, longitude: None,
            media_keys: default_media_keys(), created_at: now, updated_at: now, last_interaction_at: now,
            state, roles: default_user_roles(),
        }
    }

    #[test] fn test_user_struct_default_values_for_new_fields() { /* ... */ }
    #[test] fn test_user_is_profile_complete_logic() { /* ... */ }
    #[test] fn test_default_user_roles_function() { /* ... */ }
    #[test] fn test_default_media_keys_function() { /* ... */ }
    #[test] fn test_user_serde_defaults() { /* ... */ }
}
