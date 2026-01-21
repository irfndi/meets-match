## 2024-05-23 - Authorization Bypass in Match Viewing
**Vulnerability:** Insecure Direct Object Reference (IDOR) in `handle_view_match`.
**Learning:** Checking object ownership is critical even when using hard-to-guess IDs (UUIDs). Defense in depth requires explicit authorization checks.
**Prevention:** Always verify that the current user is authorized to access the requested resource (e.g., is a participant in the match) before returning sensitive data.

## 2024-05-27 - Markdown Injection in Bot Messages
**Vulnerability:** User-controlled data (name, bio) interpolated directly into Markdown templates allowed injection of formatting characters.
**Learning:** Telegram's legacy Markdown parser is strict about unclosed formatting characters, which can cause message delivery failures (DoS) or spoofing. Even "safe" platforms like Telegram require output encoding.
**Prevention:** Always escape special characters in user input before interpolating into Markdown/HTML templates, or use a safe builder/parser.
