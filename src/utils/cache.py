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
    _failed: bool = False

    @classmethod
    def get_client(cls) -> Optional[redis.Redis]:
        """Get or create a Redis client instance.

        Returns:
            Redis client instance or None if Redis is not configured

        Raises:
            ConfigurationError: If connection fails after Redis is configured
        """
        if cls._failed:
            return None
            
        if cls._instance is None:
            try:
                if settings.REDIS_URL:
                    cls._instance = redis.from_url(settings.REDIS_URL)
                    logger.info("Redis client initialized", url=settings.REDIS_URL)
                else:
                    logger.warning(
                        "No Redis configuration found, caching will be disabled",
                        details={"message": "REDIS_URL is not configured"},
                    )
                    cls._failed = True
                    return None
            except Exception as e:
                logger.warning(
                    "Failed to initialize Redis client, caching will be disabled",
                    error=str(e),
                )
                cls._failed = True
                return None
        return cls._instance


def set_cache(key: str, value: Union[str, Dict[str, Any], BaseModel], expiration: int = 3600) -> None:
    """Set a value in the Redis cache.

    Args:
        key: Cache key
        value: Value to cache (string, dict, or Pydantic model)
        expiration: Cache expiration time in seconds (default: 1 hour)

    Note:
        Silently skips caching if Redis is not available
    """
    client = RedisClient.get_client()
    if client is None:
        logger.debug("Cache disabled, skipping set operation", key=key)
        return
        
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
        logger.warning("Failed to set cache, continuing without cache", key=key, error=str(e))


def get_cache(key: str) -> Optional[str]:
    """Get a string value from the Redis cache.

    Args:
        key: Cache key

    Returns:
        Cached value or None if not found or Redis is not available
    """
    client = RedisClient.get_client()
    if client is None:
        logger.debug("Cache disabled, skipping get operation", key=key)
        return None
        
    try:
        value = client.get(key)
        if value:
            return value.decode("utf-8")
        return None
    except Exception as e:
        logger.warning("Failed to get cache, continuing without cache", key=key, error=str(e))
        return None


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

    Note:
        Silently skips deletion if Redis is not available
    """
    client = RedisClient.get_client()
    if client is None:
        logger.debug("Cache disabled, skipping delete operation", key=key)
        return
        
    try:
        client.delete(key)
        logger.debug("Cache deleted", key=key)
    except Exception as e:
        logger.warning("Failed to delete cache, continuing without cache", key=key, error=str(e))
