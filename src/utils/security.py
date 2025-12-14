"""Security utilities for the MeetMatch bot."""

import html
from typing import Any

def sanitize_html(text: Any) -> str:
    """
    Sanitize text to prevent HTML injection in Telegram messages.

    Escapes HTML special characters (<, >, &, ", ') so that they are displayed
    as literal text rather than being interpreted as HTML tags.

    Args:
        text (Any): The input text to sanitize. converted to string.

    Returns:
        str: The sanitized text safe for HTML parse mode.
    """
    if text is None:
        return ""
    return html.escape(str(text))
