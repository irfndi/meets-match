## 2024-05-23 - Authorization Bypass in Match Viewing
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `handle_view_match`.
**Learning:** Checking object ownership is critical even when using hard-to-guess IDs (UUIDs). Defense in depth requires explicit authorization checks.
**Prevention:** Always verify that the current user is authorized to access the requested resource (e.g., is a participant in the match) before returning sensitive data.

## 2024-06-11 - Telegram Legacy Markdown Injection
**Vulnerability:** User input was interpolated directly into Telegram messages using `parse_mode: 'Markdown'`, allowing injection of formatting characters (e.g., `_`, `*`, `[`) and potential link spoofing.
**Learning:** Telegram's legacy Markdown mode is unforgiving and requires escaping specific characters (`_`, `*`, `[`, `` ` ``) to prevent broken formatting and spoofing.
**Prevention:** Always use an `escapeMarkdown` utility function when displaying user-generated content in Telegram messages.
