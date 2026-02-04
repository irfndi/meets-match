## 2024-05-23 - Authorization Bypass in Match Viewing
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `handle_view_match`.
**Learning:** Checking object ownership is critical even when using hard-to-guess IDs (UUIDs). Defense in depth requires explicit authorization checks.
**Prevention:** Always verify that the current user is authorized to access the requested resource (e.g., is a participant in the match) before returning sensitive data.

## 2024-05-24 - Markdown Injection & IDOR in Matches
**Vulnerability:** IDOR in `view_match_user_` callback allowed viewing any user profile. Markdown injection possible in user names/bios.
**Learning:** Telegram Legacy Markdown requires escaping `_`, `*`, `[`, `` ` ``. Always verify match relationship before showing profile.
**Prevention:** Use `escapeMarkdown` helper on all user input. Check `matchService` for relationship validity in callbacks.
