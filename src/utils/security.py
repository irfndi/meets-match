"""Security utilities for the MeetMatch bot."""

import html


def sanitize_html(text: str | None) -> str:
    """
    Sanitize text for use in HTML-parse_mode Telegram messages.

    Escapes special characters (<, >, &, ", ') to prevent HTML injection.

    Args:
        text (str | None): The input text to sanitize.

    Returns:
        str: The sanitized text, or an empty string if input is None.
    """
    if text is None:
        return ""
    return html.escape(str(text))
