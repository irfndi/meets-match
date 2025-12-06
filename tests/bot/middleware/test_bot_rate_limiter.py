import importlib
import sys
import time
from unittest.mock import MagicMock, patch

import pytest
from telegram import Message, Update, User
from telegram.ext import ContextTypes


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.middleware",
        "src.bot.middleware.rate_limiter",
        "src.utils.cache",
        "src.utils.errors",
    ]

    original_modules = {}
    for module_name in modules_to_restore:
        if module_name in sys.modules:
            original_modules[module_name] = sys.modules[module_name]
            del sys.modules[module_name]

    yield

    for module_name, module in original_modules.items():
        sys.modules[module_name] = module


@pytest.fixture
def rate_limiter_module():
    # Force import to ensure we get the module, not the function from __init__
    return importlib.import_module("src.bot.middleware.rate_limiter")


@pytest.fixture
def mock_cache(rate_limiter_module):
    """Mock cache functions."""
    mock_get = MagicMock()
    mock_set = MagicMock()

    # We need to patch the functions in the loaded module
    with (
        patch.object(rate_limiter_module, "get_cache", mock_get),
        patch.object(rate_limiter_module, "set_cache", mock_set),
    ):
        yield {"get": mock_get, "set": mock_set}


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.message = MagicMock(spec=Message)
    update.message.text = "/test"

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)

    return update, context


@pytest.mark.asyncio
async def test_rate_limiter_success(rate_limiter_module, mock_cache, mock_update_context):
    """Test rate limiter allows requests under limit."""
    update, context = mock_update_context
    mock_cache["get"].return_value = None  # No previous requests

    await rate_limiter_module.rate_limiter(update, context, limit=5, window=60)

    mock_cache["set"].assert_called_once()
    args, _ = mock_cache["set"].call_args
    # Verify timestamp was set
    assert len(args[1].split(",")) == 1


@pytest.mark.asyncio
async def test_rate_limiter_exceeded(rate_limiter_module, mock_cache, mock_update_context):
    """Test rate limiter raises error when limit exceeded."""
    from src.utils.errors import RateLimitError

    update, context = mock_update_context

    # Mock existing requests
    now = time.time()
    timestamps = [str(now - i) for i in range(5)]  # 5 requests just happened
    mock_cache["get"].return_value = ",".join(timestamps)

    with pytest.raises(RateLimitError):
        await rate_limiter_module.rate_limiter(update, context, limit=5, window=60)

    # Should not set new cache if exceeded
    mock_cache["set"].assert_not_called()


@pytest.mark.asyncio
async def test_rate_limiter_window_expiry(rate_limiter_module, mock_cache, mock_update_context):
    """Test old requests are ignored."""
    update, context = mock_update_context

    now = time.time()
    # 5 requests, but all old (> 60s ago)
    timestamps = [str(now - 100 - i) for i in range(5)]
    mock_cache["get"].return_value = ",".join(timestamps)

    await rate_limiter_module.rate_limiter(update, context, limit=5, window=60)

    # Should succeed and set only 1 timestamp (the current one)
    mock_cache["set"].assert_called_once()
    args, _ = mock_cache["set"].call_args
    assert len(args[1].split(",")) == 1


@pytest.mark.asyncio
async def test_user_command_limiter(rate_limiter_module, mock_cache, mock_update_context):
    """Test user_command_limiter wrapper."""
    update, context = mock_update_context
    mock_cache["get"].return_value = None

    limiter = rate_limiter_module.user_command_limiter(limit=5, window=60)
    await limiter(update, context)

    # Verify key structure
    args, _ = mock_cache["get"].call_args
    assert "user:12345:command:/test" in args[0]


@pytest.mark.asyncio
async def test_global_user_limiter(rate_limiter_module, mock_cache, mock_update_context):
    """Test global_user_limiter wrapper."""
    update, context = mock_update_context
    mock_cache["get"].return_value = None

    limiter = rate_limiter_module.global_user_limiter(limit=30, window=60)
    await limiter(update, context)

    # Verify key structure
    args, _ = mock_cache["get"].call_args
    assert "user:12345:global" in args[0]
