import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import CallbackQuery, Message, Update, User
from telegram.ext import ContextTypes

from src.models.user import Preferences


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.handlers.settings",
        "src.services.user_service",
        "src.models.user",
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
def mock_middleware_fix():
    """Mock the middleware module."""
    mock_mod = MagicMock()
    mock_mod.authenticated = lambda func: func
    mock_mod.user_command_limiter = MagicMock(return_value=AsyncMock())

    with patch.dict(sys.modules, {"src.bot.middleware": mock_mod}):
        yield mock_mod


@pytest.fixture
def settings_handler_module(mock_middleware_fix):
    return importlib.import_module("src.bot.handlers.settings")


class MockUser:
    def __init__(self):
        self.id = "12345"
        self.preferences = Preferences()
        self.location = MagicMock()
        self.location.city = "New York"
        self.location.country = "USA"


@pytest.fixture
def mock_user_state():
    return MockUser()


@pytest.fixture
def mock_dependencies(settings_handler_module, mock_user_state):
    """Mock external dependencies."""
    mock_get_user = MagicMock()
    mock_update_user_pref = MagicMock()
    mock_update_user = MagicMock()
    mock_limiter = MagicMock(return_value=AsyncMock())

    mock_get_user.return_value = mock_user_state

    def update_pref_side_effect(user_id, prefs):
        # prefs is a Pydantic model
        # We update the mock user's preferences with the new one
        mock_user_state.preferences = prefs

    mock_update_user_pref.side_effect = update_pref_side_effect

    def update_user_side_effect(user_id, data):
        # data is a dict
        if "preferences" in data:
            # It might be a dict (from model_dump)
            prefs_data = data["preferences"]
            # Update preferences attributes
            if isinstance(prefs_data, dict):
                for k, v in prefs_data.items():
                    setattr(mock_user_state.preferences, k, v)
        if "location" in data:
            loc_data = data["location"]
            if isinstance(loc_data, dict):
                if not mock_user_state.location:
                    mock_user_state.location = MagicMock()
                for k, v in loc_data.items():
                    setattr(mock_user_state.location, k, v)

    mock_update_user.side_effect = update_user_side_effect

    with (
        patch.object(settings_handler_module, "get_user", mock_get_user),
        patch.object(settings_handler_module, "update_user_preferences", mock_update_user_pref),
        patch.object(settings_handler_module, "update_user", mock_update_user),
        patch.object(settings_handler_module, "user_command_limiter", mock_limiter),
    ):
        yield {
            "get_user": mock_get_user,
            "update_user_preferences": mock_update_user_pref,
            "update_user": mock_update_user,
        }


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.effective_user.language_code = "en"

    # Message for command
    update.message = AsyncMock(spec=Message)
    update.message.reply_text = AsyncMock()

    # Callback query for interactions
    update.callback_query = AsyncMock(spec=CallbackQuery)
    update.callback_query.data = None
    update.callback_query.message = AsyncMock(spec=Message)
    update.callback_query.edit_message_text = AsyncMock()
    update.callback_query.answer = AsyncMock()

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}

    return update, context


@pytest.mark.asyncio
async def test_settings_flow(settings_handler_module, mock_dependencies, mock_update_context, mock_user_state):
    """Test the settings flow: Open -> Region -> Select -> Verify."""
    update, context = mock_update_context

    # 1. Open Settings
    await settings_handler_module.settings_command(update, context)

    update.message.reply_text.assert_called()
    assert "Region: Not set" in update.message.reply_text.call_args[0][0]

    # 2. Click Region
    update.callback_query.data = "settings_region"
    await settings_handler_module.settings_callback(update, context)

    update.callback_query.edit_message_text.assert_called()
    assert "Select your region" in update.callback_query.edit_message_text.call_args[0][0]

    # 3. Select Indonesia
    update.callback_query.data = "region_Indonesia"
    await settings_handler_module.settings_callback(update, context)

    # Verify preference updated
    assert mock_user_state.preferences.preferred_country == "Indonesia"

    # Verify success message
    last_call_args = update.callback_query.edit_message_text.call_args[0][0]
    # Since language is not set (mock_user_state default), it should prompt for language
    assert "Region updated to: Indonesia" in last_call_args
    # It might ask for language next
    if not mock_user_state.preferences.preferred_language:
        assert "select your language" in last_call_args


@pytest.mark.asyncio
async def test_language_flow(settings_handler_module, mock_dependencies, mock_update_context, mock_user_state):
    """Test the language settings flow."""
    update, context = mock_update_context

    # 1. Open Settings
    await settings_handler_module.settings_command(update, context)

    # 2. Click Language
    update.callback_query.data = "settings_language"
    await settings_handler_module.settings_callback(update, context)

    assert "Select your language" in update.callback_query.edit_message_text.call_args[0][0]

    # 3. Select Bahasa Indonesia
    update.callback_query.data = "language_id"
    await settings_handler_module.settings_callback(update, context)

    # Verify preference updated
    assert mock_user_state.preferences.preferred_language == "id"

    # Verify success message
    last_call_args = update.callback_query.edit_message_text.call_args[0][0]
    assert "Language updated to: id" in last_call_args


@pytest.mark.asyncio
async def test_settings_message_not_modified_ignored(settings_handler_module, mock_dependencies, mock_update_context):
    """Test that BadRequest 'Message is not modified' is ignored."""
    update, context = mock_update_context

    # Simulate a callback query interaction (e.g. clicking 'Settings' again)
    update.callback_query.data = "settings_menu"
    # Ensure update.message is None so it enters the callback_query block
    update.message = None

    # Mock edit_message_text to raise BadRequest
    from telegram.error import BadRequest

    update.callback_query.edit_message_text.side_effect = BadRequest("Message is not modified")

    # This should not raise an exception
    await settings_handler_module.settings_command(update, context)

    # Verify it tried to edit
    update.callback_query.edit_message_text.assert_called()

    # Verify NO error message sent
    update.callback_query.message.reply_text.assert_not_called()

    # Test that other BadRequests ARE caught and handled (logged + error message)
    update.callback_query.edit_message_text.side_effect = BadRequest("Some other error")

    await settings_handler_module.settings_command(update, context)

    # Verify error message sent (now includes recovery instructions)
    update.callback_query.message.reply_text.assert_called_with(
        "Sorry, something went wrong. Please try /start or /settings again."
    )


@pytest.mark.asyncio
async def test_age_range_flow(settings_handler_module, mock_dependencies, mock_update_context, mock_user_state):
    """Test age range settings flow."""
    update, context = mock_update_context

    # 1. Open Age Range
    update.callback_query.data = "settings_age_range"
    await settings_handler_module.settings_callback(update, context)

    assert "Select minimum and maximum age" in update.callback_query.edit_message_text.call_args[0][0]

    # 2. Select Min Age 20
    update.callback_query.data = "min_age_20"
    await settings_handler_module.settings_callback(update, context)

    assert mock_user_state.preferences.min_age == 20
    assert "Minimum age preference updated to: 20" in update.callback_query.edit_message_text.call_args[0][0]

    # 3. Select Max Age 40
    update.callback_query.data = "max_age_40"
    await settings_handler_module.settings_callback(update, context)

    assert mock_user_state.preferences.max_age == 40
    assert "Maximum age preference updated to: 40" in update.callback_query.edit_message_text.call_args[0][0]


@pytest.mark.asyncio
async def test_distance_flow(settings_handler_module, mock_dependencies, mock_update_context, mock_user_state):
    """Test distance settings flow."""
    update, context = mock_update_context

    # 1. Open Distance
    update.callback_query.data = "settings_max_distance"
    await settings_handler_module.settings_callback(update, context)

    assert "Select maximum distance" in update.callback_query.edit_message_text.call_args[0][0]

    # 2. Select 50km
    update.callback_query.data = "max_distance_50"
    await settings_handler_module.settings_callback(update, context)

    assert mock_user_state.preferences.max_distance == 50
    assert "Maximum distance updated to: 50 km" in update.callback_query.edit_message_text.call_args[0][0]

    # 3. Select Anywhere (1000km)
    update.callback_query.data = "max_distance_1000"
    await settings_handler_module.settings_callback(update, context)

    assert mock_user_state.preferences.max_distance == 1000
    assert "Maximum distance updated to: Anywhere" in update.callback_query.edit_message_text.call_args[0][0]


@pytest.mark.asyncio
async def test_notifications_flow(settings_handler_module, mock_dependencies, mock_update_context, mock_user_state):
    """Test notifications settings flow."""
    update, context = mock_update_context

    # 1. Open Notifications
    update.callback_query.data = "settings_notifications"
    await settings_handler_module.settings_callback(update, context)

    assert "Notification settings" in update.callback_query.edit_message_text.call_args[0][0]

    # 2. Turn Off
    update.callback_query.data = "notifications_off"
    await settings_handler_module.settings_callback(update, context)

    assert mock_user_state.preferences.notifications_enabled is False
    assert "Notifications disabled" in update.callback_query.edit_message_text.call_args[0][0]

    # 3. Turn On
    update.callback_query.data = "notifications_on"
    await settings_handler_module.settings_callback(update, context)

    assert mock_user_state.preferences.notifications_enabled is True
    assert "Notifications enabled" in update.callback_query.edit_message_text.call_args[0][0]


@pytest.mark.asyncio
async def test_reset_settings_flow(settings_handler_module, mock_dependencies, mock_update_context, mock_user_state):
    """Test reset settings flow."""
    update, context = mock_update_context

    # Modify user state to non-default values first
    mock_user_state.preferences.min_age = 30
    mock_user_state.preferences.max_age = 40
    mock_user_state.preferences.max_distance = 100
    mock_user_state.preferences.notifications_enabled = False

    # 1. Click Reset
    update.callback_query.data = "settings_reset"
    await settings_handler_module.settings_callback(update, context)

    # Verify preferences reset to defaults
    # Defaults: min_age=10, max_age=65, max_distance=20, notifications_enabled=True
    assert mock_user_state.preferences.min_age == 10
    assert mock_user_state.preferences.max_age == 65
    assert mock_user_state.preferences.max_distance == 20
    assert mock_user_state.preferences.notifications_enabled is True

    # Verify success message
    assert "Settings reset to defaults" in update.callback_query.edit_message_text.call_args[0][0]


@pytest.mark.asyncio
async def test_premium_command(settings_handler_module, mock_dependencies, mock_update_context, mock_user_state):
    """Test the /premium command."""
    update, context = mock_update_context

    # 1. Test Default Free Tier
    await settings_handler_module.premium_command(update, context)

    update.message.reply_text.assert_called()
    assert "Your current tier: free" in update.message.reply_text.call_args[0][0]

    # 2. Test Admin Tier (mock config)
    # We need to mock the module where ADMIN_IDS is imported from in settings.py
    # or patch the settings object itself if it's imported as an object.
    # In settings.py: from src.config import settings as app_settings

    # Let's try patching the app_settings object inside the function scope if possible,
    # but since it's imported inside the function in settings.py, we might need to mock src.config.settings

    with patch("src.config.settings.ADMIN_IDS", "12345"):
        await settings_handler_module.premium_command(update, context)
        assert "Your current tier: admin" in update.message.reply_text.call_args[0][0]
