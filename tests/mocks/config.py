"""Mock configuration for testing."""

from typing import Any, List


class MockSettings:
    """Mock application settings for testing."""

    # Telegram Bot Configuration
    TELEGRAM_TOKEN: str = "test_token"
    TELEGRAM_BOT_TOKEN: str = "test_bot_token"

    # Database Configuration
    DATABASE_URL: str = "postgresql://user:password@localhost:5432/meetsmatch"

    # Redis/KV Configuration
    REDIS_URL: str = "redis://localhost:6379/0"

    # Application Configuration
    DEBUG: bool = True
    ENABLE_SENTRY: bool = False
    ADMIN_IDS: str = "123456,789012"

    def get_admin_ids(self) -> List[int]:
        """Get admin IDs as a list of integers."""
        if not self.ADMIN_IDS:
            return []
        return [int(admin_id.strip()) for admin_id in self.ADMIN_IDS.split(",")]

    def __getattr__(self, name: str) -> Any:
        """Return None for any attribute not explicitly defined."""
        return None


# Create a global mock settings instance
settings = MockSettings()


def get_settings():
    return settings
