"""Security utilities for the MeetMatch bot."""

import html
from typing import Any

from src.utils.logging import get_logger

logger = get_logger(__name__)


def escape_html(text: Any) -> str:
    """
    Escape text for HTML usage in Telegram messages.

    Safely handles None, strings, and other types.
    Escapes <, >, &, and " to prevent HTML injection.

    Args:
        text (Any): The input text to escape.

    Returns:
        str: Escaped string safe for HTML parsing.
    """
    if text is None:
        return ""

    return html.escape(str(text))
