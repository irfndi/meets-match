
import pytest
from src.utils.security import sanitize_html

def test_sanitize_html_escapes_special_chars():
    input_text = "I <3 you & me"
    expected = "I &lt;3 you &amp; me"
    assert sanitize_html(input_text) == expected

def test_sanitize_html_handles_none():
    assert sanitize_html(None) == ""

def test_sanitize_html_handles_empty_string():
    assert sanitize_html("") == ""

def test_sanitize_html_handles_numbers():
    assert sanitize_html(123) == "123"
    assert sanitize_html(0) == "0"
