import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, Update, User
from telegram.ext import ContextTypes

from src.models.user import Gender


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.bot.handlers.profile",
        "src.services.user_service",
        "src.models.user",
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
def mock_middleware_fix():
    """Mock the middleware module to provide a pass-through authenticated decorator."""
    mock_mod = MagicMock()

    def pass_through(func):
        return func

    mock_mod.authenticated = pass_through
    mock_mod.user_command_limiter = MagicMock(return_value=AsyncMock())

    with patch.dict(sys.modules, {"src.bot.middleware": mock_mod}):
        yield mock_mod


@pytest.fixture
def profile_handler_module(mock_middleware_fix):
    return importlib.import_module("src.bot.handlers.profile")


class MockUser:
    def __init__(self):
        self.id = "12345"
        self.first_name = None
        self.age = None
        self.gender = None
        self.bio = None
        self.interests = []
        self.location = None
        self.is_profile_complete = False


@pytest.fixture
def mock_user_state():
    return MockUser()


@pytest.fixture
def mock_dependencies(profile_handler_module, mock_user_state):
    """Mock external dependencies."""
    mock_get_user = MagicMock()
    mock_update_user = MagicMock()
    mock_limiter = MagicMock(return_value=AsyncMock())

    # Mock UI helpers
    mock_main_menu = MagicMock()
    mock_profile_menu = MagicMock()
    mock_cancel_kb = MagicMock()
    mock_skip_cancel_kb = MagicMock()
    mock_gender_kb = MagicMock()
    mock_location_kb = MagicMock()
    mock_location_opt_kb = MagicMock()
    mock_skip_kb = MagicMock()

    # Setup get_user to return our mock state
    mock_get_user.return_value = mock_user_state

    # Setup update_user to update our mock state
    def update_side_effect(user_id, data):
        print(f"DEBUG: update_user called with {data}")
        for k, v in data.items():
            if k.startswith("location_"):
                if not mock_user_state.location:
                    mock_user_state.location = MagicMock()
                # strip location_ prefix
                attr = k.replace("location_", "")
                setattr(mock_user_state.location, attr, v)
            else:
                setattr(mock_user_state, k, v)

    mock_update_user.side_effect = update_side_effect

    with (
        patch.object(profile_handler_module, "get_user", mock_get_user),
        patch.object(profile_handler_module, "update_user", mock_update_user),
        patch.object(profile_handler_module, "user_command_limiter", mock_limiter),
        patch.object(profile_handler_module, "main_menu", mock_main_menu),
        patch.object(profile_handler_module, "profile_main_menu", mock_profile_menu),
        patch.object(profile_handler_module, "cancel_keyboard", mock_cancel_kb),
        patch.object(profile_handler_module, "skip_cancel_keyboard", mock_skip_cancel_kb),
        patch.object(profile_handler_module, "gender_keyboard", mock_gender_kb),
        patch.object(profile_handler_module, "location_keyboard", mock_location_kb),
        patch.object(profile_handler_module, "location_optional_keyboard", mock_location_opt_kb),
        patch.object(profile_handler_module, "skip_keyboard", mock_skip_kb),
        patch.object(profile_handler_module, "get_user_location_text", return_value=None),
        patch("src.bot.handlers.profile.geocode_city", new_callable=AsyncMock) as mock_geocode,
    ):
        yield {
            "get_user": mock_get_user,
            "update_user": mock_update_user,
            "limiter": mock_limiter,
            "geocode": mock_geocode,
        }


@pytest.fixture
def mock_update_context():
    """Create mock update and context."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User)
    update.effective_user.id = 12345
    update.message = AsyncMock(spec=Message)
    update.message.text = "/profile"
    update.message.reply_text = AsyncMock()

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}

    return update, context


@pytest.mark.asyncio
async def test_full_profile_creation_flow(
    profile_handler_module, mock_dependencies, mock_update_context, mock_user_state
):
    """Test the complete profile creation flow."""
    update, context = mock_update_context

    # 1. Start Profile Setup
    await profile_handler_module.start_profile_setup(update, context)

    # Verify we are in name step
    assert context.user_data["profile_setup_step"] == 0
    assert context.user_data["awaiting_name"] is True
    update.message.reply_text.assert_called()
    assert "Let's set up your profile" in update.message.reply_text.call_args_list[-2][0][0]

    # 2. Provide Name
    update.message.text = "John"
    await profile_handler_module.name_command(update, context)
    # Wait, name_command is /name. We should use handle_text_message or name_command if it handles text.
    # name_command checks if text != /name. So if we pass "John" (without /name prefix handling),
    # wait, name_command logic: if text != "/name": name = text[5:].
    # Actually, handle_text_message calls _save_name logic? No, handle_text_message calls update_user for specific fields?
    # Let's check handle_text_message again. It handles states.

    # Since we are in STATE_AWAITING_NAME, we should call handle_text_message
    await profile_handler_module.handle_text_message(update, context)

    # Verify name updated
    assert mock_user_state.first_name == "John"
    # Verify moved to Age step
    assert context.user_data["profile_setup_step"] == 1
    assert context.user_data["awaiting_age"] is True
    assert "How old are you" in update.message.reply_text.call_args[0][0]

    # 3. Provide Age
    update.message.text = "25"
    await profile_handler_module.handle_text_message(update, context)

    # Verify age updated
    assert mock_user_state.age == 25
    # Verify moved to Gender step
    assert context.user_data["profile_setup_step"] == 2
    assert "Please select your gender" in update.message.reply_text.call_args[0][0]

    # 4. Provide Gender
    # Gender is handled by gender_selection or handle_text_message(skip).
    # If we provide "Male", and we are in setup flow.
    # Note: gender_selection handler is usually triggered by Regex.
    # We'll call gender_selection directly.
    # But wait, we need to set awaiting_gender?
    # _next_profile_step does NOT set awaiting_gender?
    # Let's check _next_profile_step implementation for gender step.
    # It calls gender_command? No, it sends message.
    # Ah, I need to check if _next_profile_step sets 'awaiting_gender'.
    # In the code:
    # if step_name == "gender": ...
    # It calls gender_command(update, context) ? No.
    # It sends GENDER_UPDATE_MESSAGE.
    # Does it set context.user_data["awaiting_gender"] = True?
    # I suspect it does, or gender_selection checks something else.
    # Looking at gender_selection: if not context.user_data.get("awaiting_gender"): return.

    # So _next_profile_step MUST set awaiting_gender.
    # I'll assume it does (or I'll find out it fails).

    # Manually ensure awaiting_gender is set because I can't see the full code of _next_profile_step in one go.
    # But based on flow, it should.

    update.message.text = "Male"
    # We need to ensure 'awaiting_gender' is set.
    # Let's check if the previous step set it.
    # It's safer to set it if my assumption is wrong, but let's try to trust the code.
    # If it fails, I'll know.

    # Actually, gender_selection is for the keyboard buttons.
    await profile_handler_module.process_gender_selection(update, context, "Male")

    # Verify gender updated
    assert mock_user_state.gender == Gender.MALE.value
    # Verify moved to Bio step
    assert context.user_data["profile_setup_step"] == 3
    assert context.user_data["awaiting_bio"] is True
    assert "Tell us a bit about yourself" in update.message.reply_text.call_args[0][0]

    # 5. Provide Bio
    update.message.text = "I love coding"
    await profile_handler_module.handle_text_message(update, context)

    # Verify bio updated
    assert mock_user_state.bio == "I love coding"
    # Verify moved to Interests step
    assert context.user_data["profile_setup_step"] == 4
    assert context.user_data["awaiting_interests"] is True
    assert "What are your interests" in update.message.reply_text.call_args[0][0]

    # 6. Provide Interests
    update.message.text = "Coding, AI, Music"
    await profile_handler_module.handle_text_message(update, context)

    # Verify interests updated
    assert mock_user_state.interests == ["Coding", "AI", "Music"]
    # Verify moved to Location step
    assert context.user_data["profile_setup_step"] == 5
    assert context.user_data["awaiting_location"] is True
    assert "Where are you located" in update.message.reply_text.call_args[0][0]

    # 7. Provide Location (City)
    update.message.text = "New York, USA"
    # Mock geocode result
    mock_dependencies["geocode"].return_value = {
        "latitude": 40.7128,
        "longitude": -74.0060,
        "city": "New York",
        "country": "USA",
    }

    await profile_handler_module.handle_text_message(update, context)

    # Verify location updated
    assert mock_user_state.location.city == "New York"

    # Verify Profile Complete
    # The flow should end, cleanup state
    assert "profile_setup_step" not in context.user_data

    # Verify success message
    assert "Great! Your profile is now complete" in update.message.reply_text.call_args[0][0]


@pytest.mark.asyncio
async def test_adhoc_update_flow(profile_handler_module, mock_dependencies, mock_update_context, mock_user_state):
    """Test updating a single field (ad-hoc)."""
    update, context = mock_update_context

    # Setup user with existing name
    mock_user_state.first_name = "Old Name"

    # 1. Trigger /name
    update.message.text = "/name"
    await profile_handler_module.name_command(update, context)

    assert context.user_data["awaiting_name"] is True

    # 2. Provide New Name
    update.message.text = "New Name"
    await profile_handler_module.handle_text_message(update, context)

    assert mock_user_state.first_name == "New Name"
    assert "awaiting_name" not in context.user_data

    # Should show update message
    found = False
    for call in update.message.reply_text.call_args_list:
        args, _ = call
        if "Name updated to: New Name" in args[0]:
            found = True
            break
    assert found, "Did not find success message in bot replies"


@pytest.mark.asyncio
async def test_profile_creation_failures(
    profile_handler_module, mock_dependencies, mock_update_context, mock_user_state
):
    """Test invalid inputs during profile creation."""
    update, context = mock_update_context

    # 1. Invalid Age
    context.user_data["awaiting_age"] = True
    update.message.text = "not a number"

    await profile_handler_module.handle_text_message(update, context)

    # Verify still in age step
    assert context.user_data["awaiting_age"] is True
    # Verify error message
    # Actual message might vary, let's check for "valid number"
    args = update.message.reply_text.call_args[0][0]
    assert "valid number" in args

    # 2. Invalid Age Range (too young/old)
    update.message.text = "5"
    await profile_handler_module.handle_text_message(update, context)
    assert context.user_data["awaiting_age"] is True
    assert "between 10 and 65" in update.message.reply_text.call_args[0][0]

    # 3. Invalid Location (Geocode fails)
    context.user_data.pop("awaiting_age", None)
    context.user_data["awaiting_location"] = True
    update.message.text = "Unknown City, Nowhere"

    # Mock geocode failure
    mock_dependencies["geocode"].return_value = None

    await profile_handler_module.handle_text_message(update, context)

    # Verify still in location step
    assert context.user_data["awaiting_location"] is True
    # Verify error message
    assert "couldn't find that city" in update.message.reply_text.call_args[0][0]
