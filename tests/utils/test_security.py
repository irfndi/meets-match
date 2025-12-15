"""Tests for security utilities."""

from src.utils.security import sanitize_html


def test_sanitize_html_basic():
    """Test basic string sanitization."""
    assert sanitize_html("Hello World") == "Hello World"


def test_sanitize_html_injection():
    """Test HTML injection sanitization."""
    input_text = "<b>Bold</b> & <script>alert(1)</script>"
    expected = "&lt;b&gt;Bold&lt;/b&gt; &amp; &lt;script&gt;alert(1)&lt;/script&gt;"
    assert sanitize_html(input_text) == expected


def test_sanitize_html_quotes():
    """Test quote sanitization."""
    input_text = ' "Quote" '
    expected = ' &quot;Quote&quot; '
    assert sanitize_html(input_text) == expected


def test_sanitize_html_none():
    """Test sanitization of None input."""
    assert sanitize_html(None) == ""


def test_sanitize_html_integers():
    """Test sanitization of non-string input."""
    assert sanitize_html(str(123)) == "123"
