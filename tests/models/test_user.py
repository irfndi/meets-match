"""Tests for User model."""

import pytest

from src.models.user import Gender, Location, User


class TestUserModel:
    """Tests for User model."""

    @pytest.fixture
    def complete_user(self):
        """Create a complete user for testing."""
        return User(
            id="123",
            first_name="Test",
            age=25,
            gender=Gender.MALE,
            bio="Test bio",
            interests=["music", "sports"],
            photos=["photo1.jpg"],
            location=Location(latitude=0.0, longitude=0.0, city="Test City", country="Test Country"),
            is_active=True,
            is_sleeping=False,
            is_profile_complete=True,
        )

    def test_is_match_eligible_complete_user(self, complete_user):
        """Test is_match_eligible returns True for complete, active, non-sleeping user."""
        assert complete_user.is_match_eligible() is True

    def test_is_match_eligible_sleeping_user(self, complete_user):
        """Test is_match_eligible returns False for sleeping user."""
        complete_user.is_sleeping = True
        assert complete_user.is_match_eligible() is False

    def test_is_match_eligible_inactive_user(self, complete_user):
        """Test is_match_eligible returns False for inactive user."""
        complete_user.is_active = False
        assert complete_user.is_match_eligible() is False

    def test_is_match_eligible_no_location(self, complete_user):
        """Test is_match_eligible returns False when no location."""
        complete_user.location = None
        assert complete_user.is_match_eligible() is False

    def test_is_match_eligible_no_age(self, complete_user):
        """Test is_match_eligible returns False when no age."""
        complete_user.age = None
        assert complete_user.is_match_eligible() is False

    def test_is_match_eligible_no_gender(self, complete_user):
        """Test is_match_eligible returns False when no gender."""
        complete_user.gender = None
        assert complete_user.is_match_eligible() is False

    def test_is_match_eligible_no_interests(self, complete_user):
        """Test is_match_eligible returns False when no interests."""
        complete_user.interests = []
        assert complete_user.is_match_eligible() is False

    def test_is_match_eligible_no_photos(self, complete_user):
        """Test is_match_eligible returns False when no photos."""
        complete_user.photos = []
        assert complete_user.is_match_eligible() is False

    def test_is_match_eligible_incomplete_profile(self, complete_user):
        """Test is_match_eligible returns False when profile incomplete."""
        complete_user.is_profile_complete = False
        assert complete_user.is_match_eligible() is False

    def test_is_sleeping_defaults_to_false(self):
        """Test is_sleeping defaults to False for new users."""
        user = User(id="123", first_name="Test")
        assert user.is_sleeping is False
