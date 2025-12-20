"""Security utilities for the MeetMatch bot."""

import html
from typing import Any

def escape_html(text: Any) -> str:
    """
    Escapes special characters in text to prevent HTML injection.

    This is crucial when using `parse_mode="HTML"` in Telegram messages.
    It replaces <, >, &, and " with their HTML-safe entities.

    Args:
        text (Any): The input text (will be converted to string).
                    None is converted to an empty string.

    Returns:
        str: The escaped text.
    """
    if text is None:
        return ""
    return html.escape(str(text))

# Alias for compatibility if needed (some docs use sanitize_html)
sanitize_html = escape_html
