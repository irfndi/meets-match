## 2024-05-23 - Authorization Bypass in Match Viewing
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `handle_view_match`.
**Learning:** Checking object ownership is critical even when using hard-to-guess IDs (UUIDs). Defense in depth requires explicit authorization checks.
**Prevention:** Always verify that the current user is authorized to access the requested resource (e.g., is a participant in the match) before returning sensitive data.

## 2024-05-24 - HTML Injection in Telegram Bot Messages
**Vulnerability:** User input (name, bio, etc.) was directly interpolated into Telegram messages with `parse_mode="HTML"`. This allowed users to inject HTML tags (e.g., `<b>`, `<a href="...">`) to spoof content or break formatting.
**Learning:** Even in non-web environments like Telegram bots, "HTML injection" is a valid risk when the platform supports HTML parsing. The default global setting of `parse_mode="HTML"` makes sanitization mandatory for all user input.
**Prevention:** Use a centralized escaping utility (like `html.escape`) for all user-controlled data before including it in formatted strings intended for Telegram.
