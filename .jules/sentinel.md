## 2024-05-23 - Authorization Bypass in Match Viewing
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `handle_view_match`.
**Learning:** Checking object ownership is critical even when using hard-to-guess IDs (UUIDs). Defense in depth requires explicit authorization checks.
**Prevention:** Always verify that the current user is authorized to access the requested resource (e.g., is a participant in the match) before returning sensitive data.

## 2024-05-24 - Secure Match Viewing Implementation
**Vulnerability:** IDOR in match profile viewing and Markdown formatting injection.
**Learning:** Legacy Telegram Markdown requires manual escaping of user input. Match authorization checks were missing in callbacks.
**Prevention:** Always verify relationship (e.g., match existence) before exposing profile details. Use `escapeMarkdown` utility for all user input in Markdown messages.
