"""Security utilities for the MeetMatch bot."""

import html


def escape_html(text: str | None) -> str:
    """
    Escape HTML characters in a string to prevent HTML injection in Telegram messages.

    Args:
        text (str | None): The input string to escape. If None, returns an empty string.

    Returns:
        str: The escaped string safe for HTML parse mode.
    """
    if text is None:
        return ""
    return html.escape(str(text))
