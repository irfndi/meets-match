## 2024-05-23 - Authorization Bypass in Match Viewing
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `handle_view_match`.
**Learning:** Checking object ownership is critical even when using hard-to-guess IDs (UUIDs). Defense in depth requires explicit authorization checks.
**Prevention:** Always verify that the current user is authorized to access the requested resource (e.g., is a participant in the match) before returning sensitive data.

## 2024-05-24 - HTML Injection in Telegram Messages
**Vulnerability:** Cross-Site Scripting (XSS) / HTML Injection in user profiles.
**Learning:** Telegram bots using `parse_mode="HTML"` are vulnerable to HTML injection if user input is not sanitized. Users could inject tags like `<b>` or even `<script>` (though Telegram ignores scripts, it breaks formatting).
**Prevention:** All user-controlled input (name, bio, interests, location) must be passed through `src.utils.security.sanitize_html` before being inserted into HTML message templates.
