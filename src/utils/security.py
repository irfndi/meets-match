"""Security utilities for the MeetMatch bot."""

import html


def sanitize_html(text: str | None) -> str:
    """
    Sanitize text for use in HTML-parse-mode Telegram messages.

    Escapes special characters (<, >, &, ", ') to prevent HTML injection.
    If text is None, returns an empty string.

    Args:
        text (str | None): The text to sanitize.

    Returns:
        str: The sanitized text, safe to include in HTML messages.
    """
    if text is None:
        return ""
    return html.escape(str(text))
