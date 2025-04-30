"""Test the mock configuration setup."""

import pytest

from tests.conftest import MockSettings
from tests.mock_config import settings as mock_settings  # Imported for side effects


def test_mock_settings_attributes():
    """Test that mock settings has the expected attributes."""
    assert mock_settings.TELEGRAM_TOKEN == "test_token"
    assert mock_settings.SUPABASE_URL == "https://test.supabase.co"
    assert mock_settings.SUPABASE_KEY == "test_key"
    assert mock_settings.DEBUG is True
    assert mock_settings.ENABLE_SENTRY is False
    assert mock_settings.ADMIN_IDS == "123456,789012"


def test_mock_settings_fallback():
    """Test that undefined attributes return None."""
    assert mock_settings.UNDEFINED_ATTRIBUTE is None


@pytest.mark.asyncio
async def test_import_real_config_returns_mock(mock_settings):
    """Test that importing the real config returns our mock."""
    # This should import the get_settings function and call it
    # Due to the conftest.py setup, this should return our MockSettings instance
    # Import *inside* the test to ensure the patched version is used
    from src.config import get_settings

    settings = get_settings()

    # Verify it's our mock instance by checking a value
    assert isinstance(settings, MockSettings)
    assert settings.TELEGRAM_BOT_TOKEN == "dummy_token"
