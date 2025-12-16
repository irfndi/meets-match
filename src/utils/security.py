"""Security utilities for the MeetMatch bot."""

import html
from typing import Any


def sanitize_html(text: Any) -> str:
    """
    Sanitize text for use in HTML messages to prevent XSS/injection.

    Escapes special characters like <, >, &, ", and '.
    Handles non-string inputs gracefully.

    Args:
        text (Any): The input text to sanitize.

    Returns:
        str: The sanitized text safe for HTML display.
    """
    if text is None:
        return ""

    return html.escape(str(text))
