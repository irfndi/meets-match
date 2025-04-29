"""Configuration management for the MeetMatch bot."""

from typing import Any, Dict, Optional

from pydantic import Field, validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Telegram Bot Configuration
    TELEGRAM_TOKEN: str

    # Supabase Configuration
    SUPABASE_URL: str
    SUPABASE_KEY: str

    # Redis/KV Configuration
    REDIS_URL: Optional[str] = None
    KV_URL: Optional[str] = None
    KV_REST_API_URL: Optional[str] = None
    KV_REST_API_TOKEN: Optional[str] = None
    KV_REST_API_READ_ONLY_TOKEN: Optional[str] = None

    # TODO: Refactor Database/KV/Storage Configuration for Cloudflare Bindings
    # Cloudflare Workers access D1, KV, R2, etc., via bindings defined in wrangler.toml
    # and passed through the execution context/environment, not typically via URLs/keys
    # in environment variables. This section needs revision.
    # Consider how to handle local development vs. production environments.
    # Option 1: Define placeholder fields here and populate them from the env context at runtime.
    # Option 2: Remove these fields and access bindings directly where needed (e.g., in service layers)
    #           passing the 'env' object down.
    # Option 3: Use a dependency injection framework to manage access to bindings.

    # Sentry Configuration
    SENTRY_DSN: Optional[str] = None
    ENABLE_SENTRY: bool = Field(default=False)

    # Application Configuration
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"
    DEBUG: bool = Field(default=False)

    # API Configuration
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # Matching Algorithm Configuration
    MATCH_THRESHOLD: float = 0.7
    LOCATION_WEIGHT: float = 0.3
    INTERESTS_WEIGHT: float = 0.5
    PREFERENCES_WEIGHT: float = 0.2

    @validator("ENABLE_SENTRY", pre=True)
    def set_enable_sentry(cls, v: Any, values: Dict[str, Any]) -> bool:
        """Enable Sentry if DSN is provided and explicitly enabled."""
        if isinstance(v, bool):
            return v and values.get("SENTRY_DSN") is not None
        return values.get("SENTRY_DSN") is not None and str(v).lower() == "true"

    @validator("DEBUG", pre=True)
    def set_debug(cls, v: Any, values: Dict[str, Any]) -> bool:
        """Set debug mode based on environment."""
        if isinstance(v, bool):
            return v
        return values.get("ENVIRONMENT", "").lower() == "development"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True)


# Create a global settings instance
settings = Settings()  # type: ignore


def get_settings() -> Settings:
    """Return the settings instance."""
    return settings
