import importlib
import sys
from unittest.mock import MagicMock, patch

import pytest
from pydantic import BaseModel

# Do not import from src.utils.cache at top level to avoid mock conflicts with conftest.py


class CacheTestModel(BaseModel):
    id: int
    name: str


@pytest.fixture(autouse=True)
def restore_real_cache_module():
    """Ensure we are testing the real src.utils.cache module, not the mock."""
    # Save current state
    old_module = sys.modules.get("src.utils.cache")

    # Remove mock if present
    if "src.utils.cache" in sys.modules:
        del sys.modules["src.utils.cache"]

    # Import real module
    try:
        import src.utils.cache

        importlib.reload(src.utils.cache)
    except ImportError:
        pass  # Module may not be available in test environment

    yield

    # Restore original state (mock)
    if old_module:
        sys.modules["src.utils.cache"] = old_module
    else:
        # If it wasn't there, remove our real one
        if "src.utils.cache" in sys.modules:
            del sys.modules["src.utils.cache"]


@pytest.fixture
def cache_module():
    """Get the real cache module."""
    import src.utils.cache

    return src.utils.cache


@pytest.fixture
def reset_redis_client(cache_module):
    """Reset the singleton RedisClient."""
    cache_module.RedisClient._instance = None
    cache_module.RedisClient._failed = False
    yield
    cache_module.RedisClient._instance = None
    cache_module.RedisClient._failed = False


def test_get_client_success(cache_module, reset_redis_client):
    with (
        patch.object(cache_module.redis, "Redis") as mock_redis_cls,
        patch.object(cache_module.redis, "ConnectionPool") as mock_pool,
        patch.object(cache_module, "settings") as mock_settings,
    ):
        mock_settings.REDIS_URL = "redis://localhost:6379/0"

        client = cache_module.RedisClient.get_client()

        assert client is not None
        mock_pool.from_url.assert_called_once()
        mock_redis_cls.assert_called_once()


def test_get_client_no_url(cache_module, reset_redis_client):
    with patch.object(cache_module, "settings") as mock_settings:
        mock_settings.REDIS_URL = None

        client = cache_module.RedisClient.get_client()

        assert client is None
        assert cache_module.RedisClient._failed is True


def test_get_client_exception(cache_module, reset_redis_client):
    with (
        patch.object(cache_module.redis, "ConnectionPool") as mock_pool,
        patch.object(cache_module, "settings") as mock_settings,
    ):
        mock_settings.REDIS_URL = "redis://localhost:6379/0"
        mock_pool.from_url.side_effect = Exception("Connection failed")

        client = cache_module.RedisClient.get_client()

        assert client is None
        assert cache_module.RedisClient._failed is True


def test_set_cache(cache_module):
    with patch.object(cache_module.RedisClient, "get_client") as mock_get_client:
        mock_redis = MagicMock()
        mock_get_client.return_value = mock_redis

        # Test string
        cache_module.set_cache("key1", "value1")
        mock_redis.set.assert_called_with("key1", "value1", ex=3600)

        # Test dict
        cache_module.set_cache("key2", {"a": 1})
        mock_redis.set.assert_called_with("key2", '{"a": 1}', ex=3600)

        # Test Pydantic model
        model = CacheTestModel(id=1, name="test")
        cache_module.set_cache("key3", model)
        mock_redis.set.assert_called_with("key3", model.model_dump_json(), ex=3600)


def test_set_cache_no_client(cache_module):
    with patch.object(cache_module.RedisClient, "get_client") as mock_get_client:
        mock_get_client.return_value = None
        # Should not raise
        cache_module.set_cache("key", "value")


def test_get_cache(cache_module):
    with patch.object(cache_module.RedisClient, "get_client") as mock_get_client:
        mock_redis = MagicMock()
        mock_get_client.return_value = mock_redis

        # Test miss
        mock_redis.get.return_value = None
        assert cache_module.get_cache("key") is None

        # Test hit string
        mock_redis.get.return_value = "value"
        assert cache_module.get_cache("key") == "value"


def test_get_cache_model(cache_module):
    with patch.object(cache_module.RedisClient, "get_client") as mock_get_client:
        mock_redis = MagicMock()
        mock_get_client.return_value = mock_redis

        # Test hit Pydantic model
        mock_redis.get.return_value = '{"id": 1, "name": "test"}'
        result = cache_module.get_cache_model("key", CacheTestModel)
        assert isinstance(result, CacheTestModel)
        assert result.id == 1
        assert result.name == "test"

        # Test parse error
        mock_redis.get.return_value = "invalid json"
        assert cache_module.get_cache_model("key", CacheTestModel) is None


def test_delete_cache(cache_module):
    with patch.object(cache_module.RedisClient, "get_client") as mock_get_client:
        mock_redis = MagicMock()
        mock_get_client.return_value = mock_redis

        cache_module.delete_cache("key")
        mock_redis.delete.assert_called_with("key")


def test_delete_pattern(cache_module):
    with patch.object(cache_module.RedisClient, "get_client") as mock_get_client:
        mock_redis = MagicMock()
        mock_get_client.return_value = mock_redis

        # Mock scan to return keys then empty cursor
        # scan returns (cursor, [keys])
        mock_redis.scan.side_effect = [(1, ["key1", "key2"]), (0, ["key3"])]

        count = cache_module.delete_pattern("match:*")

        assert count == 3
        assert mock_redis.delete.call_count == 2
