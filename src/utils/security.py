"""Security utilities for the MeetMatch bot."""

import html
from typing import Any


def escape_html(text: Any) -> str:
    """
    Escape HTML characters in a string to prevent HTML injection in Telegram messages.

    If the input is None, returns an empty string.
    If the input is not a string, converts it to string before escaping.

    Args:
        text: The input text to escape.

    Returns:
        str: The escaped text safe for HTML parse mode.
    """
    if text is None:
        return ""

    return html.escape(str(text), quote=True)
