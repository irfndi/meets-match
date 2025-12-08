"""Redis cache utilities for the MeetMatch bot."""

import json
from typing import Any, Dict, Optional, Type, TypeVar, Union

import redis
import sentry_sdk
from pydantic import BaseModel

from src.config import settings
from src.utils.logging import get_logger

logger = get_logger(__name__)

T = TypeVar("T", bound=BaseModel)


class RedisClient:
    """
    Singleton class for Redis client.

    Manages the Redis connection pool and provides a unified access point
    for caching operations.
    """

    _instance: Optional[redis.Redis] = None
    _failed: bool = False

    @classmethod
    def get_client(cls) -> Optional[redis.Redis]:
        """
        Get or create a Redis client instance.

        Initializes a Redis connection pool if one doesn't exist. If configuration
        is missing or connection fails, it marks the client as failed and returns None.

        Returns:
            Optional[redis.Redis]: Redis client instance or None if unavailable.

        Raises:
            ConfigurationError: If connection fails (internally caught).
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
    """
    Set a value in the Redis cache.

    Serializes inputs (strings, dicts, or Pydantic models) to JSON/string before storage.
    Enforces an expiration time.

    Args:
        key (str): Cache key.
        value (Union[str, Dict[str, Any], BaseModel]): Value to cache.
        expiration (int): Cache expiration time in seconds (default: 3600).

    Note:
        Silently skips caching if Redis is not available.
    """
    with sentry_sdk.start_span(op="cache.set", name=key) as span:
        span.set_data("expiration", expiration)

        client = RedisClient.get_client()
        if client is None:
            logger.debug("Cache disabled, skipping set operation", key=key)
            span.set_data("status", "disabled")
            return

        try:
            # Convert value to string if needed
            if isinstance(value, BaseModel):
                cache_value = value.model_dump_json()
                span.set_data("type", "model")
            elif isinstance(value, dict):
                cache_value = json.dumps(value)
                span.set_data("type", "dict")
            else:
                cache_value = str(value)
                span.set_data("type", "str")

            # Enforce expiration
            if expiration <= 0:
                logger.warning("Cache set without expiration, forcing default 1h", key=key)
                expiration = 3600

            client.set(key, cache_value, ex=expiration)
            logger.debug("Cache set", key=key, expiration=expiration)
            span.set_data("status", "success")
        except Exception as e:
            logger.warning("Failed to set cache, continuing without cache", key=key, error=str(e))
            span.set_status("internal_error")
            span.set_data("error", str(e))


def get_cache(key: str, extend_ttl: Optional[int] = None) -> Optional[str]:
    """
    Get a string value from the Redis cache.

    Args:
        key (str): Cache key.
        extend_ttl (Optional[int]): Seconds to extend the TTL if key exists (sliding expiration).

    Returns:
        Optional[str]: Cached value or None if not found or Redis is not available.
    """
    with sentry_sdk.start_span(op="cache.get", name=key) as span:
        client = RedisClient.get_client()
        if client is None:
            span.set_data("status", "disabled")
            return None

        try:
            value: Optional[str] = client.get(key)  # type: ignore
            if value:
                span.set_data("status", "hit")
                if extend_ttl:
                    client.expire(key, extend_ttl)
                    span.set_data("extended_ttl", extend_ttl)
                return value

            span.set_data("status", "miss")
            return None
        except Exception as e:
            logger.warning("Failed to get cache", key=key, error=str(e))
            span.set_status("internal_error")
            span.set_data("error", str(e))
            return None


def get_cache_model(key: str, model_class: Type[T], extend_ttl: Optional[int] = None) -> Optional[T]:
    """
    Get a Pydantic model from the Redis cache.

    Retrieves a JSON string from cache and deserializes it into a Pydantic model.

    Args:
        key (str): Cache key.
        model_class (Type[T]): Pydantic model class to validate against.
        extend_ttl (Optional[int]): Seconds to extend the TTL if key exists.

    Returns:
        Optional[T]: Pydantic model instance or None if not found.

    Raises:
        ConfigurationError: If cache operation fails (internally caught and logged).
    """
    with sentry_sdk.start_span(op="cache.get_model", name=key) as span:
        span.set_data("model", model_class.__name__)

        value = get_cache(key, extend_ttl=extend_ttl)
        if value:
            try:
                model = model_class.model_validate_json(value)
                span.set_data("status", "success")
                return model
            except Exception as e:
                logger.error(
                    "Failed to parse cached model",
                    key=key,
                    model=model_class.__name__,
                    error=str(e),
                )
                span.set_status("data_error")
                span.set_data("error", str(e))
                return None

        span.set_data("status", "miss")
        return None


def delete_pattern(pattern: str) -> int:
    """
    Delete all keys matching a pattern.

    Uses SCAN to safely iterate and delete keys matching the glob pattern.

    Args:
        pattern (str): Redis glob pattern (e.g. "user:*").

    Returns:
        int: Number of keys deleted.
    """
    with sentry_sdk.start_span(op="cache.delete_pattern", name=pattern) as span:
        client = RedisClient.get_client()
        if client is None:
            span.set_data("status", "disabled")
            return 0

        count = 0
        try:
            # Scan for keys to avoid blocking main thread with KEYS
            cursor: Any = "0"
            while True:
                cursor, keys = client.scan(cursor=cursor, match=pattern, count=100)  # type: ignore
                if keys:
                    client.delete(*keys)
                    count += len(keys)

                if str(cursor) == "0":
                    break

            span.set_data("deleted_count", count)
            return count
        except Exception as e:
            logger.warning("Failed to delete pattern", pattern=pattern, error=str(e))
            span.set_status("internal_error")
            span.set_data("error", str(e))
            return count


def delete_cache(key: str) -> None:
    """
    Delete a value from the Redis cache.

    Args:
        key (str): Cache key.

    Note:
        Silently skips deletion if Redis is not available.
    """
    with sentry_sdk.start_span(op="cache.delete", name=key) as span:
        client = RedisClient.get_client()
        if client is None:
            logger.debug("Cache disabled, skipping delete operation", key=key)
            span.set_data("status", "disabled")
            return

        try:
            client.delete(key)
            logger.debug("Cache deleted", key=key)
            span.set_data("status", "success")
        except Exception as e:
            logger.warning("Failed to delete cache, continuing without cache", key=key, error=str(e))
            span.set_status("internal_error")
            span.set_data("error", str(e))
