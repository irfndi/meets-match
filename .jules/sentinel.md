## 2024-05-23 - HTML Injection in Telegram Bot
**Vulnerability:** User-controlled input (Name, Bio, Interests) was being inserted directly into Telegram messages sent with `parse_mode="HTML"`. This allows malicious users to inject HTML tags (like `<a>` or `<b>`) into their profile, which is then rendered to other users. This could be used for phishing (injecting malicious links) or disrupting the UI.
**Learning:** Even in non-web environments like Telegram bots, "HTML Injection" is a real risk when `parse_mode` is enabled. Telegram's HTML parsing is limited but still supports links and formatting that can be abused.
**Prevention:** Always sanitize user input before formatting it into messages that use HTML or Markdown parsing. Use `html.escape()` for HTML mode.
