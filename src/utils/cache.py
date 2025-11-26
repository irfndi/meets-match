"""Redis cache utilities for the MeetMatch bot."""

import json
from typing import Any, Dict, Optional, Type, TypeVar, Union

import redis
from pydantic import BaseModel

from src.config import settings
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
                    # Optimize connection pool
                    pool = redis.ConnectionPool.from_url(
                        settings.REDIS_URL,
                        max_connections=10,
                        decode_responses=True,  # Automatically decode bytes to strings
                    )
                    cls._instance = redis.Redis(connection_pool=pool)
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
        expiration: Cache expiration time in seconds (default: 1 hour).
                   MUST be provided to prevent indefinite memory usage.

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

        # Enforce expiration
        if expiration <= 0:
            logger.warning("Cache set without expiration, forcing default 1h", key=key)
            expiration = 3600

        client.set(key, cache_value, ex=expiration)
        logger.debug("Cache set", key=key, expiration=expiration)
    except Exception as e:
        logger.warning("Failed to set cache, continuing without cache", key=key, error=str(e))


def get_cache(key: str, extend_ttl: Optional[int] = None) -> Optional[str]:
    """Get a string value from the Redis cache.

    Args:
        key: Cache key
        extend_ttl: Optional seconds to extend the TTL if key exists (sliding expiration)

    Returns:
        Cached value or None if not found or Redis is not available
    """
    client = RedisClient.get_client()
    if client is None:
        return None

    try:
        value = client.get(key)
        if value and extend_ttl:
            client.expire(key, extend_ttl)
        return value
    except Exception as e:
        logger.warning("Failed to get cache", key=key, error=str(e))
        return None


def get_cache_model(key: str, model_class: Type[T], extend_ttl: Optional[int] = None) -> Optional[T]:
    """Get a Pydantic model from the Redis cache.

    Args:
        key: Cache key
        model_class: Pydantic model class
        extend_ttl: Optional seconds to extend the TTL if key exists (sliding expiration)

    Returns:
        Pydantic model instance or None if not found

    Raises:
        ConfigurationError: If cache operation fails
    """
    value = get_cache(key, extend_ttl=extend_ttl)
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


def delete_pattern(pattern: str) -> int:
    """Delete all keys matching a pattern.

    Args:
        pattern: Redis glob pattern (e.g. "user:*")

    Returns:
        Number of keys deleted
    """
    client = RedisClient.get_client()
    if client is None:
        return 0

    count = 0
    try:
        # Scan for keys to avoid blocking main thread with KEYS
        cursor = "0"
        while cursor != 0:
            cursor, keys = client.scan(cursor=cursor, match=pattern, count=100)
            if keys:
                client.delete(*keys)
                count += len(keys)
    except Exception as e:
        logger.warning("Failed to delete pattern", pattern=pattern, error=str(e))

    return count


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
