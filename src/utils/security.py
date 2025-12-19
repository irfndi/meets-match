"""Security utilities for the MeetMatch bot."""

import html


def sanitize_html(text: str | None) -> str:
    """
    Sanitize text for use in HTML-formatted Telegram messages.

    Escapes special characters (<, >, &, ", ') to prevent HTML injection.
    Handles None by returning an empty string.

    Args:
        text (str | None): The input text to sanitize.

    Returns:
        str: The sanitized text, safe for HTML parsing.
    """
    if text is None:
        return ""
    return html.escape(str(text))
