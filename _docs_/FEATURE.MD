# MeetMatch Feature Architecture

## Table of Contents
- [User Interaction Flows](#user-interaction-flows)
- [Core Features](#core-features)
- [Matching Algorithm](#matching-algorithm)
- [Security & Privacy](#security--privacy)
- [Rate Limits & Quotas](#rate-limits--quotas)

## User Interaction Flows
```mermaid
graph TD
    A[/start] --> B{Profile Complete?}
    B -->|Yes| C[Show Likes/Main Menu]
    B -->|No| D[Continue Registration]
    C --> E[/match]
    C --> F[/profile]
    C --> G[/config]
```

## Core Features

### Profile Management
- **Data Validation**
```python
def validate_profile(user: User) -> dict:
    """Returns {valid: bool, errors: list}"""
    if not user.media:
        return {'valid': False, 'errors': ['MEDIA_REQUIRED']}
```

### Matching Service
| Parameter       | Default | Description                     |
|-----------------|---------|---------------------------------|
| `MAX_DISTANCE`  | 50km    | Initial location match radius   |
| `AGE_RANGE`     | ±4      | Allowed age difference          |
| `RETRY_DELAY`   | 72h     | Profile re-match cooldown       |

- this is global parameter for all users & individual users cant change this

individual parameter
| Parameter       | Default | Description                     |
|-----------------|---------|---------------------------------|
| `GENDER`  | Bolean    | Gender preference (male/female)   |


### Profile Updates
- Users can update their profile after registration via `/profile` command.
- Changes are saved and reflected immediately.

### Profile Fields
- **Name:** Free-form input (no first/last name requirement).
- **Gender:** Male or Female.
- **Age:** 12–100 years.
- **Bio:** Max 120 characters.
- **Location:**
    - Share location via Telegram or manually type the city.
    - Automatically match city with country in the database.
- **Interests:**
    - Flexible manual input with robust matching for typos, synonyms, and case sensitivity (e.g., "music" vs "MUSIC").
    - Optional field.
- **Media:**
    - Max 5 media files (images/videos).
    - Minimum 1 media file required.

### Registration Mechanism
- Users must complete all registration steps before using the bot.
- If incomplete, continue from the last step.

### Profile Mechanism
- Users can see profiles that have liked them (name, age, media, interests, location, bio).
- Users can like back or dislike the profile.

### Matching Mechanism
- **Age:** Match within a range of -4 to +4 years of the user's age.
- **Location:** Match by city or nearby cities. If traffic is low, expand to country or nearby countries.
- **Interests:** Match based on shared or similar interests.

### Matching Algorithm
- Introduce a scoring system for better match quality (e.g., higher weight for shared interests).
- Allow users to set preferences for age range, location, and interests.

### Report Mechanism
- Save data on who reported whom for manual review.
- Ensure reported profiles are flagged for further action.

### Delete Account Mechanism
- Users can delete their account and all associated data via `/configuration`.
- On database (Cloudflare D1) we mark soft delete and keep the data for a retention period.
- If users create with same telegram username, we still create new account other different ID

### Media Mechanism
- Max 5 media files (images/videos) per profile with max size 5MB.
- Have mechanism to store media metadata in D1 and potentially use R2 or KV for blobs if needed (evaluate based on cost/performance).
- Have mechanism to delete media references in 180 days after they change their media or account is deleted.

## Data Persistence
- **Profile Data:** Stored in Cloudflare D1 (SQLite-based serverless database).
- **Media Metadata:** Stored in Cloudflare D1. Blob storage TBD (R2/KV).
- **Cache/Session Data:** Cloudflare KV for fast lookups.

## Security & Privacy
1. **Data Encryption**
   - Data at rest encrypted by Cloudflare.
   - TLS 1.3 for data in transit (Cloudflare default).

2. **Access Controls**
    - Access to D1/KV/R2 managed via Cloudflare Worker bindings and secrets.
    - Environment variables for API keys/tokens managed securely via Cloudflare dashboard and `.dev.vars`.
```yaml
# wrangler.toml example binding (conceptual)
[[d1_databases]]
binding = "DB"
database_name = "meetmatch-db"
database_id = "your-d1-database-id"

[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"
```

## Rate Limits & Quotas
- Implement rate limits for API requests to prevent abuse.
- Set quotas for media storage and profile updates.

## Match Interaction Flow
1. User initiates matching (e.g., via `/match`).
2. The bot presents User B's profile to User A.
3. User A uses inline buttons to **Like**, **Dislike**, or **Report** User B.
    *   **If Like:**
        *   The 'Like' is recorded.
        *   The system checks if User B has previously 'Liked' User A.
        *   **If Mutual Match:** Both User A and User B receive an immediate notification containing the other's profile information (e.g., username) encouraging direct contact via Telegram.
        *   **If Not Mutual:** User A is presented with the next potential match (User C).
    *   **If Dislike:**
        *   The 'Dislike' is recorded.
        *   User A is presented with the next potential match (User C).
    *   **If Report:**
        *   The report flow is initiated (details TBD, likely involves selecting a reason).
        *   User A is presented with the next potential match (User C).
4. The process repeats with the next potential match.
5. Users are expected to use Telegram's direct messaging feature to communicate *after* a mutual match is confirmed by the bot.

## Additional Enhancements

### Profile Status:
- Add a profile status (e.g., "Active," "Inactive," "Banned") to manage user activity.
- Allow users to temporarily deactivate their profile via `/configuration`.

### User Notifications:
- Notify users when they receive a new like or match.
- Send reminders to complete their profile if incomplete.

### Analytics Dashboard:
- Track user interactions, matches, and reports for insights and improvements.

## Example Flow

1. User sends `/start`.
2. Bot checks profile completion:
     - If incomplete, continue registration.
     - If complete, show profiles that have liked the user.
3. User interacts with profiles using `/like`, `/dislike`, or `/report`.
4. If a match occurs, share Telegram usernames.
5. User can update profile or change settings via `/profile` and `/configuration`.