"""Configuration management for the MeetMatch bot."""

from typing import Any

from pydantic import Field, ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Telegram Bot Configuration
    TELEGRAM_TOKEN: str
    ADMIN_IDS: str | None = None

    @property
    def TELEGRAM_BOT_TOKEN(self) -> str:
        """Alias for TELEGRAM_TOKEN for compatibility."""
        return self.TELEGRAM_TOKEN

    # Database Configuration
    DATABASE_URL: str

    # Redis Configuration
    REDIS_URL: str

    # Sentry Configuration
    SENTRY_DSN: str | None = None

    # Application Configuration
    APP_NAME: str = "MeetsMatch Bot"
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"
    DEBUG: bool = Field(default=False)
    STORAGE_PATH: str = "media"
    MAX_MEDIA_COUNT: int = 3

    # API Configuration
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # Matching Algorithm Configuration
    MATCH_THRESHOLD: float = 0.7
    LOCATION_WEIGHT: float = 0.3
    INTERESTS_WEIGHT: float = 0.5
    PREFERENCES_WEIGHT: float = 0.2

    @field_validator("DEBUG", mode="before")
    @classmethod
    def set_debug(cls, v: Any, info: ValidationInfo) -> bool:
        """Enable debug mode if ENVIRONMENT is development."""
        if isinstance(v, bool):
            return v
        return bool(info.data.get("ENVIRONMENT", "").lower() == "development")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore")


# Create a global settings instance
settings = Settings()  # type: ignore


def get_settings() -> Settings:
    """Return the settings instance."""
    return settings
