// src/lib_tests.rs
// This file is separate for clarity, but its contents will be put into lib.rs under #[cfg(test)]
// For the purpose of this tool, imagine this content is appended to src/lib.rs

use super::*; // Access items in lib.rs (escape_markdown_v2, format_user_profile_view)
use crate::user_service::{User as DomainUser, UserState}; // Adjust path if your User struct is elsewhere or aliased differently in lib.rs
use crate::rbac_service::Role; // Assuming Role is used in DomainUser
use chrono::{TimeZone, Utc};

// Helper to create DomainUser for lib tests
// Ensure this matches the DomainUser struct fields exactly
fn create_domain_user_for_lib_test(
    name: Option<String>, age: Option<u8>, gender: Option<String>, bio: Option<String>,
    location_text: Option<String>, latitude: Option<f64>, longitude: Option<f64>,
    media_keys: Vec<String>, state: UserState, roles: Vec<Role>,
    created_at_str: &str, last_interaction_at_str: &str
) -> DomainUser {
    DomainUser {
        id: "domain_user_test_id".to_string(),
        telegram_id: 123456,
        telegram_username: Some("libtester".to_string()),
        name, age, gender, bio, location_text, latitude, longitude, media_keys,
        created_at: Utc.datetime_from_str(created_at_str, "%Y-%m-%dT%H:%M:%SZ").unwrap(),
        updated_at: Utc.datetime_from_str(last_interaction_at_str, "%Y-%m-%dT%H:%M:%SZ").unwrap(), // Assuming updated_at is same as last_interaction for simplicity here
        last_interaction_at: Utc.datetime_from_str(last_interaction_at_str, "%Y-%m-%dT%H:%M:%SZ").unwrap(),
        state,
        roles,
    }
}


#[test]
fn test_escape_markdown_v2_common_chars() {
    assert_eq!(escape_markdown_v2("Hello_World*Test[]()."), "Hello\\_World\\*Test\\[\\]\\(\\)\\.");
    assert_eq!(escape_markdown_v2("No special chars"), "No special chars");
    assert_eq!(escape_markdown_v2("`code` and ~strike~"), "\\`code\\` and \\~strike\\~");
    assert_eq!(escape_markdown_v2(">#+-=|{}.!"), "\\>\\#\\+\\-\\=\\|\\{\\}\\.\\!");
    assert_eq!(escape_markdown_v2("Test-string=value"), "Test\\-string\\=value");
}

#[test]
fn test_format_user_profile_view_all_fields_with_markdown_chars() {
    let user = create_domain_user_for_lib_test(
        Some("Jöhn_Doé*".to_string()), // Name with special chars
        Some(30),
        Some("Non-binary".to_string()),
        Some("Bio with *markdown* _italic_ and `code`.".to_string()),
        Some("City, Country [HQ]".to_string()), // Location text with special chars
        Some(12.3456),
        Some(78.9012),
        vec!["key1.jpg".to_string(), "key2.png".to_string()],
        UserState::Active,
        vec![Role::User, Role::Admin],
        "2023-01-01T10:00:00Z",
        "2023-01-10T12:00:00Z"
    );
    let formatted_string = format_user_profile_view(&user);

    // Check for escaped content
    assert!(formatted_string.contains("Name*: Jöhn\\_Doé\\*"), "Name not escaped correctly: {}", formatted_string);
    assert!(formatted_string.contains("Age*: 30"), "Age incorrect: {}", formatted_string);
    assert!(formatted_string.contains("Gender*: Non\\-binary"), "Gender not escaped correctly: {}", formatted_string);
    assert!(formatted_string.contains("Bio*: Bio with \\*markdown\\* \\_italic\\_ and \\`code\\`\\."), "Bio not escaped correctly: {}", formatted_string);
    assert!(formatted_string.contains("Location*: City, Country \\[HQ\\] \\(Lat: 12\\.346, Lon: 78\\.901\\)"), "Location not escaped or formatted correctly: {}", formatted_string);
    assert!(formatted_string.contains("Media Items*: 2 items"), "Media count incorrect: {}", formatted_string); // items() is not escaped
    assert!(formatted_string.contains("Roles: `[User, Admin]`"), "Roles incorrect: {}", formatted_string);
    assert!(formatted_string.contains("Joined: `2023-01-01 10:00 UTC`"), "Joined date incorrect: {}", formatted_string);
    assert!(formatted_string.contains("Last Interaction: `2023-01-10 12:00 UTC`"), "Last interaction date incorrect: {}", formatted_string);
    assert!(formatted_string.contains("/profile edit name` \\(feature coming soon\\!\\)"), "Edit hint incorrect: {}", formatted_string);

    // Check overall structure (simplified check)
    assert!(formatted_string.starts_with("*Your Profile*"));
    assert!(formatted_string.contains("\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-\\-")); // Separator line
}

#[test]
fn test_format_user_profile_view_some_fields_none() {
    let user = create_domain_user_for_lib_test(
        Some("Jane Doe".to_string()),
        None, // Age None
        None, // Gender None
        Some("Simple bio.".to_string()),
        None, // Location text None
        None, // Latitude None
        None, // Longitude None
        vec![], // No media keys
        UserState::Onboarding,
        vec![Role::User],
        "2022-05-05T15:30:00Z",
        "2022-05-06T18:00:00Z"
    );
    let formatted_string = format_user_profile_view(&user);

    assert!(formatted_string.contains("Name*: Jane Doe"), "Name incorrect: {}", formatted_string);
    assert!(formatted_string.contains("Age*: Not set"), "Age should be 'Not set': {}", formatted_string);
    assert!(formatted_string.contains("Gender*: Not set"), "Gender should be 'Not set': {}", formatted_string);
    assert!(formatted_string.contains("Bio*: Simple bio\\."), "Bio not escaped correctly: {}", formatted_string);
    assert!(formatted_string.contains("Location*: Not set"), "Location should be 'Not set': {}", formatted_string);
    assert!(formatted_string.contains("Media Items*: 0 items"), "Media count incorrect: {}", formatted_string);
    assert!(formatted_string.contains("State: `Onboarding`"), "State incorrect: {}", formatted_string);
}

#[test]
fn test_format_user_profile_location_variants_formatting() {
    let user_text_only = create_domain_user_for_lib_test(None,None,None,None, Some("Home Town (Test)".to_string()), None,None,vec![], UserState::Active, vec![], "2023-01-01T00:00:00Z", "2023-01-01T00:00:00Z");
    let formatted_text_only = format_user_profile_view(&user_text_only);
    assert!(formatted_text_only.contains("Location*: Home Town \\(Test\\)"), "Location text only not formatted/escaped correctly: {}", formatted_text_only);

    let user_coords_only = create_domain_user_for_lib_test(None,None,None,None, None, Some(1.23456), Some(5.67891),vec![], UserState::Active, vec![], "2023-01-01T00:00:00Z", "2023-01-01T00:00:00Z");
    let formatted_coords_only = format_user_profile_view(&user_coords_only);
    assert!(formatted_coords_only.contains("Location*: Lat: 1\\.235, Lon: 5\\.679"), "Location coords only not formatted/escaped correctly: {}", formatted_coords_only); // Note: periods in numbers are not escaped by current func
}

#[test]
fn test_format_user_profile_empty_bio_and_name() {
     let user = create_domain_user_for_lib_test(
        None, // Name None
        None, // Age None
        None, // Gender None
        None, // Bio None
        None, // Location text None
        None, // Latitude None
        None, // Longitude None
        vec![], // No media keys
        UserState::Onboarding,
        vec![Role::User],
        "2022-05-05T15:30:00Z",
        "2022-05-06T18:00:00Z"
    );
    let formatted_string = format_user_profile_view(&user);
    assert!(formatted_string.contains("Name*: Not set"));
    assert!(formatted_string.contains("Bio*: Not set"));
}
