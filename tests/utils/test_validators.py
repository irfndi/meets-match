import unittest

import pytest

from src.utils.validators import (
    is_valid_age,
    is_valid_bio,
    is_valid_gender,
    is_valid_interests,
    is_valid_name,
)

# --- Tests for is_valid_age --- #


@pytest.mark.parametrize(
    "age, expected",
    [
        (18, True),  # Minimum valid age
        (30, True),  # Valid age within range
        (100, True),  # Maximum valid age
        (17, False),  # Below minimum age
        (101, False),  # Above maximum age
        (0, False),
        (-5, False),
    ],
)
def test_is_valid_age(age, expected):
    """Test is_valid_age function with various inputs."""
    assert is_valid_age(age) == expected


# --- Tests for is_valid_bio --- #


@pytest.mark.parametrize(
    "bio, expected",
    [
        ("a", True),  # Minimum length
        ("This is a valid bio.", True),
        ("A" * 500, True),  # Maximum length
        (None, False),  # None should be handled by the caller or specific logic, validator expects string
        ("", False),  # Empty string
        ("A" * 501, False),  # Exceeds maximum length
        (123, False),  # Invalid type
    ],
)
def test_is_valid_bio(bio, expected):
    """Test is_valid_bio function with various inputs."""
    # The function expects str. We test invalid types directly.
    if not isinstance(bio, str):
        # For simple bool return, we expect False for wrong types/None
        assert is_valid_bio(bio) is False
    else:
        assert is_valid_bio(bio) == expected


# --- Tests for is_valid_interests --- #


@pytest.mark.parametrize(
    "interests, expected",
    [
        (["a"], True),  # Minimum number of interests, min length
        (["coding"], True),  # Single valid interest
        (["hiking", "reading", "coding"], True),  # Multiple valid interests
        (["a"] * 10, True),  # Maximum number of interests
        (["a" * 50], True),  # Max length interest
        ([], False),  # Empty list
        (None, False),
        (["a"] * 11, False),  # Exceeds max number of interests
        ([""], False),  # Empty string interest
        (["a" * 51], False),  # Interest exceeds max length
        (["valid", ""], False),  # Contains empty string
        (["valid", "a" * 51], False),  # Contains too long string
        ("not a list", False),  # Invalid type
        ([1, 2, 3], False),  # List contains invalid types
    ],
)
def test_is_valid_interests(interests, expected):
    """Test is_valid_interests function with various inputs."""
    assert is_valid_interests(interests) == expected


# --- Tests for is_valid_name --- #


@pytest.mark.parametrize(
    "name, expected",
    [
        ("a", True),  # Minimum length
        ("Valid Name", True),
        ("N" * 100, True),  # Maximum length
        (None, False),  # None should be handled by the caller or specific logic, validator expects string
        ("", False),  # Empty string
        ("N" * 101, False),  # Exceeds maximum length
        (123, False),  # Invalid type
    ],
)
def test_is_valid_name(name, expected):
    """Test is_valid_name function with various inputs."""
    # Handle invalid types explicitly like in test_is_valid_bio
    if not isinstance(name, str):
        assert is_valid_name(name) is False
    else:
        assert is_valid_name(name) == expected


class TestIsValidGender(unittest.TestCase):
    """Tests for the is_valid_gender function."""

    def test_valid_genders(self):
        """Test valid gender inputs."""
        self.assertTrue(is_valid_gender("Male"))
        self.assertTrue(is_valid_gender("Female"))
        self.assertTrue(is_valid_gender("Non-binary"))
        self.assertTrue(is_valid_gender("male"))  # Case-insensitive
        self.assertTrue(is_valid_gender("female"))
        self.assertTrue(is_valid_gender("non-binary"))

    def test_invalid_genders(self):
        """Test invalid gender inputs."""
        self.assertFalse(is_valid_gender("Man"))
        self.assertFalse(is_valid_gender("Woman"))
        self.assertFalse(is_valid_gender("Other"))
        self.assertFalse(is_valid_gender(""))  # Empty string
        self.assertFalse(is_valid_gender(" "))  # Whitespace

    def test_none_input(self):
        """Test None input."""
        self.assertFalse(is_valid_gender(None))

    def test_non_string_input(self):
        """Test non-string input."""
        self.assertFalse(is_valid_gender(123))
        self.assertFalse(is_valid_gender([]))
        self.assertFalse(is_valid_gender({}))


if __name__ == "__main__":
    unittest.main()
