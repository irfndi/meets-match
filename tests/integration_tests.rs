use anyhow::Result;
use mf_test::{Miniflare, D1Query, D1Exec, R2BucketExt, R2Object}; // Added R2Object
use serde::Deserialize;
use serde_json::json;
use chrono::{Utc, TimeZone};
use meetsmatch_worker::{ProfileEditingSession, CurrentEditingStep, EditingField, escape_markdown_v2};


#[derive(Deserialize, Debug, PartialEq, Clone)]
struct TestUser {
    id: String,
    telegram_id: i64,
    name: Option<String>,
    state: String,
    roles: String,
    media_keys: String,
    age: Option<i64>,
    gender: Option<String>,
    bio: Option<String>,
    location_text: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
}

#[derive(Deserialize, Debug)]
struct BotResponseMessage {
    method: String,
    chat_id: i64,
    text: String,
    parse_mode: Option<String>,
}

async fn create_test_miniflare() -> Result<Miniflare> {
    let wrangler_toml_content = r#"
        name = "test-worker-integration"
        main = "worker/worker.js"
        compatibility_date = "2024-03-18"
        workers_dev = true
        [d1_databases]
        DB = { binding = "DB", database_name = "test-db", database_id = "test-db-id-placeholder", preview_database_id = "test-db-id-preview-placeholder" }
        [[kv_namespaces]]
        SESSIONS_KV = { binding = "SESSIONS_KV", id = "test-sessions-kv-placeholder", preview_id = "test-sessions-kv-preview-placeholder" }
        FEATURE_FLAGS_KV = { binding = "FEATURE_FLAGS_KV", id = "test-ff-kv-placeholder", preview_id = "test-ff-kv-preview-placeholder" }
        [[r2_buckets]]
        MEDIA_BUCKET = { binding = "MEDIA_BUCKET", bucket_name = "test-media-bucket-placeholder", preview_bucket_name = "test-media-bucket-preview-placeholder" }
    "#;
    let mf = Miniflare::new()
        .raw_wrangler_toml(wrangler_toml_content)?
        .secret("TELEGRAM_TOKEN", "test_bot_token_for_mf_test")?
        // .verbose(true)
        .build().await?;
    Ok(mf)
}

async fn send_telegram_update(mf: &Miniflare, update_payload: serde_json::Value) -> Result<BotResponseMessage> {
    let mut response = mf.post("http://localhost/", update_payload)?.send().await?;
    let response_status = response.status_code();
    let response_body_for_error = response.text().await.unwrap_or_else(|_| "Could not get response body".to_string());
    assert_eq!(response_status, 200, "Bot did not return 200 OK. Status: {}. Body: {}", response_status, response_body_for_error);
    if response_body_for_error.is_empty() || response_body_for_error == "\"\"" {
        panic!("Bot returned an empty or quoted empty string response, expected sendMessage JSON. Body: '{}'", response_body_for_error);
    }
    serde_json::from_str(&response_body_for_error)
        .map_err(|e| anyhow::anyhow!("Failed to parse bot response JSON: '{}'. Body: '{}'", e, response_body_for_error))
}

async fn get_kv_session_typed(mf: &Miniflare, chat_id: i64) -> Result<Option<ProfileEditingSession>> {
    let key = format!("profile_edit_session_v1:{}", chat_id);
    mf.kv("SESSIONS_KV")?.get(&key).json::<ProfileEditingSession>().await.map_err(Into::into)
}


#[tokio::test]
async fn test_start_command_and_name_onboarding_flow() -> Result<()> { /* ... as before ... */ Ok(())}
#[tokio::test]
async fn test_profile_view_command() -> Result<()> { /* ... as before ... */ Ok(())}
#[tokio::test]
async fn test_profile_edit_name_flow() -> Result<()> { /* ... as before ... */ Ok(())}
#[tokio::test]
async fn test_profile_edit_age_flow() -> Result<()> { /* ... as before ... */ Ok(())}
#[tokio::test]
async fn test_profile_edit_gender_flow() -> Result<()> { /* ... as before ... */ Ok(())}
#[tokio::test]
async fn test_profile_edit_bio_flow() -> Result<()> { /* ... as before ... */ Ok(())}
#[tokio::test]
async fn test_profile_edit_location_text_flow() -> Result<()> { /* ... as before ... */ Ok(())}
#[tokio::test]
async fn test_profile_edit_location_shared_coordinates_flow() -> Result<()> { /* ... as before ... */ Ok(())}
#[tokio::test]
async fn test_profile_media_upload_photo_flow() -> Result<()> { /* ... as before ... */ Ok(())}


#[tokio::test]
async fn test_profile_media_deletion_flow() -> Result<()> {
    let mf = create_test_miniflare().await?;

    let user_telegram_id = 889900111i64;
    let chat_id = 222333444i64;
    let user_internal_id = "test-user-media-delete-id-01"; // Unique ID
    let user_name = "MediaDeleter";

    let initial_media_keys = vec![
        format!("{}/photo1_{}.jpg", user_internal_id, "uuid1"),
        format!("{}/video2_{}.mp4", user_internal_id, "uuid2"), // This one will be deleted
        format!("{}/doc3_{}.pdf", user_internal_id, "uuid3"),
    ];
    let media_keys_json_initial = serde_json::to_string(&initial_media_keys)?;

    // 1. Seed D1
    println!("Media Deletion Test - Step 0: Seeding D1 for user_telegram_id: {}", user_telegram_id);
    mf.d1_exec("DB", D1Exec::new(
        "INSERT INTO users (id, telegram_id, name, state, roles, media_keys, created_at, updated_at, last_interaction_at, telegram_username)
         VALUES (?1, ?2, ?3, 'Active', '[\"User\"]', ?4, datetime('now'), datetime('now'), datetime('now'), ?5)"
    ).bind_text(user_internal_id)?.bind_int(user_telegram_id)?.bind_text(user_name)?
     .bind_text(&media_keys_json_initial)?.bind_text("media_deleter_tg")?)
    .await?;

    // 2. Seed R2
    println!("Media Deletion Test - Step 0: Seeding R2 with dummy objects...");
    let r2_bucket = mf.r2_bucket("MEDIA_BUCKET")?;
    for key in &initial_media_keys {
        r2_bucket.put(key, format!("dummy data for {}", key).as_bytes().to_vec()).execute().await?;
    }

    // === Happy Path: Delete a media item ===
    println!("Media Deletion Test - Step A: User sends /profile delete_media");
    let delete_init_payload = json!({ "update_id": 90, "message": { "message_id": 1001, "date": 1700000900, "chat": {"id": chat_id, "type": "private"}, "from": {"id": user_telegram_id, "is_bot": false, "first_name": user_name}, "text": "/profile delete_media" }});
    let resp_list_media = send_telegram_update(&mf, delete_init_payload.clone()).await?; // Clone for potential reuse
    assert!(resp_list_media.text.contains("Which media item would you like to delete?"), "Prompt for media selection failed.");
    assert!(resp_list_media.text.contains("1\\. `photo1_uuid1.jpg`"), "Media item 1 not listed. Got: {}", resp_list_media.text);
    assert!(resp_list_media.text.contains("2\\. `video2_uuid2.mp4`"), "Media item 2 not listed. Got: {}", resp_list_media.text);
    assert!(resp_list_media.text.contains("3\\. `doc3_uuid3.pdf`"), "Media item 3 not listed. Got: {}", resp_list_media.text);

    let kv_session1 = get_kv_session_typed(&mf, chat_id).await?.expect("KV session missing after /profile delete_media");
    match &kv_session1.step {
        CurrentEditingStep::AwaitingMediaDeletionChoice(keys_in_session) => {
            assert_eq!(keys_in_session, &initial_media_keys, "Keys in KV session mismatch initial keys.");
        }
        _ => panic!("KV step not AwaitingMediaDeletionChoice. Got: {:?}", kv_session1.step),
    }

    // Step B: User sends "2" to delete the second item
    let key_to_be_deleted = initial_media_keys[1].clone();
    let key_expected_to_remain1 = initial_media_keys[0].clone();
    let key_expected_to_remain2 = initial_media_keys[2].clone();

    println!("Media Deletion Test - Step B: Sending '2' to delete item '{}'", key_to_be_deleted);
    let select_item_payload = json!({ "update_id": 91, "message": { "message_id": 1002, "date": 1700000901, "chat": {"id": chat_id, "type": "private"}, "from": {"id": user_telegram_id}, "text": "2" }});
    let resp_confirm_delete = send_telegram_update(&mf, select_item_payload).await?;
    let expected_filename_deleted = key_to_be_deleted.split('/').last().unwrap_or("");
    assert!(resp_confirm_delete.text.contains(&format!("Successfully deleted media item `{}`", escape_markdown_v2(expected_filename_deleted))), "Media deletion confirmation failed. Got: {}", resp_confirm_delete.text);

    println!("Media Deletion Test - Step C: Verifying R2 object deletion for '{}'", key_to_be_deleted);
    let deleted_object = r2_bucket.get(&key_to_be_deleted).execute().await?;
    assert!(deleted_object.is_none() || deleted_object.unwrap().body().is_none(), "R2 object '{}' not deleted.", key_to_be_deleted); // .get().execute() returns Option<R2Object>, then .body().is_none()

    let remaining_object1 = r2_bucket.get(&key_expected_to_remain1).execute().await?;
    assert!(remaining_object1.is_some() && remaining_object1.unwrap().body().is_some(), "R2 object '{}' that should remain was deleted.", key_expected_to_remain1);

    println!("Media Deletion Test - Step D: Verifying D1 update...");
    let d1_user_after_delete: Vec<TestUser> = mf.d1_query("DB", D1Query::new("SELECT media_keys FROM users WHERE id = ?1").bind_text(user_internal_id)?).await?;
    assert_eq!(d1_user_after_delete.len(), 1);
    let media_keys_vec_after_delete: Vec<String> = serde_json::from_str(&d1_user_after_delete[0].media_keys)?;
    assert_eq!(media_keys_vec_after_delete.len(), 2, "Media keys count in D1 is not 2 after deletion.");
    assert!(!media_keys_vec_after_delete.contains(&key_to_be_deleted), "Deleted key still present in D1.");
    assert!(media_keys_vec_after_delete.contains(&key_expected_to_remain1));
    assert!(media_keys_vec_after_delete.contains(&key_expected_to_remain2));

    assert!(get_kv_session_typed(&mf, chat_id).await?.is_none(), "KV session not cleared after successful media deletion.");
    println!("Media Deletion Test: Happy path successful.");

    // === Test Deletion: Invalid Number ===
    println!("Media Deletion Test - Step E: Testing invalid number selection...");
    // Re-seed user with 2 items for this test, as one was deleted.
    let keys_for_invalid_test = vec![key_expected_to_remain1.clone(), key_expected_to_remain2.clone()];
    let keys_for_invalid_test_json = serde_json::to_string(&keys_for_invalid_test)?;
    mf.d1_exec("DB", D1Exec::new("UPDATE users SET media_keys = ?1 WHERE id = ?2").bind_text(&keys_for_invalid_test_json)?.bind_text(user_internal_id)?).await?;

    let _ = send_telegram_update(&mf, delete_init_payload.clone()).await?; // Re-initiate /profile delete_media

    let invalid_selection_payload = json!({ "update_id": 92, "message": { "message_id": 1003, "date": 1700000902, "chat": {"id": chat_id, "type": "private"}, "from": {"id": user_telegram_id}, "text": "5" }});
    let resp_invalid_num = send_telegram_update(&mf, invalid_selection_payload).await?;
    assert!(resp_invalid_num.text.contains("Invalid selection. Please enter the number"), "Invalid number error message not received. Got: {}", resp_invalid_num.text);
    let kv_session_invalid_num = get_kv_session_typed(&mf, chat_id).await?.expect("KV session should persist after invalid number");
    assert!(matches!(kv_session_invalid_num.step, CurrentEditingStep::AwaitingMediaDeletionChoice(_)), "KV step incorrect after invalid number. Is: {:?}", kv_session_invalid_num.step);
    mf.kv("SESSIONS_KV")?.delete(&format!("profile_edit_session_v1:{}", chat_id)).await?;
    println!("Media Deletion Test: Invalid number selection test successful.");

    // === Test Deletion: No Media ===
    println!("Media Deletion Test - Step F: Testing deletion when no media exists...");
    mf.d1_exec("DB", D1Exec::new("UPDATE users SET media_keys = '[]' WHERE id = ?1").bind_text(user_internal_id)?).await?;
    let resp_no_media = send_telegram_update(&mf, delete_init_payload.clone()).await?;
    assert!(resp_no_media.text.contains("You don't have any media items to delete."), "No media message not received. Got: {}", resp_no_media.text);
    assert!(get_kv_session_typed(&mf, chat_id).await?.is_none(), "KV session should not be created if no media.");
    println!("Media Deletion Test: No media test successful.");

    Ok(())
}
