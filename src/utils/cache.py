"""Redis cache utilities for the MeetMatch bot."""

import json
from typing import Any, Dict, Optional, Type, TypeVar, Union

import redis
from pydantic import BaseModel

from src.config import settings
from src.utils.errors import ConfigurationError
from src.utils.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)


class RedisClient:
    """Singleton class for Redis client."""

    _instance: Optional[redis.Redis] = None

    @classmethod
    def get_client(cls) -> redis.Redis:
        """Get or create a Redis client instance.

        Returns:
            Redis client instance

        Raises:
            ConfigurationError: If connection fails
        """
        if cls._instance is None:
            try:
                # Try to use KV_URL (Upstash Redis) first, fall back to REDIS_URL
                if settings.KV_URL:
                    cls._instance = redis.from_url(settings.KV_URL)
                    logger.info("Upstash Redis client initialized", url="KV_URL")
                elif settings.REDIS_URL:
                    cls._instance = redis.from_url(settings.REDIS_URL)
                    logger.info("Redis client initialized", url=settings.REDIS_URL)
                else:
                    raise ConfigurationError(
                        "No Redis configuration found",
                        details={"message": "Neither KV_URL nor REDIS_URL is configured"},
                    )
            except Exception as e:
                logger.error(
                    "Failed to initialize Redis client",
                    error=str(e),
                )
                raise ConfigurationError(
                    "Failed to connect to Redis",
                    details={"error": str(e)},
                ) from e
        return cls._instance


def set_cache(key: str, value: Union[str, Dict[str, Any], BaseModel], expiration: int = 3600) -> None:
    """Set a value in the Redis cache.

    Args:
        key: Cache key
        value: Value to cache (string, dict, or Pydantic model)
        expiration: Cache expiration time in seconds (default: 1 hour)

    Raises:
        ConfigurationError: If cache operation fails
    """
    client = RedisClient.get_client()
    try:
        # Convert value to string if needed
        if isinstance(value, BaseModel):
            cache_value = value.model_dump_json()
        elif isinstance(value, dict):
            cache_value = json.dumps(value)
        else:
            cache_value = str(value)

        client.set(key, cache_value, ex=expiration)
        logger.debug("Cache set", key=key, expiration=expiration)
    except Exception as e:
        logger.error("Failed to set cache", key=key, error=str(e))
        raise ConfigurationError(
            "Cache operation failed",
            details={"operation": "set", "key": key, "error": str(e)},
        ) from e


def get_cache(key: str) -> Optional[str]:
    """Get a string value from the Redis cache.

    Args:
        key: Cache key

    Returns:
        Cached value or None if not found

    Raises:
        ConfigurationError: If cache operation fails
    """
    client = RedisClient.get_client()
    try:
        value = client.get(key)
        if value:
            return value.decode("utf-8")
        return None
    except Exception as e:
        logger.error("Failed to get cache", key=key, error=str(e))
        raise ConfigurationError(
            "Cache operation failed",
            details={"operation": "get", "key": key, "error": str(e)},
        ) from e


def get_cache_model(key: str, model_class: Type[T]) -> Optional[T]:
    """Get a Pydantic model from the Redis cache.

    Args:
        key: Cache key
        model_class: Pydantic model class

    Returns:
        Pydantic model instance or None if not found

    Raises:
        ConfigurationError: If cache operation fails
    """
    value = get_cache(key)
    if value:
        try:
            return model_class.model_validate_json(value)
        except Exception as e:
            logger.error(
                "Failed to parse cached model",
                key=key,
                model=model_class.__name__,
                error=str(e),
            )
            return None
    return None


def delete_cache(key: str) -> None:
    """Delete a value from the Redis cache.

    Args:
        key: Cache key

    Raises:
        ConfigurationError: If cache operation fails
    """
    client = RedisClient.get_client()
    try:
        client.delete(key)
        logger.debug("Cache deleted", key=key)
    except Exception as e:
        logger.error("Failed to delete cache", key=key, error=str(e))
        raise ConfigurationError(
            "Cache operation failed",
            details={"operation": "delete", "key": key, "error": str(e)},
        ) from e
