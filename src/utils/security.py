"""Security utilities for the MeetMatch bot."""

import html
from typing import Any


def sanitize_html(text: Any) -> str:
    """
    Sanitize text to be safe for Telegram HTML parse mode.

    Escapes special characters (<, >, &, etc.) to prevent HTML injection and
    ensure that user input is rendered as literal text, not interpreted as HTML tags.

    Args:
        text (Any): The text to sanitize. Can be None or non-string types.

    Returns:
        str: The sanitized text with special characters escaped. Returns empty string if input is None.
    """
    if text is None:
        return ""

    # Python's html.escape does exactly what we need:
    # converts < to &lt;, > to &gt;, & to &amp;, etc.
    return html.escape(str(text))
