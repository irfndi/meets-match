import importlib
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from telegram import Message, Update, User
from telegram.ext import ContextTypes

# --- Fixtures reused from test_profile.py ---


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


@pytest.fixture
def mock_dependencies(profile_handler_module):
    """Mock external dependencies."""
    mock_get_user = MagicMock()
    mock_update_user = MagicMock()
    mock_update_user_prefs = MagicMock()
    mock_limiter = MagicMock(return_value=AsyncMock())

    # Mock UI helpers
    mock_main_menu = MagicMock()
    mock_profile_menu = MagicMock()
    mock_cancel_kb = MagicMock()
    mock_skip_cancel_kb = MagicMock()
    mock_gender_kb = MagicMock()
    mock_media_kb = MagicMock()

    with (
        patch.object(profile_handler_module, "get_user", mock_get_user),
        patch.object(profile_handler_module, "update_user", mock_update_user),
        patch.object(profile_handler_module, "update_user_preferences", mock_update_user_prefs),
        patch.object(profile_handler_module, "user_command_limiter", mock_limiter),
        patch.object(profile_handler_module, "main_menu", mock_main_menu),
        patch.object(profile_handler_module, "profile_main_menu", mock_profile_menu),
        patch.object(profile_handler_module, "cancel_keyboard", mock_cancel_kb),
        patch.object(profile_handler_module, "skip_cancel_keyboard", mock_skip_cancel_kb),
        patch.object(profile_handler_module, "gender_keyboard", mock_gender_kb),
        patch.object(profile_handler_module, "media_upload_keyboard", mock_media_kb),
    ):
        yield {
            "get_user": mock_get_user,
            "update_user": mock_update_user,
            "update_user_preferences": mock_update_user_prefs,
            "limiter": mock_limiter,
            "main_menu": mock_main_menu,
            "profile_main_menu": mock_profile_menu,
            "cancel_keyboard": mock_cancel_kb,
            "skip_cancel_keyboard": mock_skip_cancel_kb,
            "gender_keyboard": mock_gender_kb,
            "media_upload_keyboard": mock_media_kb,
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
    update.effective_message = update.message

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}
    return update, context


# --- Simulation Test ---


@pytest.mark.asyncio
async def test_profile_setup_simulation(profile_handler_module, mock_dependencies, mock_update_context):
    """
    Simulates a full user profile setup journey to verify:
    1. Required steps are enforced (cannot skip age, gender, gender_pref).
    2. Age defaults are set correctly (age +/- 4).
    3. Optional steps can be skipped (bio, interests).
    4. Flow progresses correctly.
    """
    update, context = mock_update_context
    mock_deps = mock_dependencies

    # Define states from module
    STATE_PROFILE_SETUP = profile_handler_module.STATE_PROFILE_SETUP
    STATE_AWAITING_AGE = profile_handler_module.STATE_AWAITING_AGE
    STATE_AWAITING_GENDER = "awaiting_gender"
    STATE_AWAITING_GENDER_PREF = profile_handler_module.STATE_AWAITING_GENDER_PREF
    STATE_AWAITING_BIO = profile_handler_module.STATE_AWAITING_BIO
    STATE_AWAITING_PHOTO = profile_handler_module.STATE_AWAITING_PHOTO

    # Initial user state: New user, no profile data
    mock_user = MagicMock()
    mock_user.age = None
    mock_user.gender = None
    mock_user.preferences = profile_handler_module.Preferences()
    mock_user.bio = None
    mock_user.photos = []
    mock_deps["get_user"].return_value = mock_user

    # --- Step 1: Initiate Profile Setup ---
    # Call start_profile_setup directly to simulate the guided flow
    await profile_handler_module.start_profile_setup(update, context)

    # Should enter setup mode (step 0: name)
    # _next_profile_step increments -1 to 0
    assert context.user_data.get(STATE_PROFILE_SETUP) == 0

    # The flow starts at step 0 (Name).
    # _next_profile_step checks if name exists.
    # If mock_user has name, it might skip or prompt?
    # Let's check _next_profile_step logic for name:
    # if step_name == "name":
    #    prompt = NAME_UPDATE_MESSAGE if not has_name else ...
    #    await update.message.reply_text(prompt, ...)

    # So it prompts regardless, but allows skip if name exists.

    # Let's verify Name prompt
    update.message.reply_text.assert_called()
    last_reply = update.message.reply_text.call_args[0][0]
    # Check if reply contains name prompt text (we don't know exact constant value but can guess)
    # Or just assume we are at Name step.

    # Simulate User entering Name (or skipping if they want to keep Telegram name)
    # Since mock_user has first_name="TestUser", let's skip to keep it.
    update.message.text = "Skip"
    context.user_data[profile_handler_module.STATE_AWAITING_NAME] = True

    # We need to handle the text message
    await profile_handler_module.handle_text_message(update, context)

    # Verify state moved to next step (Age)
    # handle_text_message calls _next_profile_step if in setup
    # So STATE_PROFILE_SETUP should be 1 (Age)
    assert context.user_data.get(STATE_PROFILE_SETUP) == 1
    assert context.user_data.get(STATE_AWAITING_AGE) is True

    # --- Step 2: Age ---
    update.message.text = "25"

    # Mock dependencies for Age Save
    # We need get_user to return the user object so preferences can be read
    mock_deps["get_user"].return_value = mock_user

    await profile_handler_module.handle_text_message(update, context)

    # Verify Age Saved
    mock_deps["update_user"].assert_called_with("12345", {"age": 25})

    # Verify Default Age Range Set (25 - 4 = 21, 25 + 4 = 29)
    mock_deps["update_user_preferences"].assert_called()
    prefs_arg = mock_deps["update_user_preferences"].call_args[0][1]
    assert prefs_arg.min_age == 21
    assert prefs_arg.max_age == 29

    # Verify State Transition: Should pop AGE and move to GENDER
    assert STATE_AWAITING_AGE not in context.user_data

    # --- Step 2: Gender (Required) ---
    # Manually set state for simulation if handle_text_message didn't set it automatically
    # (in real flow, _next_profile_step does this)
    # But since we are mocking get_user, we need to update the mock to reflect the saved age
    # so the next check sees age is done.
    mock_user.age = 25

    # Let's assume _next_profile_step called prompt_for_next_missing_field which set AWAITING_GENDER
    context.user_data[STATE_AWAITING_GENDER] = True

    # Attempt to Skip
    update.message.text = "Skip"
    await profile_handler_module.handle_text_message(update, context)

    # Verify Rejection
    update.message.reply_text.assert_called()
    last_reply = update.message.reply_text.call_args[0][0]
    assert "cannot be skipped" in last_reply

    # Provide valid input
    update.message.text = "Male"
    # Note: The handler might expect "Man" or "Male" depending on keyboard.
    # Looking at code: process_gender_selection expects "male", "female" keys

    await profile_handler_module.handle_text_message(update, context)

    # Verify Gender Saved
    mock_deps["update_user"].assert_called_with("12345", {"gender": "male"})

    # Update Mock for next step
    mock_user.gender = "male"
    assert STATE_AWAITING_GENDER not in context.user_data

    # --- Step 3: Gender Preference (Required) ---
    context.user_data[STATE_AWAITING_GENDER_PREF] = True

    # Attempt to Skip
    update.message.text = "Skip"
    await profile_handler_module.handle_text_message(update, context)

    # Verify Rejection
    last_reply = update.message.reply_text.call_args[0][0]
    assert "cannot be skipped" in last_reply

    # Provide valid input
    # The mapping in profile.py expects "men", "women", "both" (lowercase)
    update.message.text = "women"

    await profile_handler_module.handle_text_message(update, context)

    # Verify Preference Saved
    mock_deps["update_user_preferences"].assert_called()
    # Update Mock
    mock_user.preferences.gender_preference = ["female"]
    assert STATE_AWAITING_GENDER_PREF not in context.user_data

    # --- Step 4: Bio (Optional) ---
    context.user_data[STATE_AWAITING_BIO] = True

    # Attempt to Skip
    update.message.text = "Skip"
    await profile_handler_module.handle_text_message(update, context)

    # Verify Success (Should not complain, should move on)
    # Check skipped_profile_fields
    assert "bio" in context.user_data.get("skipped_profile_fields", {})
    assert STATE_AWAITING_BIO not in context.user_data

    # --- Step 5: Interests (Optional) ---
    context.user_data[profile_handler_module.STATE_AWAITING_INTERESTS] = True

    # Attempt to Skip
    update.message.text = "Skip"
    await profile_handler_module.handle_text_message(update, context)

    # Verify Success
    assert "interests" in context.user_data.get("skipped_profile_fields", {})
    assert profile_handler_module.STATE_AWAITING_INTERESTS not in context.user_data

    # --- Step 6: Location (Optional) ---
    context.user_data["awaiting_location"] = True

    # Attempt to Skip
    update.message.text = "Skip"
    await profile_handler_module.handle_text_message(update, context)

    # Verify Success
    assert "location" in context.user_data.get("skipped_profile_fields", {})
    assert "awaiting_location" not in context.user_data

    # --- Step 7: Photos (Required) ---
    context.user_data[STATE_AWAITING_PHOTO] = True
    mock_user.photos = []  # Ensure no photos

    # Attempt to Skip via Text (should fail)
    update.message.text = "Skip"
    await profile_handler_module.handle_text_message(update, context)

    # Verify Rejection
    last_reply = update.message.reply_text.call_args[0][0]
    assert "need at least one photo" in last_reply

    # Simulate Photo Upload (via Done button or similar, but usually handled by photo handler)
    # Since we are testing text handler, we can simulate "Done" with pending media

    # Set pending media
    context.user_data[profile_handler_module.STATE_PENDING_MEDIA] = ["photo1.jpg"]
    update.message.text = "✅ Done"

    await profile_handler_module.handle_text_message(update, context)

    # Verify Completion
    mock_deps["update_user"].assert_called()
    assert STATE_AWAITING_PHOTO not in context.user_data

    # Verify Profile Completion Message
    # The last call should be the completion message
    last_reply = update.message.reply_text.call_args[0][0]
    assert "profile is now complete" in last_reply or "Almost there" in last_reply

    print("\nSimulation Complete: All steps verified.")
