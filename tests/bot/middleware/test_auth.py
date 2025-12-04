import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, Update, User
from telegram.ext import ContextTypes


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.middleware.auth",
        "src.services.user_service",
        "src.services.matching_service",
        "src.utils.cache",
        "src.utils.database",
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
def auth_middleware_module():
    import src.bot.middleware.auth as module

    importlib.reload(module)
    return module


@pytest.fixture
def mock_dependencies(auth_middleware_module):
    """Mock external dependencies."""
    mock_get_user = MagicMock()
    mock_update_last_active = MagicMock()
    mock_get_potential_matches = MagicMock()
    mock_get_cache = MagicMock()
    mock_update_user = MagicMock()
    mock_wake_user = MagicMock()

    # Patch in the module
    with (
        patch("src.bot.middleware.auth.get_user", mock_get_user),
        patch("src.bot.middleware.auth.update_last_active", mock_update_last_active),
        patch("src.bot.middleware.auth.get_potential_matches", mock_get_potential_matches),
        patch("src.bot.middleware.auth.get_cache", mock_get_cache),
        patch("src.bot.middleware.auth.wake_user", mock_wake_user),
        patch("src.services.user_service.update_user", mock_update_user),
    ):
        yield {
            "get_user": mock_get_user,
            "update_last_active": mock_update_last_active,
            "get_potential_matches": mock_get_potential_matches,
            "get_cache": mock_get_cache,
            "update_user": mock_update_user,
            "wake_user": mock_wake_user,
        }


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.effective_message = AsyncMock(spec=Message)
    update.message = MagicMock(spec=Message)
    update.message.text = "/test"
    update.callback_query = None

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}

    return update, context


@pytest.mark.asyncio
async def test_authenticated_success(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test authenticated decorator success path."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Mock user
    mock_user = MagicMock()
    mock_user.is_sleeping = False  # Not sleeping
    mock_user.preferences.preferred_country = "USA"
    mock_user.preferences.preferred_language = "en"
    mock_deps["get_user"].return_value = mock_user

    # Mock cache hit to avoid warmup
    mock_deps["get_cache"].return_value = True

    # Create a dummy handler
    handler = AsyncMock(return_value="success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    # Run
    result = await decorated_handler(update, context)

    assert result == "success"
    mock_deps["get_user"].assert_called_with("12345")
    mock_deps["update_last_active"].assert_called_with("12345")
    assert context.user_data["user"] == mock_user


@pytest.mark.asyncio
async def test_authenticated_no_user_in_update(auth_middleware_module, mock_update_context):
    """Test authenticated when no user in update."""
    update, context = mock_update_context
    update.effective_user = None

    handler = AsyncMock()
    decorated_handler = auth_middleware_module.authenticated(handler)

    await decorated_handler(update, context)

    handler.assert_not_called()
    update.effective_message.reply_text.assert_called_with("Authentication failed. Please try again.")


@pytest.mark.asyncio
async def test_authenticated_warmup_triggered(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test authenticated triggers cache warmup."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False  # Not sleeping
    mock_user.preferences.preferred_country = "USA"
    mock_user.preferences.preferred_language = "en"
    mock_deps["get_user"].return_value = mock_user

    # Cache miss
    mock_deps["get_cache"].return_value = None

    handler = AsyncMock(return_value="success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    await decorated_handler(update, context)

    # Verify warmup task was created
    assert "warmup_task" in context.user_data


@pytest.mark.asyncio
async def test_authenticated_missing_setup(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test authenticated allows execution even when setup is missing (legacy check removed)."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False  # Not sleeping
    mock_user.preferences = None  # Missing preferences
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    handler = AsyncMock(return_value="success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    result = await decorated_handler(update, context)

    # Should NOT block anymore
    handler.assert_called_once()
    assert result == "success"


@pytest.mark.asyncio
async def test_authenticated_bypass_when_fixing_region(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test authenticated allows bypass when user is fixing region."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False
    mock_user.preferences = None  # Missing preferences (region and language not set)
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    # Set awaiting_region flag - user is in the process of typing their region
    context.user_data["awaiting_region"] = True

    handler = AsyncMock(return_value="success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    result = await decorated_handler(update, context)

    # Should allow the handler to run because user is fixing their region
    assert result == "success"
    handler.assert_called_once()


@pytest.mark.asyncio
async def test_authenticated_bypass_when_fixing_language(
    auth_middleware_module, mock_dependencies, mock_update_context
):
    """Test authenticated allows bypass when user is fixing language."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False
    mock_user.preferences = None  # Missing preferences (region and language not set)
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    # Set awaiting_language flag - user is in the process of typing their language
    context.user_data["awaiting_language"] = True

    handler = AsyncMock(return_value="success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    result = await decorated_handler(update, context)

    # Should allow the handler to run because user is fixing their language
    assert result == "success"
    handler.assert_called_once()


@pytest.mark.asyncio
async def test_authenticated_bypass_for_callback_query(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test authenticated allows callbacks when setup is missing."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False
    mock_user.preferences = None  # Missing preferences
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    # Make this a callback query (not a text message)
    update.callback_query = MagicMock()
    update.callback_query.data = "settings_region"

    handler = AsyncMock(return_value="callback_success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    result = await decorated_handler(update, context)

    # Should allow callback queries to pass through
    assert result == "callback_success"
    handler.assert_called_once()


@pytest.mark.asyncio
async def test_authenticated_bypass_for_start_command(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test authenticated allows /start command when setup is missing."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False
    mock_user.preferences = None  # Missing preferences
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    # Set message to /start command
    update.message.text = "/start"

    handler = AsyncMock(return_value="start_success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    result = await decorated_handler(update, context)

    # Should allow /start command to pass through
    assert result == "start_success"
    handler.assert_called_once()


@pytest.mark.asyncio
async def test_authenticated_bypass_for_settings_command(
    auth_middleware_module, mock_dependencies, mock_update_context
):
    """Test authenticated allows /settings command when setup is missing."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False
    mock_user.preferences = None  # Missing preferences
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    # Set message to /settings command
    update.message.text = "/settings"

    handler = AsyncMock(return_value="settings_success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    result = await decorated_handler(update, context)

    # Should allow /settings command to pass through
    assert result == "settings_success"
    handler.assert_called_once()


@pytest.mark.asyncio
async def test_authenticated_blocks_other_commands_missing_setup(
    auth_middleware_module, mock_dependencies, mock_update_context
):
    """Test authenticated allows other commands when setup is missing (legacy check removed)."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False
    mock_user.preferences = None  # Missing preferences
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    # Set message to /profile command (not in allowed list)
    update.message.text = "/profile"

    handler = AsyncMock(return_value="success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    result = await decorated_handler(update, context)

    # Should NOT block anymore
    handler.assert_called_once()
    assert result == "success"


@pytest.mark.asyncio
async def test_authenticated_missing_region_only(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test authenticated allows execution when only region is missing (legacy check removed)."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False
    mock_user.preferences = MagicMock()
    mock_user.preferences.preferred_country = None  # Missing region
    mock_user.preferences.preferred_language = "en"  # Language is set
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    handler = AsyncMock(return_value="success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    result = await decorated_handler(update, context)

    # Should NOT block anymore
    handler.assert_called_once()
    assert result == "success"


@pytest.mark.asyncio
async def test_authenticated_missing_language_only(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test authenticated allows execution when only language is missing (legacy check removed)."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False
    mock_user.preferences = MagicMock()
    mock_user.preferences.preferred_country = "USA"  # Region is set
    mock_user.preferences.preferred_language = None  # Missing language
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    handler = AsyncMock(return_value="success")
    decorated_handler = auth_middleware_module.authenticated(handler)

    result = await decorated_handler(update, context)

    # Should NOT block anymore
    handler.assert_called_once()
    assert result == "success"


@pytest.mark.asyncio
async def test_authenticated_sleeping_user_wakeup(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test authenticated wakes up sleeping user."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_sleeping_user = MagicMock()
    mock_sleeping_user.is_sleeping = True
    mock_deps["get_user"].return_value = mock_sleeping_user

    mock_awake_user = MagicMock()
    mock_awake_user.is_sleeping = False
    mock_deps["wake_user"].return_value = mock_awake_user

    handler = AsyncMock()
    decorated_handler = auth_middleware_module.authenticated(handler)

    await decorated_handler(update, context)

    # Should call wake_user
    mock_deps["wake_user"].assert_called_with("12345")
    # Should send wake up message
    args, _ = update.effective_message.reply_text.call_args
    assert "Welcome back" in args[0]
    # Handler should NOT be called after wakeup (let them start fresh)
    handler.assert_not_called()
    # User should be stored in context
    assert context.user_data["user"] == mock_awake_user


@pytest.mark.asyncio
async def test_admin_only_success(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test admin_only success."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False  # Not sleeping
    mock_user.preferences.preferred_country = "USA"
    mock_user.preferences.preferred_language = "en"
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    handler = AsyncMock(return_value="admin_success")
    # Decorate with admin_only, providing the user's ID
    decorated_handler = auth_middleware_module.admin_only(admin_ids=["12345"])(handler)

    result = await decorated_handler(update, context)

    assert result == "admin_success"


@pytest.mark.asyncio
async def test_admin_only_fail(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test admin_only fail."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.is_sleeping = False  # Not sleeping
    mock_user.preferences.preferred_country = "USA"
    mock_user.preferences.preferred_language = "en"
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True

    handler = AsyncMock()
    # Decorate with admin_only, NOT providing the user's ID
    decorated_handler = auth_middleware_module.admin_only(admin_ids=["99999"])(handler)

    await decorated_handler(update, context)

    handler.assert_not_called()
    update.effective_message.reply_text.assert_called_with("You don't have permission to perform this action.")


@pytest.mark.asyncio
async def test_profile_required_success(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test profile_required success."""
    update, context = mock_update_context

    # Setup context with user (simulating authenticated decorator running first)
    mock_user = MagicMock()
    mock_user.first_name = "John"
    mock_user.age = 25
    mock_user.is_sleeping = False  # Not sleeping
    mock_user.is_profile_complete = True
    context.user_data["user"] = mock_user

    handler = AsyncMock(return_value="profile_success")
    decorated_handler = auth_middleware_module.profile_required(handler)

    # We mock authenticated to just pass through for this test, or we can just call the wrapper manually?
    # profile_required decorates with @authenticated.
    # To test just profile_required logic, we can inspect the wrapper, but it's nested.
    # Actually, since it's decorated with @authenticated, we need to mock dependencies for that too.

    # Let's rely on the fact that we mocked get_user and we can just let @authenticated run.
    mock_dependencies["get_user"].return_value = mock_user
    mock_dependencies["get_cache"].return_value = True
    mock_user.preferences.preferred_country = "USA"
    mock_user.preferences.preferred_language = "en"

    result = await decorated_handler(update, context)

    assert result == "profile_success"


@pytest.mark.asyncio
async def test_profile_required_fail(auth_middleware_module, mock_dependencies, mock_update_context):
    """Test profile_required fail."""
    update, context = mock_update_context
    mock_deps = mock_dependencies

    mock_user = MagicMock()
    mock_user.first_name = None  # Missing name
    mock_user.age = 25
    mock_user.is_sleeping = False  # Not sleeping

    # Setup for @authenticated
    mock_deps["get_user"].return_value = mock_user
    mock_deps["get_cache"].return_value = True
    mock_user.preferences.preferred_country = "USA"
    mock_user.preferences.preferred_language = "en"

    handler = AsyncMock()
    decorated_handler = auth_middleware_module.profile_required(handler)

    await decorated_handler(update, context)

    handler.assert_not_called()
    args, _ = update.effective_message.reply_text.call_args
    assert "Missing required fields: Name" in args[0]
