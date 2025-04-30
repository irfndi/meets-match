"""Configuration management for the MeetMatch bot."""

from functools import lru_cache
from typing import Any

from pydantic import field_validator
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

    @field_validator("ENABLE_SENTRY", mode="before")
    @classmethod
    def validate_enable_sentry(cls, v: Any) -> bool:
        """Enable Sentry if DSN is provided and explicitly enabled."""
        if isinstance(v, bool):
            return v and cls.__fields__["SENTRY_DSN"].get_default() is not None
        return cls.__fields__["SENTRY_DSN"].get_default() is not None and str(v).lower() == "true"

    # Application Configuration
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    @field_validator("DEBUG", mode="before")
    @classmethod
    def validate_debug(cls, v: Any) -> bool:
        """Set debug mode based on environment."""
        if isinstance(v, bool):
            return v
        return cls.__fields__["ENVIRONMENT"].get_default().lower() == "development"

    # API Configuration
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # Matching Algorithm Configuration
    MATCH_THRESHOLD: float = 0.7
    LOCATION_WEIGHT: float = 0.3
    INTERESTS_WEIGHT: float = 0.5
    PREFERENCES_WEIGHT: float = 0.2

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache()
def get_settings() -> Settings:
    """Return the settings instance, creating it if necessary."""
    return Settings()
