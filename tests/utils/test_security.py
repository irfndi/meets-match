"""Tests for security utilities."""

from src.utils.security import escape_html


def test_escape_html_basic():
    """Test basic string escaping."""
    assert escape_html("<b>Bold</b>") == "&lt;b&gt;Bold&lt;/b&gt;"
    assert escape_html("Me & You") == "Me &amp; You"
    assert escape_html('"Quotes"') == "&quot;Quotes&quot;"
    assert escape_html("'Single Quotes'") == "&#x27;Single Quotes&#x27;"
    assert escape_html("<script>alert('xss')</script>") == "&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;"


def test_escape_html_none():
    """Test handling of None input."""
    assert escape_html(None) == ""


def test_escape_html_numbers():
    """Test handling of numbers."""
    assert escape_html(123) == "123"
    assert escape_html(3.14) == "3.14"


def test_escape_html_complex_objects():
    """Test handling of objects convertible to string."""

    class User:
        def __str__(self):
            return "<User>"

    assert escape_html(User()) == "&lt;User&gt;"
