"""Mock configuration for testing."""

from typing import Any


class MockSettings:
    """Mock application settings for testing."""

    # Telegram Bot Configuration
    TELEGRAM_TOKEN: str = "test_token"
    TELEGRAM_BOT_TOKEN: str = "test_bot_token"

    # Supabase Configuration
    SUPABASE_URL: str = "https://test.supabase.co"
    SUPABASE_KEY: str = "test_key"

    # Redis/KV Configuration
    REDIS_URL: str = "redis://localhost:6379/0"

    # Application Configuration
    DEBUG: bool = True
    ENABLE_SENTRY: bool = False
    ADMIN_IDS: str = "123456,789012"

    def __getattr__(self, name: str) -> Any:
        """Return None for any attribute not explicitly defined."""
        return None


# Create a global mock settings instance
settings = MockSettings()


def get_settings() -> MockSettings:
    """Return the mock settings instance."""
    return settings
