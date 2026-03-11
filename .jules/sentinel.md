## 2024-05-23 - Authorization Bypass in Match Viewing
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `handle_view_match`.
**Learning:** Checking object ownership is critical even when using hard-to-guess IDs (UUIDs). Defense in depth requires explicit authorization checks.
**Prevention:** Always verify that the current user is authorized to access the requested resource (e.g., is a participant in the match) before returning sensitive data.

## 2026-03-11 - Authorization Bypass in Profile Viewing via Telegram Callback
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `view_match_user_` callback.
**Learning:** Telegram bot callbacks can be manipulated by malicious users, allowing them to send arbitrary IDs. Relying solely on the UI to not expose IDs is insufficient.
**Prevention:** Explicitly verify that the requesting user is authorized to view the target user's profile (e.g., they are mutually matched) before displaying sensitive profile information.
