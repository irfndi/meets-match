"""Configuration management for the MeetMatch bot."""

from functools import lru_cache
from typing import Any, List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Telegram Bot Configuration
    TELEGRAM_TOKEN: str

    # --- Cloudflare Bindings --- #
    # These are typically injected by the Cloudflare Workers runtime environment
    # based on wrangler.toml configuration.
    DB: Any | None = None  # Represents the D1 Database binding
    KV: Any | None = None  # Represents the KV Namespace binding
    R2: Any | None = None  # Represents the R2 Bucket binding

    # Sentry Configuration
    SENTRY_DSN: str | None = None
    ENABLE_SENTRY: bool = False

    # Application Configuration
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # API Configuration
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # Admin Configuration
    ADMIN_IDS: str | None = None

    # Matching Algorithm Configuration
    MATCH_THRESHOLD: float = 0.7
    LOCATION_WEIGHT: float = 0.3
    INTERESTS_WEIGHT: float = 0.5
    PREFERENCES_WEIGHT: float = 0.2

    # Internationalization (i18n)
    LOCALE_DIR: str = "./locales"  # Default path
    SUPPORTED_LANGUAGES: List[str] = ["en"]  # Default languages

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache()
def get_settings() -> Settings:
    """Return the settings instance, creating it if necessary."""
    return Settings()
