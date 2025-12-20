from src.utils.security import escape_html


def test_escape_html():
    assert escape_html("<b>Bold</b>") == "&lt;b&gt;Bold&lt;/b&gt;"
    assert escape_html("User <script>alert(1)</script>") == "User &lt;script&gt;alert(1)&lt;/script&gt;"
    assert escape_html(None) == ""
    assert escape_html(123) == "123"
    assert escape_html("Normal text") == "Normal text"
