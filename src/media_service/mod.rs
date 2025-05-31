// src/media_service/mod.rs
use worker::{Env, Result, Bucket as R2Bucket, Date, Uuid, R2PutOptions, HttpMetadata};
use std::path::Path;
use std::collections::HashMap; // For custom metadata example (not used in final put_options yet)

// Custom error type for MediaService
#[derive(Debug)]
pub enum MediaServiceError {
    R2OperationFailed(String),
    InvalidFileName(String),
    UploadTooLarge, // Example, not yet enforced
    ConfigurationError(String),
}

impl std::fmt::Display for MediaServiceError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MediaServiceError::R2OperationFailed(s) => write!(f, "R2 operation failed: {}", s),
            MediaServiceError::InvalidFileName(s) => write!(f, "Invalid file name: {}", s),
            MediaServiceError::UploadTooLarge => write!(f, "Uploaded file is too large."),
            MediaServiceError::ConfigurationError(s) => write!(f, "Configuration error: {}", s),
        }
    }
}

impl std::error::Error for MediaServiceError {} // Allow it to be treated as a standard error

// Allow converting worker::Error into MediaServiceError for convenience in Result chains
impl From<worker::Error> for MediaServiceError {
    fn from(err: worker::Error) -> Self {
        MediaServiceError::R2OperationFailed(err.to_string())
    }
}


pub struct MediaService {
    media_bucket: R2Bucket,
    // Optionally, store the public R2 domain if configured for public URLs
    // public_r2_domain: Option<String>,
}

impl MediaService {
    pub fn new(env: &Env) -> Result<Self> { // worker::Result
        match env.bucket("MEDIA_BUCKET") {
            Ok(media_bucket) => {
                worker::console_log!("[MediaService] Initialized with MEDIA_BUCKET binding.");
                // Example of how to get public R2 domain if it were set in env vars:
                // let public_r2_domain = env.var("R2_PUBLIC_DOMAIN").map(|v| v.to_string()).ok();
                Ok(Self { media_bucket /*, public_r2_domain */ })
            }
            Err(e) => {
                worker::console_error!("[MediaService] CRITICAL: Failed to bind to 'MEDIA_BUCKET' R2 bucket: {}. Ensure it's configured in wrangler.toml.", e);
                // Return a configuration error or propagate the worker::Error
                Err(worker::Error::Configuration(format!("MEDIA_BUCKET R2 binding missing or invalid: {}", e)))
            }
        }
    }

    /// Generates a unique object key for R2 storage.
    /// Format: <user_id>/<sanitized_stem>_<uuid>.<extension>
    fn generate_object_key(&self, user_id: &str, original_file_name: &str) -> Result<String> { // worker::Result
        let file_stem = Path::new(original_file_name)
            .file_stem()
            .and_then(|s| s.to_str())
            .filter(|s| !s.is_empty()) // Ensure stem is not empty
            .unwrap_or("media");

        let extension = Path::new(original_file_name)
            .extension()
            .and_then(|s| s.to_str())
            .map_or_else(String::new, |ext| format!(".{}", ext.to_lowercase())); // Standardize extension to lowercase

        // Basic sanitization for stem: replace non-alphanumeric (excluding typical separators) with underscore
        let safe_stem: String = file_stem
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
            .collect();

        // Prevent overly long stems
        const MAX_STEM_LEN: usize = 50;
        let truncated_stem = if safe_stem.len() > MAX_STEM_LEN {
            &safe_stem[..MAX_STEM_LEN]
        } else {
            &safe_stem
        };

        let unique_id = Uuid::new_v4().to_string();
        Ok(format!("{}/{}_{}{}", user_id, truncated_stem, unique_id, extension))
    }

    pub async fn upload_media(
        &self,
        user_id: &str,
        original_file_name: String,
        mime_type: Option<String>,
        body: Vec<u8>
    ) -> Result<String> { // Returns object key
        let object_key = self.generate_object_key(user_id, &original_file_name)?;

        worker::console_log!(
            "[MediaService] Uploading: User '{}', Key '{}', Size {}B, MIME {:?}",
            user_id, object_key, body.len(), mime_type
        );

        let mut put_options = R2PutOptions::new();
        if let Some(mt) = mime_type {
            let mut http_metadata = HttpMetadata::default();
            http_metadata.content_type = Some(mt); // e.g., "image/jpeg", "video/mp4"
            put_options = put_options.http_metadata(http_metadata);
        }
        // Example: Add custom metadata (original filename, uploader_id)
        // let mut custom_metadata = HashMap::new();
        // custom_metadata.insert("originalFilename".into(), original_file_name.clone()); // Max 2KB total for custom metadata
        // custom_metadata.insert("userId".into(), user_id.to_string());
        // put_options = put_options.custom_metadata(custom_metadata);

        match self.media_bucket.put(&object_key, body).set_options(put_options).execute().await {
            Ok(put_object) => {
                worker::console_log!("[MediaService] R2 Upload OK: Key '{}', ETag '{}'", object_key, put_object.etag());
                Ok(object_key)
            }
            Err(e) => {
                worker::console_error!("[MediaService] R2 Put Failed: Key '{}', Error: {}", object_key, e);
                Err(e.into())
            }
        }
    }

    pub async fn delete_media(&self, object_key: &str) -> Result<()> {
        worker::console_log!("[MediaService] Deleting: Key '{}'", object_key);
        // R2 delete is idempotent; no error if object doesn't exist.
        // Use .head() first if you need to confirm existence or get metadata before delete.
        match self.media_bucket.delete(object_key).await {
            Ok(_) => {
                worker::console_log!("[MediaService] R2 Delete OK (or key not found): Key '{}'", object_key);
                Ok(())
            }
            Err(e) => {
                worker::console_error!("[MediaService] R2 Delete Failed: Key '{}', Error: {}", object_key, e);
                Err(e.into())
            }
        }
    }

    pub async fn get_media_public_url(&self, object_key: &str) -> Result<String> {
        worker::console_log!("[MediaService] Generating public URL for: Key '{}'", object_key);
        // This is a placeholder. Actual public URL depends on R2 bucket's public access settings
        // and custom domain configuration. If bucket is not public, this won't work.
        // A common pattern is to use a custom domain like "media.yourdomain.com".
        // For now, we return a relative path that implies the worker might serve it,
        // or it needs to be prefixed with the R2 public domain if one is configured.

        // if let Some(domain) = &self.public_r2_domain {
        //     Ok(format!("https://{}/{}", domain, object_key))
        // } else {
        // worker::console_warn!("[MediaService] Public R2 domain not configured. Returning relative path.");
        Ok(format!("/media/{}", object_key)) // This path would need a route in the worker to serve R2 objects
        // }
    }

    pub async fn get_presigned_media_url(&self, object_key: &str, _duration_seconds: u32) -> Result<String> {
        worker::console_log!("[MediaService] Generating presigned URL for: Key '{}'", object_key);
        // Actual R2 presigned URLs require more complex setup (IAM permissions for the Worker,
        // and using specific R2 SDK features not directly exposed in basic workers-rs `Bucket` yet,
        // or making AWS SigV4 signed requests manually or via a library).
        // This is a placeholder.
        worker::console_warn!("[MediaService] get_presigned_media_url - NOT IMPLEMENTED YET.");
        Err(worker::Error::RustError(format!("Presigned URL generation for '{}' is not implemented.", object_key)))
    }
}

// Basic tests for generate_object_key (can be expanded)
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_object_key_normal() {
        let service = MediaService { media_bucket: Env::empty().bucket("MEDIA_BUCKET").unwrap() }; // Mock bucket for test
        let key = service.generate_object_key("user123", "profile_picture.jpg").unwrap();
        assert!(key.starts_with("user123/profile_picture_"));
        assert!(key.ends_with(".jpg"));
        assert!(key.contains("-")); // From UUID
    }

    #[test]
    fn test_generate_object_key_no_extension() {
        let service = MediaService { media_bucket: Env::empty().bucket("MEDIA_BUCKET").unwrap() };
        let key = service.generate_object_key("user456", "myfile").unwrap();
        assert!(key.starts_with("user456/myfile_"));
        assert!(!key.contains(".")); // No dot before UUID part if original had no extension
    }

    #[test]
    fn test_generate_object_key_special_chars_in_name() {
        let service = MediaService { media_bucket: Env::empty().bucket("MEDIA_BUCKET").unwrap() };
        let key = service.generate_object_key("user789", "my test file with spaces & chars!.png").unwrap();
        assert!(key.starts_with("user789/my_test_file_with_spaces___chars_"));
        assert!(key.ends_with(".png"));
    }

    #[test]
    fn test_generate_object_key_empty_name() {
        // Path::file_stem("") is Some(""), so unwrap_or("media") is not hit unless original_file_name is "." or ".."
        let service = MediaService { media_bucket: Env::empty().bucket("MEDIA_BUCKET").unwrap() };
        let key = service.generate_object_key("userABC", "").unwrap();
        assert!(key.starts_with("userABC/media_")); // Falls back to "media" because stem of "" is ""

        let key_dot = service.generate_object_key("userABC", ".").unwrap();
        assert!(key_dot.starts_with("userABC/media_")); // Stem of "." is None
    }
}
