"""Test the mock configuration setup."""

import pytest

# Import mock_config first
from tests.mock_config import settings as mock_settings


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
async def test_import_real_config_returns_mock():
    """Test that importing the real config returns our mock."""
    # This should import our mock instead of the real config
    from src.config import settings

    # Verify it's our mock
    assert settings.TELEGRAM_TOKEN == "test_token"
    assert settings.SUPABASE_URL == "https://test.supabase.co"
