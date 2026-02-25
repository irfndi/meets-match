## 2024-05-23 - Authorization Bypass in Match Viewing
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `handle_view_match`.
**Learning:** Checking object ownership is critical even when using hard-to-guess IDs (UUIDs). Defense in depth requires explicit authorization checks.
**Prevention:** Always verify that the current user is authorized to access the requested resource (e.g., is a participant in the match) before returning sensitive data.

## 2024-05-24 - Markdown Injection in Telegram Bot
**Vulnerability:** Unsanitized user input (names, bios, interests) was directly interpolated into Telegram Markdown messages. This allowed users to inject formatting (e.g., bold, italic) or potentially break message parsing (DoS).
**Learning:** Telegram's Legacy Markdown mode is fragile. Special characters like `_`, `*`, `[`, `]`, and `\` must be escaped. Backslashes themselves must be escaped first to prevent escaping the escape characters.
**Prevention:** Use a centralized `escapeMarkdown` utility for all user-controlled strings before embedding them in Markdown templates.
