"""Profile management handlers for the MeetMatch bot."""

import time
from typing import Any, List, Union, cast

from telegram import (
    ForceReply,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InputMediaPhoto,
    InputMediaVideo,
    Message,
    PhotoSize,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    Update,
    Video,
)
from telegram.ext import ContextTypes

from src.bot.handlers.match import match_command
from src.bot.handlers.settings import settings_command
from src.bot.media_sender import send_media_group_safe
from src.bot.middleware import authenticated, user_command_limiter
from src.bot.ui.keyboards import (
    cancel_keyboard,
    gender_keyboard,
    gender_optional_keyboard,
    gender_preference_required_keyboard,
    location_keyboard,
    location_optional_keyboard,
    main_menu,
    media_upload_keyboard,
    profile_main_menu,
    skip_cancel_keyboard,
    skip_keyboard,
)
from src.config import get_settings
from src.models.user import Gender, Preferences, User
from src.services.geocoding_service import geocode_city, reverse_geocode_coordinates
from src.services.user_service import get_user, get_user_location_text, update_user, update_user_preferences
from src.utils.cache import delete_cache, set_cache
from src.utils.logging import get_logger
from src.utils.media import delete_media, get_storage_path, save_media
from src.utils.security import sanitize_html
from src.utils.validators import media_validator

logger = get_logger(__name__)

USER_EDITING_STATE_KEY = "user:editing:{user_id}"


def set_user_editing_state(user_id: str, is_editing: bool) -> None:
    """
    Set the user's editing state in Redis.

    This state is used to prevent sending notifications (like match alerts)
    while the user is actively editing their profile.

    Args:
        user_id (str): The user ID.
        is_editing (bool): True if user is editing, False otherwise.
    """
    key = USER_EDITING_STATE_KEY.format(user_id=user_id)
    if is_editing:
        # Set with 1 hour expiration in case they abandon the session
        set_cache(key, "1", expiration=3600)
    else:
        delete_cache(key)


# Profile command messages
PROFILE_COMPLETE_MESSAGE = """
✅ Your profile is complete! Here's how you appear to others:

👤 Name: {name}
🎂 Age: {age}
⚧ Gender: {gender}
📝 Bio: {bio}
🌟 Interests: {interests}
📍 Location: {location}

You can update any part of your profile using:
/name, /age, /gender, /bio, /interests, /location

Ready to start matching? Use /match
"""

PROFILE_INCOMPLETE_MESSAGE = """
Your profile is incomplete. Please complete the following:

{missing_fields}

Use the commands above to complete your profile.
"""

PROFILE_MENU_MESSAGE = """
1. View profiles.
2. Edit my profile.
3. Change my photo/video.
4. Change profile text.
"""

# Field update messages (conversational prompts)
NAME_UPDATE_MESSAGE = "What's your name? Just type it below:"
AGE_UPDATE_MESSAGE = "How old are you? (must be between 10-65)"
GENDER_UPDATE_MESSAGE = "Please select your gender:"
GENDER_PREF_UPDATE_MESSAGE = "Please select your gender preference:"
BIO_UPDATE_MESSAGE = "Tell us a bit about yourself (max 300 characters):"
INTERESTS_UPDATE_MESSAGE = "What are your interests? List them separated by commas (e.g., music, travel, cooking):"
LOCATION_UPDATE_MESSAGE = (
    "Where are you located? Share your location or type 'City, Country' (e.g., 'Berlin, Germany'):"
)

# Conversation state keys
STATE_AWAITING_NAME = "awaiting_name"
STATE_AWAITING_AGE = "awaiting_age"
STATE_AWAITING_BIO = "awaiting_bio"
STATE_AWAITING_INTERESTS = "awaiting_interests"
STATE_AWAITING_GENDER_PREF = "awaiting_gender_preference"
STATE_PROFILE_SETUP = "profile_setup_step"
STATE_PROFILE_MENU = "profile_menu"
STATE_AWAITING_PHOTO = "awaiting_photo"
STATE_PENDING_MEDIA = "pending_media"  # List of media paths being uploaded in current session

# Confirmation messages
NAME_UPDATED_MESSAGE = "✅ Name updated to: {name}"
AGE_UPDATED_MESSAGE = "✅ Age updated to: {age}"
GENDER_UPDATED_MESSAGE = "✅ Gender updated to: {gender}"
GENDER_PREF_UPDATED_MESSAGE = "✅ Preference updated"
BIO_UPDATED_MESSAGE = "✅ Bio updated"
INTERESTS_UPDATED_MESSAGE = "✅ Interests updated"
LOCATION_UPDATED_MESSAGE = "✅ Location updated to: {location}"

# Required fields for profile completion (users cannot match without these)
REQUIRED_FIELDS = ["name", "age", "gender", "gender_preference", "photos"]
# Recommended fields for better matching
RECOMMENDED_FIELDS = ["bio", "interests", "location"]


def get_missing_required_fields(user: User) -> list[str]:
    """
    Get list of missing required fields for a user.

    Args:
        user (User): The user object.

    Returns:
        list[str]: List of missing required field names.
    """
    missing = []
    if not user.first_name:
        missing.append("name")
    if not user.age:
        missing.append("age")
    if not user.gender:
        missing.append("gender")
    prefs = getattr(user, "preferences", None)
    gp = getattr(prefs, "gender_preference", None) if prefs is not None else None
    if not gp:
        missing.append("gender_preference")
    if not user.photos or len(user.photos) < 1:
        missing.append("photos")
    return missing


def get_missing_recommended_fields(user: User) -> list[str]:
    """
    Get list of missing recommended fields for a user.

    Args:
        user (User): The user object.

    Returns:
        list[str]: List of missing recommended field names.
    """
    missing = []
    if not user.bio:
        missing.append("bio")
    if not getattr(user, "interests", None) or len(user.interests) == 0:
        missing.append("interests")
    if not user.location or not user.location.city:
        missing.append("location")
    prefs = getattr(user, "preferences", None)
    gp = getattr(prefs, "gender_preference", None) if prefs is not None else None
    if not gp:
        missing.append("gender_preference")
    return missing


def check_and_update_profile_complete(user_id: str, context: ContextTypes.DEFAULT_TYPE | None = None) -> bool:
    """
    Check if profile is complete and update the flag if needed.

    Profile is considered complete when all REQUIRED fields are filled.
    Recommended fields are optional and don't block matching.
    If context is provided, also refreshes context.user_data["user"].

    Args:
        user_id (str): The user ID.
        context (ContextTypes.DEFAULT_TYPE | None): The callback context.

    Returns:
        bool: True if profile is now complete.
    """
    user = get_user(user_id)
    missing_required = get_missing_required_fields(user)

    is_complete = len(missing_required) == 0

    if is_complete and not user.is_profile_complete:
        update_user(user_id, {"is_profile_complete": True})
        user = get_user(user_id)
        if context and context.user_data is not None:
            context.user_data["user"] = user
        return True
    elif not is_complete and user.is_profile_complete:
        update_user(user_id, {"is_profile_complete": False})
        user = get_user(user_id)
        if context and context.user_data is not None:
            context.user_data["user"] = user
    elif context and context.user_data is not None:
        context.user_data["user"] = user

    return is_complete


STATE_ADHOC_CONTINUE = "adhoc_continue_profile"


def _get_chat_id_from_update(update: Update) -> int | None:
    """
    Extract chat_id from an update, trying multiple sources.

    This handles the case where effective_message is None (e.g., callback queries
    with inaccessible messages).

    Args:
        update (Update): The update object.

    Returns:
        int | None: Chat ID if found, None otherwise.
    """
    if update.effective_chat:
        return update.effective_chat.id
    if update.effective_user:
        # For private chats, user_id == chat_id
        return update.effective_user.id
    if update.callback_query and update.callback_query.message and update.callback_query.message.chat:
        return update.callback_query.message.chat.id
    return None


async def _send_message_safe(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    text: str,
    reply_markup: InlineKeyboardMarkup | ReplyKeyboardMarkup | ReplyKeyboardRemove | ForceReply | None = None,
) -> bool:
    """
    Send a message safely, handling both message and callback query contexts.

    Tries update.effective_message.reply_text() first, then falls back to
    context.bot.send_message() using the effective chat/user ID.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
        text (str): Text content to send.
        reply_markup (Optional[Union[InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove, ForceReply]]): Optional keyboard markup.

    Returns:
        bool: True if message was sent successfully, False otherwise.
    """
    # Try effective_message first
    if update.effective_message:
        await update.effective_message.reply_text(text, reply_markup=reply_markup)
        return True

    # Fallback: try to get chat_id from various sources
    chat_id = _get_chat_id_from_update(update)

    if chat_id:
        await context.bot.send_message(chat_id=chat_id, text=text, reply_markup=reply_markup)
        return True

    logger.error("Could not send message: no effective_message, effective_chat, or effective_user")
    return False


async def prompt_for_next_missing_field(
    update: Update, context: ContextTypes.DEFAULT_TYPE, user_id: str, silent_if_complete: bool = False
) -> bool:
    """
    Prompt user for the next missing required or recommended field (ad-hoc mode).

    Checks for missing fields and prompts the user to fill them. Honors cooldown periods for skipped fields.
    This is for single field edits, NOT the guided setup flow.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
        user_id (str): The user ID.
        silent_if_complete (bool): If True, don't send "Profile complete" message when returning False.

    Returns:
        bool: True if there was a missing field to prompt for, False if profile is complete (or cooldown active).
    """
    if context.user_data is None:
        logger.error("context.user_data is None in prompt_for_next_missing_field")
        return False

    # Get a reliable way to send messages (handles both message and callback contexts)
    # We check this early and fail fast if we can't send messages
    can_send = update.effective_message or _get_chat_id_from_update(update) is not None

    if not can_send:
        logger.error("Cannot send messages: no effective_message, effective_chat, or effective_user")
        return False

    user = get_user(user_id)
    missing_required = get_missing_required_fields(user)
    missing_recommended = get_missing_recommended_fields(user)
    # Handle skipped fields with "casual" reminder logic (cooldown)
    skipped_data = context.user_data.get("skipped_profile_fields", {})

    # Migration: If it's a list (legacy), convert to dict with current time
    if isinstance(skipped_data, list):
        skipped_data = {f: time.time() for f in skipped_data}
        context.user_data["skipped_profile_fields"] = skipped_data

    # Filter skipped fields based on cooldown (e.g., 1 day)
    # If skipped recently (< 1 day), suppress prompt.
    # If skipped long ago (> 1 day), allow prompting again.
    COOLDOWN = 24 * 3600  # 1 day (reduced from 3 days for better engagement)
    now = time.time()
    skipped_fields = [f for f, t in skipped_data.items() if now - t < COOLDOWN]

    logger.info(
        "prompt_for_next_missing_field",
        user_id=user_id,
        missing_required=missing_required,
        missing_recommended=missing_recommended,
        skipped_fields=skipped_fields,
        skipped_data=skipped_data,
    )

    if not missing_required:
        context.user_data.pop(STATE_ADHOC_CONTINUE, None)
        check_and_update_profile_complete(user_id, context)

        # Also check recommended fields (which are required for matching eligibility)
        # Filter out fields that have been explicitly skipped in this session
        remaining_recommended = [f for f in missing_recommended if f not in skipped_fields]

        logger.info("Checking recommended fields", remaining=remaining_recommended)

        if remaining_recommended:
            next_field = remaining_recommended[0]

            # Allow skipping bio if it's the only thing missing?
            # But let's prompt for it as part of the flow.

            context.user_data[STATE_ADHOC_CONTINUE] = True
            logger.info("Prompting for recommended field", field=next_field)

            if next_field == "bio":
                context.user_data[STATE_AWAITING_BIO] = True
                await _send_message_safe(
                    update, context, BIO_UPDATE_MESSAGE, reply_markup=skip_keyboard("Write a short bio")
                )
                return True
            elif next_field == "interests":
                context.user_data[STATE_AWAITING_INTERESTS] = True
                await _send_message_safe(
                    update, context, INTERESTS_UPDATE_MESSAGE, reply_markup=skip_keyboard("music, travel, cooking")
                )
                return True
            elif next_field == "location":
                context.user_data["awaiting_location"] = True
                await _send_message_safe(update, context, LOCATION_UPDATE_MESSAGE, reply_markup=location_keyboard())
                return True

        # All fields (required + recommended) are done or skipped
        logger.info("All fields complete or skipped", silent=silent_if_complete)
        if not silent_if_complete:
            await _send_message_safe(
                update,
                context,
                "🎉 Your profile is fully complete! You can start matching with /match!",
                reply_markup=main_menu(),
            )
        return False

    context.user_data[STATE_ADHOC_CONTINUE] = True

    next_field = missing_required[0]
    logger.info("Prompting for required field", field=next_field)
    field_label = next_field.capitalize()
    await _send_message_safe(
        update,
        context,
        f"Your profile still needs: {field_label}\n\nLet's complete it now!",
    )

    if next_field == "name":
        context.user_data[STATE_AWAITING_NAME] = True
        await _send_message_safe(
            update, context, NAME_UPDATE_MESSAGE, reply_markup=ReplyKeyboardMarkup([["Cancel"]], resize_keyboard=True)
        )
    elif next_field == "age":
        context.user_data[STATE_AWAITING_AGE] = True
        await _send_message_safe(
            update, context, AGE_UPDATE_MESSAGE, reply_markup=ReplyKeyboardMarkup([["Cancel"]], resize_keyboard=True)
        )
    elif next_field == "gender_preference":
        context.user_data[STATE_AWAITING_GENDER_PREF] = True
        await _send_message_safe(
            update,
            context,
            "Who would you like to match with?",
            reply_markup=gender_preference_required_keyboard(),
        )
    elif next_field == "gender":
        context.user_data["awaiting_gender"] = True
        await _send_message_safe(update, context, GENDER_UPDATE_MESSAGE, reply_markup=gender_keyboard())
    elif next_field == "photos":
        context.user_data[STATE_AWAITING_PHOTO] = True
        context.user_data[STATE_PENDING_MEDIA] = []
        settings = get_settings()
        await _send_message_safe(
            update,
            context,
            f"Please upload at least one photo or video to complete your profile! 📸 (up to {settings.MAX_MEDIA_COUNT})",
            reply_markup=media_upload_keyboard(0, settings.MAX_MEDIA_COUNT),
        )

    return True


@authenticated
async def profile_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle the /profile command.

    Displays the profile menu to the user.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    if not update.message or context.user_data is None:
        return

    # user_id = str(update.effective_user.id) # unused
    # user = get_user(user_id) # unused

    await update.message.reply_text(
        PROFILE_MENU_MESSAGE,
        reply_markup=profile_main_menu(),
    )
    context.user_data[STATE_PROFILE_MENU] = True


@authenticated
async def name_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle the /name command.

    Updates the user's name or prompts for input.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    if not update.message or not update.message.text or not update.effective_user or context.user_data is None:
        return

    message_text = update.message.text.strip()

    # Check if command includes the name inline (legacy support)
    if message_text != "/name":
        name = message_text[5:].strip()
        if name:
            await _save_name(update, context, name)
            return

    # Set conversation state and prompt user
    clear_conversation_state(context)
    context.user_data[STATE_AWAITING_NAME] = True

    user_id = str(update.effective_user.id)
    user = get_user(user_id)
    has_name = bool(getattr(user, "first_name", None))
    prompt = (
        NAME_UPDATE_MESSAGE
        if not has_name
        else f"{NAME_UPDATE_MESSAGE}\n\nCurrent: {user.first_name}\nType 'Skip' to keep the current value."
    )
    await update.message.reply_text(
        prompt,
        reply_markup=(skip_cancel_keyboard("Type your name") if has_name else cancel_keyboard("Type your name")),
    )


async def _save_name(update: Update, context: ContextTypes.DEFAULT_TYPE, name: str) -> None:
    """
    Save the user's name.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
        name (str): The name to save.
    """
    if not update.effective_user or not update.message or context.user_data is None:
        return

    user_id = str(update.effective_user.id)

    try:
        update_user(user_id, {"first_name": name})
        user = get_user(user_id)
        context.user_data["user"] = user
        await update.message.reply_text(NAME_UPDATED_MESSAGE.format(name=name))

        if context.user_data.get(STATE_PROFILE_SETUP) is not None:
            await _next_profile_step(update, context)
        elif context.user_data.get(STATE_ADHOC_CONTINUE):
            context.user_data.pop(STATE_ADHOC_CONTINUE, None)
            await prompt_for_next_missing_field(update, context, user_id)
        else:
            await prompt_for_next_missing_field(update, context, user_id)
    except Exception as e:
        logger.error("Error updating name", user_id=user_id, error=str(e), exc_info=e)
        await update.message.reply_text("Sorry, something went wrong. Please try again.")


@authenticated
async def age_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle the /age command.

    Updates the user's age or prompts for input.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    if not update.message or not update.message.text or not update.effective_user or context.user_data is None:
        return

    message_text = update.message.text.strip()

    # Check if command includes the age inline (legacy support)
    if message_text != "/age":
        age_str = message_text[4:].strip()
        if age_str:
            await _save_age(update, context, age_str)
            return

    # Set conversation state and prompt user
    clear_conversation_state(context)
    context.user_data[STATE_AWAITING_AGE] = True

    user_id = str(update.effective_user.id)
    user = get_user(user_id)
    has_age = bool(getattr(user, "age", None))
    prompt = (
        AGE_UPDATE_MESSAGE
        if not has_age
        else f"{AGE_UPDATE_MESSAGE}\n\nCurrent: {user.age}\nType 'Skip' to keep the current value."
    )
    await update.message.reply_text(
        prompt,
        reply_markup=(
            skip_cancel_keyboard("Enter a number 10-65") if has_age else cancel_keyboard("Enter a number 10-65")
        ),
    )


def _coerce_preferences(prefs: Any) -> Preferences:
    """
    Return a Preferences object from various persisted shapes.

    Args:
        prefs (Any): Preferences data (can be dict, Preferences object, or None).

    Returns:
        Preferences: A valid Preferences object.
    """
    if isinstance(prefs, Preferences):
        return prefs
    if isinstance(prefs, dict):
        try:
            return Preferences.model_validate(prefs)
        except Exception:
            return Preferences()
    return Preferences()


def _maybe_set_age_range_defaults(user_id: str, age: int, prefs: Any) -> None:
    """
    Auto-set min/max age to age±4 when not already set.

    Args:
        user_id (str): The user ID.
        age (int): The user's age.
        prefs (Any): Current preferences.
    """
    try:
        pref_obj = _coerce_preferences(prefs)
        needs_min = pref_obj.min_age is None
        needs_max = pref_obj.max_age is None
        if not (needs_min or needs_max):
            return

        default_min = max(10, age - 4)
        default_max = min(65, age + 4)

        if needs_min:
            pref_obj.min_age = default_min if pref_obj.max_age is None else min(default_min, pref_obj.max_age)
        if needs_max:
            pref_obj.max_age = default_max if pref_obj.min_age is None else max(default_max, pref_obj.min_age)

        update_user_preferences(user_id, pref_obj)
        logger.debug(
            "Auto-set age range from age",
            user_id=user_id,
            min_age=pref_obj.min_age,
            max_age=pref_obj.max_age,
        )
    except Exception as e:
        logger.warning("Failed to auto-set age range", user_id=user_id, error=str(e))


async def _save_age(update: Update, context: ContextTypes.DEFAULT_TYPE, age_str: str) -> bool:
    """
    Save the user's age.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
        age_str (str): The age as a string.

    Returns:
        bool: True if successful, False otherwise.
    """
    if not update.effective_user or not update.message or context.user_data is None:
        return False

    user_id = str(update.effective_user.id)

    try:
        age = int(age_str)

        if age < 10 or age > 65:
            await update.message.reply_text("Age must be between 10 and 65. Please try again:")
            return False

        # Fetch existing prefs before update so we can set defaults without overwriting manual settings
        existing_user = get_user(user_id)

        update_user(user_id, {"age": age})
        _maybe_set_age_range_defaults(user_id, age, getattr(existing_user, "preferences", None))

        user = get_user(user_id)
        context.user_data["user"] = user
        await update.message.reply_text(AGE_UPDATED_MESSAGE.format(age=age))

        if context.user_data.get(STATE_PROFILE_SETUP) is not None:
            await _next_profile_step(update, context)
        else:
            await prompt_for_next_missing_field(update, context, user_id)
        return True
    except ValueError:
        await update.message.reply_text("Please enter a valid number between 10 and 65:")
        return False
    except Exception as e:
        logger.error("Error updating age", user_id=user_id, error=str(e), exc_info=e)
        await update.message.reply_text("Sorry, something went wrong. Please try again.")
        return False


@authenticated
async def gender_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle the /gender command.

    Updates the user's gender or prompts for input.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    if not update.message or not update.message.text or not update.effective_user or context.user_data is None:
        return

    message_text = update.message.text.strip()

    # Check if command includes the gender
    if message_text == "/gender":
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        cur = None
        if user.gender and isinstance(user.gender, Gender):
            cur = user.gender.name.capitalize()
        elif user.gender:
            cur = str(user.gender)

        prompt = (
            GENDER_UPDATE_MESSAGE
            if not cur
            else f"{GENDER_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
        )
        await update.message.reply_text(
            prompt,
            reply_markup=gender_keyboard(),
        )
        context.user_data["awaiting_gender"] = True
        return

    # Extract gender from command
    gender_str = message_text[7:].strip()
    await process_gender_selection(update, context, gender_str)


@authenticated
async def gender_selection(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle gender selection from keyboard.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    if context.user_data is None or not update.message or not update.message.text or not update.effective_user:
        return

    logger.info(
        "gender_selection handler triggered",
        user_id=update.effective_user.id,
        text=update.message.text,
        user_data_keys=list(context.user_data.keys()) if context.user_data else [],
        awaiting_gender=context.user_data.get("awaiting_gender"),
    )

    # Check if we're awaiting gender selection
    if not context.user_data.get("awaiting_gender"):
        logger.info("gender_selection ignored: awaiting_gender not set")
        return

    # Process the selected gender
    gender_str = update.message.text.strip()
    await process_gender_selection(update, context, gender_str)


async def process_gender_selection(update: Update, context: ContextTypes.DEFAULT_TYPE, gender_str: str) -> None:
    """
    Process gender selection.

    Validates and updates the user's gender.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
        gender_str (str): Selected gender string (Male/Female).
    """
    if not update.effective_user or not update.message or context.user_data is None:
        return

    user_id = str(update.effective_user.id)
    logger.info("Processing gender selection", user_id=user_id, gender_input=gender_str)

    in_profile_setup = context.user_data.get(STATE_PROFILE_SETUP) is not None

    if gender_str.lower() == "cancel":
        clear_conversation_state(context)
        context.user_data.pop(STATE_PROFILE_SETUP, None)
        context.user_data.pop(STATE_ADHOC_CONTINUE, None)
        await update.message.reply_text(
            "Gender update canceled.",
            reply_markup=main_menu(),
        )
        return

    if gender_str.lower() == "skip":
        await update.message.reply_text("Gender is required and cannot be skipped. Please choose an option.")
        return

    try:
        gender_map = {
            "male": Gender.MALE,
            "female": Gender.FEMALE,
        }

        gender_key = gender_str.lower()
        if gender_key not in gender_map:
            await update.message.reply_text("Invalid gender. Please select Male or Female.")
            return

        gender = gender_map[gender_key]

        update_user(user_id, {"gender": gender.value})
        user = get_user(user_id)
        context.user_data["user"] = user
        await update.message.reply_text(GENDER_UPDATED_MESSAGE.format(gender=gender.value))

        context.user_data.pop("awaiting_gender", None)

        if in_profile_setup:
            await _next_profile_step(update, context)
        else:
            await prompt_for_next_missing_field(update, context, user_id)
    except Exception as e:
        logger.error(
            "Error updating gender",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again.")


@authenticated
async def bio_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle the /bio command.

    Updates the user's bio or prompts for input.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    if not update.message or not update.message.text or not update.effective_user or context.user_data is None:
        return

    message_text = update.message.text.strip()

    # Check if command includes the bio inline (legacy support)
    if message_text != "/bio":
        bio = message_text[4:].strip()
        if bio:
            await _save_bio(update, context, bio)
            return

    # Set conversation state and prompt user
    clear_conversation_state(context)
    context.user_data[STATE_AWAITING_BIO] = True

    user_id = str(update.effective_user.id)
    user = get_user(user_id)
    cur = getattr(user, "bio", None)
    prompt = (
        BIO_UPDATE_MESSAGE
        if not cur
        else f"{BIO_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
    )
    await update.message.reply_text(
        prompt,
        reply_markup=skip_keyboard("Write a short bio"),
    )


async def _save_bio(update: Update, context: ContextTypes.DEFAULT_TYPE, bio: str) -> bool:
    """
    Save the user's bio.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
        bio (str): The bio text.

    Returns:
        bool: True if successful, False otherwise.
    """
    if not update.effective_user or not update.message or context.user_data is None:
        return False

    user_id = str(update.effective_user.id)

    try:
        if len(bio) > 300:
            await update.message.reply_text("Bio is too long. Please keep it under 300 characters:")
            return False

        update_user(user_id, {"bio": bio})
        user = get_user(user_id)
        context.user_data["user"] = user
        await update.message.reply_text(BIO_UPDATED_MESSAGE)

        if context.user_data.get(STATE_PROFILE_SETUP) is not None:
            await _next_profile_step(update, context)
        else:
            await prompt_for_next_missing_field(update, context, user_id)
        return True
    except Exception as e:
        logger.error("Error updating bio", user_id=user_id, error=str(e), exc_info=e)
        await update.message.reply_text("Sorry, something went wrong. Please try again.")
        return False


@authenticated
async def interests_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle the /interests command.

    Updates the user's interests or prompts for input.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    if not update.message or not update.message.text or not update.effective_user or context.user_data is None:
        return

    message_text = update.message.text.strip()

    # Check if command includes the interests inline (legacy support)
    if message_text != "/interests":
        interests_text = message_text[10:].strip()
        if interests_text:
            await _save_interests(update, context, interests_text)
            return

    # Set conversation state and prompt user
    clear_conversation_state(context)
    context.user_data[STATE_AWAITING_INTERESTS] = True

    user_id = str(update.effective_user.id)
    user = get_user(user_id)
    cur_list = getattr(user, "interests", []) or []
    cur = ", ".join(cur_list) if cur_list else None
    prompt = (
        INTERESTS_UPDATE_MESSAGE
        if not cur
        else f"{INTERESTS_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
    )
    await update.message.reply_text(
        prompt,
        reply_markup=skip_keyboard("music, travel, cooking"),
    )


async def _save_interests(update: Update, context: ContextTypes.DEFAULT_TYPE, interests_text: str) -> bool:
    """
    Save the user's interests.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
        interests_text (str): Comma-separated list of interests.

    Returns:
        bool: True if successful, False otherwise.
    """
    if not update.effective_user or not update.message or context.user_data is None:
        return False

    user_id = str(update.effective_user.id)

    try:
        interests = [interest.strip() for interest in interests_text.split(",") if interest.strip()]

        if not interests:
            await update.message.reply_text("Please provide at least one interest:")
            return False

        if len(interests) > 10:
            await update.message.reply_text("Too many interests. Please provide at most 10:")
            return False

        update_user(user_id, {"interests": interests})
        user = get_user(user_id)
        context.user_data["user"] = user
        await update.message.reply_text(INTERESTS_UPDATED_MESSAGE)

        if context.user_data.get(STATE_PROFILE_SETUP) is not None:
            await _next_profile_step(update, context)
        else:
            await prompt_for_next_missing_field(update, context, user_id)
        return True
    except Exception as e:
        logger.error("Error updating interests", user_id=user_id, error=str(e), exc_info=e)
        await update.message.reply_text("Sorry, something went wrong. Please try again.")
        return False


@authenticated
async def location_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle the /location command.

    Prompts the user to share their location or enter it manually.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    if not update.effective_user or not update.message or not update.message.text or context.user_data is None:
        return

    str(update.effective_user.id)
    message_text = update.message.text.strip()

    # Always prompt for location interactively, ignoring any inline arguments
    if message_text.startswith("/location"):
        user_id = str(update.effective_user.id)
        cur = get_user_location_text(user_id)
        prompt = (
            LOCATION_UPDATE_MESSAGE
            if not cur
            else f"{LOCATION_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
        )
        await update.message.reply_text(
            prompt,
            reply_markup=(location_optional_keyboard() if cur else location_keyboard()),
        )


@authenticated
async def location_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle location sharing via Telegram's location feature.

    Updates the user's coordinates and attempts to reverse geocode them to a city/country.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    # Always handle incoming location messages

    if not update.effective_user or not update.message or not update.message.location or context.user_data is None:
        return

    user_id = str(update.effective_user.id)
    in_profile_setup = context.user_data.get(STATE_PROFILE_SETUP) is not None

    try:
        location = update.message.location
        latitude = location.latitude
        longitude = location.longitude

        geo = await reverse_geocode_coordinates(latitude, longitude)
        country = (geo or {}).get("country")

        location_data: dict[str, Any] = {
            "location_latitude": latitude,
            "location_longitude": longitude,
            "location_city": (geo or {}).get("city") or "Unknown City",
            "location_country": country or "Unknown Country",
        }

        # Update preferences with country if found
        update_data = location_data.copy()
        if country:
            from src.models.user import Preferences

            # We need to get the user to access current preferences,
            # but we might have it in context.user_data already?
            # Safer to fetch or check context.user_data["user"]
            user_obj = context.user_data.get("user") if context.user_data else None
            if not user_obj:
                user_obj = get_user(user_id)

            prefs = getattr(user_obj, "preferences", None) or Preferences()
            prefs.preferred_country = country
            update_data["preferences"] = prefs.model_dump()
            logger.info("Auto-updating preferred_country from location", user_id=user_id, country=country)

        update_user(user_id, update_data)
        user = get_user(user_id)
        context.user_data["user"] = user

        context.user_data.pop("awaiting_location", None)

        await update.message.reply_text(
            LOCATION_UPDATED_MESSAGE.format(
                location=f"{location_data['location_city']}, {location_data['location_country']}"
            )
        )

        if in_profile_setup:
            await _next_profile_step(update, context)
        else:
            await prompt_for_next_missing_field(update, context, user_id)
    except Exception as e:
        logger.error(
            "Error updating location from coordinates",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text(
            "Sorry, something went wrong. Please try again or enter your location manually."
        )


async def process_manual_location(update: Update, context: ContextTypes.DEFAULT_TYPE, location_text: str) -> None:
    """
    Process manual location entry.

    Geocodes the city/country string entered by the user.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
        location_text (str): Location string (e.g., "Paris, France").
    """
    if not update.effective_user or not update.message or context.user_data is None:
        return

    user_id = str(update.effective_user.id)
    in_profile_setup = context.user_data.get(STATE_PROFILE_SETUP) is not None

    if location_text.lower() == "skip":
        context.user_data.pop("awaiting_location", None)
        if in_profile_setup:
            await _next_profile_step(update, context)
        else:
            skipped = context.user_data.get("skipped_profile_fields", [])
            if "location" not in skipped:
                skipped.append("location")
                context.user_data["skipped_profile_fields"] = skipped

            await prompt_for_next_missing_field(update, context, user_id)
        return

    try:
        raw = location_text.strip()
        if not raw:
            await update.message.reply_text(
                "Please type 'City, Country' (e.g., 'Berlin, Germany') or share your location:"
            )
            return

        if "," not in raw:
            await update.message.reply_text(
                "Please use the format 'City, Country' (e.g., 'Berlin, Germany') or share your location using the button."
            )
            return

        parts = [part.strip() for part in raw.split(",") if part.strip()]
        if len(parts) < 2:
            await update.message.reply_text("Please include both city and country, e.g., 'Berlin, Germany'.")
            return

        city_query = f"{parts[0]}, {parts[1]}"

        geo = await geocode_city(city_query)
        if not geo or not geo.get("city") or not geo.get("country"):
            await update.message.reply_text(
                "I couldn't find that city. Please try a different spelling or share your location using the button."
            )
            return

        location_data: dict[str, Any] = {
            "location_latitude": geo["latitude"],
            "location_longitude": geo["longitude"],
            "location_city": geo["city"],
            "location_country": geo["country"],
        }

        # Update preferences with country if found
        update_data = location_data.copy()
        country = geo.get("country")
        if country:
            from src.models.user import Preferences

            user_obj = context.user_data.get("user") if context.user_data else None
            if not user_obj:
                user_obj = get_user(user_id)

            prefs = getattr(user_obj, "preferences", None) or Preferences()
            prefs.preferred_country = country
            update_data["preferences"] = prefs.model_dump()
            logger.info("Auto-updating preferred_country from manual location", user_id=user_id, country=country)

        update_user(user_id, update_data)
        user = get_user(user_id)
        context.user_data["user"] = user
        await update.message.reply_text(
            LOCATION_UPDATED_MESSAGE.format(
                location=f"{location_data['location_city']}, {location_data['location_country']}"
            )
        )

        context.user_data.pop("awaiting_location", None)

        if in_profile_setup:
            await _next_profile_step(update, context)
        else:
            await prompt_for_next_missing_field(update, context, user_id)
    except Exception as e:
        logger.error(
            "Error updating location manually",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again or share your location.")


def clear_conversation_state(context: ContextTypes.DEFAULT_TYPE, user_id: str | None = None) -> None:
    """
    Clear all conversation states.

    Args:
        context (ContextTypes.DEFAULT_TYPE): The context object.
        user_id (str | None): Optional user ID to clear Redis state.
    """
    if context.user_data is None:
        return
    states_to_clear = [
        STATE_AWAITING_NAME,
        STATE_AWAITING_AGE,
        STATE_AWAITING_BIO,
        STATE_AWAITING_INTERESTS,
        STATE_AWAITING_PHOTO,
        STATE_PENDING_MEDIA,
        STATE_ADHOC_CONTINUE,
        "awaiting_gender",
        "awaiting_location",
        "skipped_profile_fields",
    ]
    for state in states_to_clear:
        context.user_data.pop(state, None)

    # Also clear the editing state in Redis
    if user_id:
        set_user_editing_state(user_id, False)


PROFILE_STEPS = ["name", "age", "gender", "gender_preference", "bio", "interests", "location", "photos"]


async def _next_profile_step(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Move to the next step in profile setup.

    Iterates through the list of profile steps (name, age, etc.) and prompts
    the user for the next required piece of information.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    if not update.effective_user or not update.message or context.user_data is None:
        return

    current_step = context.user_data.get(STATE_PROFILE_SETUP, 0)
    next_step = current_step + 1

    if next_step >= len(PROFILE_STEPS):
        # Profile setup complete
        context.user_data.pop(STATE_PROFILE_SETUP, None)
        user_id = str(update.effective_user.id)
        clear_conversation_state(context, user_id=user_id)

        user = get_user(user_id)
        missing_required = get_missing_required_fields(user)

        if missing_required:
            await update.message.reply_text(
                f"Almost there! You still need to set: {', '.join(f.capitalize() for f in missing_required)}\n\n"
                f"Use /profile to complete your profile.",
                reply_markup=main_menu(),
            )
        else:
            check_and_update_profile_complete(user_id, context)

            await update.message.reply_text(
                "🎉 Great! Your profile is now complete!\n\nYou can view your profile with /profile or start matching with /match!",
                reply_markup=main_menu(),
            )
        return

    context.user_data[STATE_PROFILE_SETUP] = next_step
    step_name = PROFILE_STEPS[next_step]

    # Set editing state in Redis
    set_user_editing_state(str(update.effective_user.id), True)

    # Trigger the appropriate command
    if step_name == "name":
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        has_name = bool(getattr(user, "first_name", None))
        context.user_data[STATE_AWAITING_NAME] = True
        prompt = (
            NAME_UPDATE_MESSAGE
            if not has_name
            else f"{NAME_UPDATE_MESSAGE}\n\nCurrent: {user.first_name}\nType 'Skip' to keep the current value."
        )
        await update.message.reply_text(
            prompt,
            reply_markup=(skip_cancel_keyboard("Type your name") if has_name else cancel_keyboard("Type your name")),
        )
    elif step_name == "age":
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        has_age = bool(getattr(user, "age", None))
        context.user_data[STATE_AWAITING_AGE] = True
        prompt = (
            AGE_UPDATE_MESSAGE
            if not has_age
            else f"{AGE_UPDATE_MESSAGE}\n\nCurrent: {user.age}\nType 'Skip' to keep the current value."
        )
        await update.message.reply_text(
            prompt,
            reply_markup=(
                skip_cancel_keyboard("Enter a number 10-65") if has_age else cancel_keyboard("Enter a number 10-65")
            ),
        )
    elif step_name == "gender":
        context.user_data["awaiting_gender"] = True
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        cur = None
        if user.gender and isinstance(user.gender, Gender):
            cur = user.gender.name.capitalize()
        elif user.gender:
            cur = str(user.gender)
        prompt = (
            GENDER_UPDATE_MESSAGE
            if not cur
            else f"{GENDER_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
        )
        await update.message.reply_text(
            prompt,
            reply_markup=gender_optional_keyboard(),
        )
    elif step_name == "gender_preference":
        context.user_data[STATE_AWAITING_GENDER_PREF] = True
        await update.message.reply_text(
            "Who would you like to match with?",
            reply_markup=gender_preference_required_keyboard(),
        )
    elif step_name == "bio":
        context.user_data[STATE_AWAITING_BIO] = True
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        cur = getattr(user, "bio", None)
        prompt = (
            BIO_UPDATE_MESSAGE
            if not cur
            else f"{BIO_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
        )
        await update.message.reply_text(prompt, reply_markup=skip_keyboard("Optional - you can Skip"))
    elif step_name == "interests":
        context.user_data[STATE_AWAITING_INTERESTS] = True
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        cur_list = getattr(user, "interests", []) or []
        cur = ", ".join(cur_list) if cur_list else None
        prompt = (
            INTERESTS_UPDATE_MESSAGE
            if not cur
            else f"{INTERESTS_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
        )
        await update.message.reply_text(prompt, reply_markup=skip_keyboard("Optional - you can Skip"))
    elif step_name == "location":
        context.user_data["awaiting_location"] = True
        user_id = str(update.effective_user.id)
        cur = get_user_location_text(user_id)
        prompt = (
            LOCATION_UPDATE_MESSAGE
            if not cur
            else f"{LOCATION_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
        )
        await update.message.reply_text(
            prompt,
            reply_markup=(location_optional_keyboard() if cur else location_keyboard()),
        )
    elif step_name == "photos":
        context.user_data[STATE_AWAITING_PHOTO] = True
        context.user_data[STATE_PENDING_MEDIA] = []  # Start fresh upload session
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        cur_photos = getattr(user, "photos", []) or []
        settings = get_settings()

        if not cur_photos:
            prompt = (
                f"📸 Send photos or videos for your profile (up to {settings.MAX_MEDIA_COUNT}).\n\n"
                f"📏 Limits:\n"
                f"• Images: max 5MB, min 200x200px\n"
                f"• Videos: max 20MB\n\n"
                f"Press '✅ Done' when finished."
            )
            reply_markup = media_upload_keyboard(0, settings.MAX_MEDIA_COUNT)
        else:
            # Show existing media first
            await send_media_group_safe(update.message.reply_media_group, cur_photos)

            prompt = (
                f"📸 You have {len(cur_photos)} photos/videos (shown above).\n"
                f"To REPLACE them, send new photos/videos.\n"
                f"To KEEP them, press '✅ Done'."
            )
            # Start keyboard count at 0 for new upload session (replace logic)
            reply_markup = media_upload_keyboard(0, settings.MAX_MEDIA_COUNT, allow_done=True)

        await update.message.reply_text(prompt, reply_markup=reply_markup)


async def start_profile_setup(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Start the guided profile setup flow.

    Initiates a step-by-step wizard to help the user complete their profile.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    if not update.message or context.user_data is None or not update.effective_user:
        return

    user_id = str(update.effective_user.id)
    clear_conversation_state(context, user_id=user_id)
    context.user_data[STATE_PROFILE_SETUP] = -1  # Will be incremented to 0

    await update.message.reply_text(
        "Let's set up your profile! I'll guide you through each step.\n\nYou can type 'Skip' to skip optional fields or 'Cancel' to stop at any time.",
    )

    await _next_profile_step(update, context)


@authenticated
async def handle_text_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle text messages when awaiting user input.

    Serves as the main router for conversational inputs (e.g., answering profile
    questions) and main menu commands.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    if not update.message or not update.message.text or not update.effective_user or context.user_data is None:
        return

    text = update.message.text.strip()
    user_id = str(update.effective_user.id)

    logger.info(
        "handle_text_message triggered",
        user_id=user_id,
        text=text,
        states=list(context.user_data.keys()) if context.user_data else [],
    )

    if context.user_data.get(STATE_PROFILE_MENU):
        if text == "👤 View Profile":
            # Show own profile
            user_id = str(update.effective_user.id)
            user = get_user(user_id)
            profile_text = VIEW_PROFILE_TEMPLATE.format(
                name=sanitize_html(user.first_name),
                age=user.age,
                gender=sanitize_html(
                    user.gender.value.capitalize()
                    if isinstance(user.gender, Gender)
                    else (user.gender or "Not specified")
                ),
                media_count=len(user.photos) if user.photos else 0,
                bio=sanitize_html(user.bio or "No bio yet."),
                interests=sanitize_html(", ".join(user.interests) if user.interests else "No interests listed."),
                location=sanitize_html(get_user_location_text(user.id) or "Location hidden"),
            )

            # Send media if available
            if user.photos and len(user.photos) > 0:
                await send_media_group_safe(update.message.reply_media_group, user.photos)

            await update.message.reply_text(profile_text, reply_markup=profile_main_menu())
            return
        if text == "🔎 Browse Profiles":
            await match_command(update, context)
            return
        if text == "🛠 Edit Profile":
            context.user_data.pop(STATE_PROFILE_MENU, None)
            await start_profile_setup(update, context)
            return
        if text == "🖼 Update Photo":
            context.user_data.pop(STATE_PROFILE_MENU, None)
            context.user_data[STATE_AWAITING_PHOTO] = True
            context.user_data[STATE_PENDING_MEDIA] = []  # Start fresh upload session
            user_id = str(update.effective_user.id)
            set_user_editing_state(user_id, True)
            user = get_user(user_id)
            has_photos = bool(user.photos and len(user.photos) > 0)
            settings = get_settings()
            await update.message.reply_text(
                f"📸 Send photos or videos for your profile (up to {settings.MAX_MEDIA_COUNT}).\n\n"
                f"📏 Limits:\n"
                f"• Images: max 5MB, min 200x200px\n"
                f"• Videos: max 20MB\n\n"
                f"Press '✅ Done' when finished or 'Cancel' to abort.",
                reply_markup=media_upload_keyboard(0, settings.MAX_MEDIA_COUNT, allow_done=has_photos),
            )
            return
        if text == "✏️ Update Bio":
            context.user_data.pop(STATE_PROFILE_MENU, None)
            context.user_data[STATE_AWAITING_BIO] = True
            user_id = str(update.effective_user.id)
            set_user_editing_state(user_id, True)
            user = get_user(user_id)
            cur = getattr(user, "bio", None)
            prompt = (
                BIO_UPDATE_MESSAGE
                if not cur
                else f"{BIO_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
            )
            await update.message.reply_text(prompt)
            return

    # Handle Main Menu buttons (Global)
    if text == "🚀 Start Match":
        await match_command(update, context)
        return

    if text == "👤 View Profile":
        # Call profile_command logic directly or invoke it
        await profile_command(update, context)
        return

    if text == "💤 Sleep / Pause":
        user_id = str(update.effective_user.id)
        # Set user to sleeping mode - profile stays visible but user is paused
        from src.services.user_service import set_user_sleeping

        set_user_sleeping(user_id, True)

        status_msg = (
            "💤 *You are now paused.*\n\n"
            "You have logged out of the session, but your profile remains visible to others in the match cycle.\n\n"
            "We will notify you here if someone likes your profile! 🔔\n\n"
            "Type /start to wake up and resume."
        )
        await update.message.reply_text(status_msg, parse_mode="Markdown", reply_markup=ReplyKeyboardRemove())
        return

    if text == "📨 Invite Friend":
        msg = "📨 *Invite Friends*\n\nThis feature is coming soon! Stay tuned."
        await update.message.reply_text(msg, parse_mode="Markdown", reply_markup=main_menu())
        return

    if text == "⚙️ Settings":
        await settings_command(update, context)
        return

    # Handle Done button for media upload
    if text.startswith("✅ Done"):
        pending_media = context.user_data.get(STATE_PENDING_MEDIA, [])
        user_id = str(update.effective_user.id)
        user = get_user(user_id)

        if pending_media:
            old_photos = list(user.photos or [])

            # Replace behavior: Delete all existing photos and track them for 365-day retention
            for old_photo in old_photos:
                delete_media(old_photo, user_id=user_id, reason="replaced")

            # Set the new photos (replacement, not adding)
            update_user(user_id, {"photos": pending_media})

            # Clear state
            context.user_data.pop(STATE_AWAITING_PHOTO, None)
            context.user_data.pop(STATE_PENDING_MEDIA, None)

            media_count = len(pending_media)

            # Check if in setup flow
            if context.user_data.get(STATE_PROFILE_SETUP) is not None:
                await update.message.reply_text(
                    f"✅ Profile media saved! ({media_count} file{'s' if media_count > 1 else ''})"
                )
                await _next_profile_step(update, context)
                return

            context.user_data[STATE_PROFILE_MENU] = True
            context.user_data["user"] = get_user(user_id)

            if old_photos:
                await update.message.reply_text(
                    f"✅ Profile media replaced! ({media_count} file{'s' if media_count > 1 else ''})",
                    reply_markup=main_menu(),
                )
            else:
                await update.message.reply_text(
                    f"✅ Profile media saved! ({media_count} file{'s' if media_count > 1 else ''})",
                    reply_markup=main_menu(),
                )

            # Check if profile is now complete
            if context.user_data.get(STATE_ADHOC_CONTINUE):
                await prompt_for_next_missing_field(update, context, user_id)

        # Case: No new media, but user has existing photos (Keep Existing)
        elif user.photos and len(user.photos) > 0:
            context.user_data.pop(STATE_AWAITING_PHOTO, None)
            context.user_data.pop(STATE_PENDING_MEDIA, None)

            media_count = len(user.photos)

            # Check if in setup flow
            if context.user_data.get(STATE_PROFILE_SETUP) is not None:
                await update.message.reply_text(f"✅ Keeping existing {media_count} photos/videos.")
                await _next_profile_step(update, context)
                return

            context.user_data[STATE_PROFILE_MENU] = True
            # Refresh user data in context if needed
            context.user_data["user"] = get_user(user_id)

            await update.message.reply_text(
                f"✅ Photos unchanged ({media_count} file{'s' if media_count > 1 else ''}).",
                reply_markup=main_menu(),
            )

            # Check if profile is now complete
            if context.user_data.get(STATE_ADHOC_CONTINUE):
                await prompt_for_next_missing_field(update, context, user_id)

        else:
            await update.message.reply_text(
                "❌ No media uploaded yet. Please send at least one photo or video.",
                reply_markup=media_upload_keyboard(0, get_settings().MAX_MEDIA_COUNT),
            )
        return

    # Handle cancel
    if text.lower() == "cancel":
        # Clean up any pending media files that weren't saved
        pending_media = context.user_data.get(STATE_PENDING_MEDIA, [])
        if pending_media:
            user_id = str(update.effective_user.id)
            for media_path in pending_media:
                delete_media(media_path, user_id=user_id, reason="cancelled")
            context.user_data.pop(STATE_PENDING_MEDIA, None)

        clear_conversation_state(context, user_id=str(update.effective_user.id))
        context.user_data.pop(STATE_PROFILE_SETUP, None)
        context.user_data.pop(STATE_ADHOC_CONTINUE, None)
        await update.message.reply_text(
            "Cancelled. Use /profile to see your profile or continue editing.",
            reply_markup=main_menu(),
        )
        return

    # Handle region/language input (required settings that cannot be skipped)
    # These checks are placed before skip handling since region/language are required
    if context.user_data.get("awaiting_region"):
        from src.bot.handlers.settings import handle_region

        await handle_region(update, context, text)
        return

    if context.user_data.get("awaiting_language"):
        from src.bot.handlers.settings import handle_language

        await handle_language(update, context, text)
        return

    # Handle skip (for optional fields in profile setup or adhoc continue mode)
    if text.lower() == "skip":
        logger.info(
            "Skip command received",
            user_id=user_id,
            states=list(context.user_data.keys()) if context.user_data else [],
            text=text,
            adhoc_val=context.user_data.get(STATE_ADHOC_CONTINUE),
            bio_val=context.user_data.get(STATE_AWAITING_BIO),
        )
        in_profile_setup = context.user_data.get(STATE_PROFILE_SETUP) is not None

        # Robust adhoc mode detection
        in_adhoc_mode = (
            context.user_data.get(STATE_ADHOC_CONTINUE)
            or context.user_data.get("awaiting_gender")
            or context.user_data.get(STATE_AWAITING_BIO)
            or context.user_data.get(STATE_AWAITING_INTERESTS)
            or context.user_data.get("awaiting_location")
        ) and not in_profile_setup

        logger.info("Skip mode detection", in_profile_setup=in_profile_setup, in_adhoc_mode=in_adhoc_mode)

        if in_profile_setup:
            current_step = context.user_data.get(STATE_PROFILE_SETUP, 0)
            step_name = PROFILE_STEPS[current_step] if 0 <= current_step < len(PROFILE_STEPS) else None

            user_id = str(update.effective_user.id)
            user = get_user(user_id)
            if step_name == "name":
                if getattr(user, "first_name", None):
                    context.user_data.pop(STATE_AWAITING_NAME, None)
                    await _next_profile_step(update, context)
                    return
                await update.message.reply_text("This field is required and cannot be skipped. Please enter a value:")
                return
            if step_name == "age":
                if getattr(user, "age", None):
                    context.user_data.pop(STATE_AWAITING_AGE, None)
                    await _next_profile_step(update, context)
                    return
                await update.message.reply_text("This field is required and cannot be skipped. Please enter a value:")
                return
            if step_name == "photos":
                user_id = str(update.effective_user.id)
                user = get_user(user_id)
                if getattr(user, "photos", None) and len(user.photos) > 0:
                    context.user_data.pop(STATE_AWAITING_PHOTO, None)
                    context.user_data.pop(STATE_PENDING_MEDIA, None)
                    await _next_profile_step(update, context)
                    return
                await update.message.reply_text(
                    "You need at least one photo/video for your profile. Please upload one."
                )
                return

            skipped = context.user_data.get("skipped_profile_fields", {})
            if isinstance(skipped, list):
                skipped = {f: time.time() for f in skipped}

            if step_name == "gender":
                if getattr(user, "gender", None):
                    context.user_data.pop("awaiting_gender", None)
                    await _next_profile_step(update, context)
                    return
                await update.message.reply_text(
                    "This field is required and cannot be skipped. Please select an option:"
                )
                return
            elif step_name == "gender_preference":
                prefs = getattr(user, "preferences", None)
                gp = getattr(prefs, "gender_preference", None) if prefs else None
                if gp:
                    context.user_data.pop(STATE_AWAITING_GENDER_PREF, None)
                    await _next_profile_step(update, context)
                    return
                await update.message.reply_text(
                    "This field is required and cannot be skipped. Please choose an option:"
                )
                return
            elif step_name == "bio":
                context.user_data.pop(STATE_AWAITING_BIO, None)
                skipped["bio"] = time.time()
            elif step_name == "interests":
                context.user_data.pop(STATE_AWAITING_INTERESTS, None)
                skipped["interests"] = time.time()
            elif step_name == "location":
                context.user_data.pop("awaiting_location", None)
                skipped["location"] = time.time()

            context.user_data["skipped_profile_fields"] = skipped
            await _next_profile_step(update, context)
            return
        elif in_adhoc_mode:
            user_id = str(update.effective_user.id)

            logger.info("Adhoc skip triggered", user_id=user_id, user_data_keys=list(context.user_data.keys()))

            # Identify which field is being skipped and add to skipped_profile_fields
            # Use list() to create a copy to ensure mutation is detected
            skipped = context.user_data.get("skipped_profile_fields", {})
            if isinstance(skipped, list):
                skipped = {f: time.time() for f in skipped}

            field_skipped = False
            if context.user_data.get("awaiting_gender"):
                await update.message.reply_text("Gender is required and cannot be skipped. Please choose an option.")
                return
            elif context.user_data.get(STATE_AWAITING_GENDER_PREF):
                await update.message.reply_text(
                    "Gender preference is required and cannot be skipped. Please choose an option."
                )
                return
            elif context.user_data.get(STATE_AWAITING_BIO):
                skipped["bio"] = time.time()
                field_skipped = True
            elif context.user_data.get(STATE_AWAITING_INTERESTS):
                skipped["interests"] = time.time()
                field_skipped = True
            elif context.user_data.get("awaiting_location"):
                skipped["location"] = time.time()
                field_skipped = True

            if not field_skipped:
                logger.warning("Adhoc skip triggered but no matching state found!", user_id=user_id)

            logger.info(
                "Updating skipped fields", before=context.user_data.get("skipped_profile_fields", []), after=skipped
            )
            context.user_data["skipped_profile_fields"] = skipped

            context.user_data.pop("awaiting_gender", None)
            context.user_data.pop(STATE_AWAITING_BIO, None)
            context.user_data.pop(STATE_AWAITING_INTERESTS, None)
            context.user_data.pop("awaiting_location", None)
            context.user_data.pop(STATE_AWAITING_GENDER_PREF, None)
            context.user_data.pop(STATE_ADHOC_CONTINUE, None)
            await prompt_for_next_missing_field(update, context, user_id)
            return

    user_id = str(update.effective_user.id)

    # Check conversation states and process accordingly
    if context.user_data.get(STATE_AWAITING_NAME):
        if text.lower() == "skip":
            user = get_user(str(update.effective_user.id))
            if getattr(user, "first_name", None):
                context.user_data.pop(STATE_AWAITING_NAME, None)
                if context.user_data.get(STATE_PROFILE_SETUP) is not None:
                    await _next_profile_step(update, context)
                elif context.user_data.get(STATE_ADHOC_CONTINUE):
                    context.user_data.pop(STATE_ADHOC_CONTINUE, None)
                    await prompt_for_next_missing_field(update, context, str(update.effective_user.id))
                else:
                    await prompt_for_next_missing_field(update, context, str(update.effective_user.id))
                return
            await update.message.reply_text("Name is required and cannot be skipped. Please enter your name:")
            return
        context.user_data.pop(STATE_AWAITING_NAME, None)
        await _save_name(update, context, text)

    elif context.user_data.get(STATE_AWAITING_AGE):
        if text.lower() == "skip":
            user = get_user(str(update.effective_user.id))
            if getattr(user, "age", None):
                context.user_data.pop(STATE_AWAITING_AGE, None)
                if context.user_data.get(STATE_PROFILE_SETUP) is not None:
                    await _next_profile_step(update, context)
                else:
                    await prompt_for_next_missing_field(update, context, str(update.effective_user.id))
                return
            await update.message.reply_text("Age is required and cannot be skipped. Please enter your age:")
            return
        success = await _save_age(update, context, text)
        if success:
            context.user_data.pop(STATE_AWAITING_AGE, None)

    elif context.user_data.get("awaiting_gender"):
        if text.lower() == "skip":
            await update.message.reply_text("Gender is required and cannot be skipped. Please choose an option.")
            return
        await process_gender_selection(update, context, text)

    elif context.user_data.get(STATE_AWAITING_BIO):
        if text.lower() == "skip":
            context.user_data.pop(STATE_AWAITING_BIO, None)

            skipped = context.user_data.get("skipped_profile_fields", {})
            if isinstance(skipped, list):
                skipped = {f: time.time() for f in skipped}

            skipped["bio"] = time.time()
            context.user_data["skipped_profile_fields"] = skipped

            await prompt_for_next_missing_field(update, context, user_id)
            return
        success = await _save_bio(update, context, text)
        if success:
            context.user_data.pop(STATE_AWAITING_BIO, None)

    elif context.user_data.get(STATE_AWAITING_INTERESTS):
        if text.lower() == "skip":
            context.user_data.pop(STATE_AWAITING_INTERESTS, None)

            skipped = context.user_data.get("skipped_profile_fields", {})
            if isinstance(skipped, list):
                skipped = {f: time.time() for f in skipped}

            skipped["interests"] = time.time()
            context.user_data["skipped_profile_fields"] = skipped

            await prompt_for_next_missing_field(update, context, user_id)
            return
        success = await _save_interests(update, context, text)
        if success:
            context.user_data.pop(STATE_AWAITING_INTERESTS, None)
    elif context.user_data.get(STATE_AWAITING_GENDER_PREF):
        choice = text.strip().lower()
        if choice == "cancel":
            clear_conversation_state(context)
            context.user_data.pop(STATE_PROFILE_SETUP, None)
            context.user_data.pop(STATE_ADHOC_CONTINUE, None)
            await update.message.reply_text(
                "Gender preference update canceled.",
                reply_markup=main_menu(),
            )
            return
        if choice == "skip":
            await update.message.reply_text(
                "Gender preference is required and cannot be skipped. Please choose an option."
            )
            return
        mapping = {
            "men": [Gender.MALE],
            "women": [Gender.FEMALE],
            "both": [Gender.MALE, Gender.FEMALE],
        }
        if choice not in mapping:
            await update.message.reply_text("Please choose Men, Women, or Both.")
            return
        try:
            u = get_user(user_id)
            prefs = getattr(u, "preferences", None)
            if not isinstance(prefs, Preferences):
                prefs = Preferences()
            prefs.gender_preference = mapping[choice]
            update_user_preferences(user_id, prefs)
            context.user_data.pop(STATE_AWAITING_GENDER_PREF, None)
            await update.message.reply_text(GENDER_PREF_UPDATED_MESSAGE)

            if context.user_data.get(STATE_PROFILE_SETUP) is not None:
                await _next_profile_step(update, context)
            else:
                await prompt_for_next_missing_field(update, context, user_id)
        except Exception as e:
            logger.error("Error updating gender preference", user_id=user_id, error=str(e), exc_info=e)
            await update.message.reply_text("Sorry, something went wrong. Please try again.")
    elif context.user_data.get(STATE_AWAITING_PHOTO):
        await update.message.reply_text("Please send a photo.")

    elif context.user_data.get("awaiting_location"):
        if text.lower() == "skip":
            context.user_data.pop("awaiting_location", None)

            skipped = context.user_data.get("skipped_profile_fields", {})
            if isinstance(skipped, list):
                skipped = {f: time.time() for f in skipped}

            skipped["location"] = time.time()
            context.user_data["skipped_profile_fields"] = skipped

            await prompt_for_next_missing_field(update, context, user_id)
            return
        await process_manual_location(update, context, text)
    else:
        # Opportunistic manual location parsing when user types "City, Country"
        if "," in text:
            parts = [p.strip() for p in text.split(",")]
            if len(parts) >= 2 and parts[0] and parts[1]:
                await process_manual_location(update, context, text)
                return

        # Default response for unhandled text
        await update.message.reply_text(
            "I didn't understand that. Please use the menu commands or /help to see what I can do.",
            reply_markup=main_menu(),
        )


@authenticated
async def photo_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle photo and video uploads with validation and multi-file support.

    Processes uploaded media, validates size and type, and saves to storage.
    Supports a pending session for uploading multiple files.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    if not update.message or not update.effective_user or context.user_data is None:
        return

    user_id = str(update.effective_user.id)
    user = get_user(user_id)
    has_photos = bool(user.photos and len(user.photos) > 0)
    settings = get_settings()
    file_obj: PhotoSize | Video | None = None
    file_ext = "jpg"
    file_type = "image"

    if update.message.photo:
        file_obj = update.message.photo[-1]
    elif update.message.video:
        video_obj = update.message.video
        file_obj = video_obj
        file_ext = "mp4"
        file_type = "video"
        if video_obj.mime_type:
            ext = video_obj.mime_type.split("/")[-1]
            if ext:
                file_ext = ext
    else:
        return

    # Initialize pending media list if not exists
    if STATE_PENDING_MEDIA not in context.user_data:
        context.user_data[STATE_PENDING_MEDIA] = []

    pending_media: list[str] = context.user_data[STATE_PENDING_MEDIA]

    # Check if we already have max media
    if len(pending_media) >= settings.MAX_MEDIA_COUNT:
        await update.message.reply_text(
            f"❌ You've already added {settings.MAX_MEDIA_COUNT} files. "
            f"Press '✅ Done' to save or 'Cancel' to start over.",
            reply_markup=media_upload_keyboard(len(pending_media), settings.MAX_MEDIA_COUNT, allow_done=has_photos),
        )
        return

    try:
        if file_obj is None:
            return
        new_file = await file_obj.get_file()
        byte_array = await new_file.download_as_bytearray()
        file_data = bytes(byte_array)

        # Validate file size first (before saving)
        is_valid_size, size_result = await media_validator.validate_file_size(len(file_data), file_type)
        if not is_valid_size:
            await update.message.reply_text(
                f"❌ {size_result}",
                reply_markup=media_upload_keyboard(len(pending_media), settings.MAX_MEDIA_COUNT, allow_done=has_photos),
            )
            return

        # Validate image dimensions (only for images, before saving)
        if file_type == "image":
            is_valid_image, image_result = await media_validator.validate_image(file_data)
            if not is_valid_image:
                await update.message.reply_text(
                    f"❌ {image_result}",
                    reply_markup=media_upload_keyboard(
                        len(pending_media), settings.MAX_MEDIA_COUNT, allow_done=has_photos
                    ),
                )
                return

        # Save the media file only after all validations pass
        saved_path = save_media(file_data, user_id, file_ext)
        pending_media.append(saved_path)
        context.user_data[STATE_PENDING_MEDIA] = pending_media

        media_count = len(pending_media)
        remaining = settings.MAX_MEDIA_COUNT - media_count

        # Success message
        success_msg = f"✅ {file_type.capitalize()} added ({media_count}/{settings.MAX_MEDIA_COUNT})!\n\n"
        if remaining > 0:
            success_msg += "Send more files or press '✅ Done' to save your profile media."
        else:
            success_msg += "Maximum reached. Press '✅ Done' to save your profile media."

        await update.message.reply_text(
            success_msg,
            reply_markup=media_upload_keyboard(media_count, settings.MAX_MEDIA_COUNT, allow_done=has_photos),
        )

    except Exception as e:
        logger.error("Error processing media", user_id=user_id, error=str(e))
        await update.message.reply_text(
            "❌ Failed to process media. Please try again.",
            reply_markup=media_upload_keyboard(len(pending_media), settings.MAX_MEDIA_COUNT, allow_done=has_photos),
        )


VIEW_PROFILE_TEMPLATE = """
👤 {name}, {age}
⚧ {gender}

📸 Media: {media_count} item(s)

📝 {bio}

🌟 Interests: {interests}

📍 {location}
"""


async def view_profile_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle viewing another user's profile from a match or list.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The context object.
    """
    if not update.callback_query:
        return

    query = update.callback_query
    # We must answer callback queries
    # However, if we're sending a media group, the original message might be deleted/modified
    # so we should answer quickly.
    await query.answer()

    data = query.data
    if not data or not data.startswith("view_profile_"):
        return

    target_user_id = data.split("_")[-1]

    try:
        target_user = get_user(target_user_id)

        profile_text = VIEW_PROFILE_TEMPLATE.format(
            name=sanitize_html(target_user.first_name),
            age=target_user.age,
            gender=sanitize_html(
                target_user.gender.value.capitalize()
                if isinstance(target_user.gender, Gender)
                else (target_user.gender or "Not specified")
            ),
            media_count=len(target_user.photos) if target_user.photos else 0,
            bio=sanitize_html(target_user.bio or "No bio yet."),
            interests=sanitize_html(
                ", ".join(target_user.interests) if target_user.interests else "No interests listed."
            ),
            location=sanitize_html(get_user_location_text(target_user.id) or "Location hidden"),
        )

        # We can add a "Back" button that goes back to matches list
        keyboard = [[InlineKeyboardButton("🔙 Back to Matches", callback_data="back_to_matches")]]
        reply_markup = InlineKeyboardMarkup(keyboard)

        # If user has photos, send them as a media group (or single photo)
        if target_user.photos and len(target_user.photos) > 0:
            media_group: List[Union[InputMediaPhoto, InputMediaVideo]] = []
            opened_files = []
            storage_path = get_storage_path()

            try:
                for photo_path in target_user.photos:
                    full_path = storage_path / photo_path
                    if full_path.exists():
                        f = open(full_path, "rb")
                        opened_files.append(f)
                        # Determine type based on extension (simple check)
                        # Our save_media logic ensures jpg for images, but let's be safe
                        if full_path.suffix.lower() in [".jpg", ".jpeg", ".png"]:
                            # For local files, we open them
                            media_group.append(InputMediaPhoto(media=f))
                        elif full_path.suffix.lower() in [".mp4", ".mov", ".avi"]:
                            media_group.append(InputMediaVideo(media=f))

                if media_group:
                    # Add caption to the first item
                    media_group[0].caption = profile_text

                    # Delete the previous message (menu) to show media cleanly
                    # Or we can just send new messages.
                    # Standard UX: User clicked "View Profile", so we replace the list with profile details.
                    # Sending media group is a new message operation usually.

                    # Option A: Delete previous message and send media group
                    try:
                        await query.delete_message()
                    except Exception:
                        pass  # Message might be too old or already deleted

                    if query.message and hasattr(query.message, "chat_id"):
                        chat_id = cast(Message, query.message).chat_id
                        await context.bot.send_media_group(chat_id=chat_id, media=media_group)

                    # Send the buttons as a separate message because media groups can't have inline keyboards easily
                    # attached to the whole group in a way that persists navigation well.
                    # Actually, InputMedia supports caption but not inline keyboard for the group as a whole in the same way.
                    # Best practice: Send media group, then send a text message with controls (or attached to the last item?)
                    # Telegram API limitation: send_media_group returns a list of messages.

                    if query.message and hasattr(query.message, "chat_id"):
                        chat_id = cast(Message, query.message).chat_id
                        await context.bot.send_message(
                            chat_id=chat_id,
                            text="Use the button below to go back.",
                            reply_markup=reply_markup,
                        )
                else:
                    # Photos listed but files missing? Fallback to text
                    await query.edit_message_text(text=profile_text, reply_markup=reply_markup)
            finally:
                for f in opened_files:
                    f.close()
        else:
            # No photos, just text
            await query.edit_message_text(text=profile_text, reply_markup=reply_markup)

    except Exception as e:
        logger.error("Error viewing profile", target_user_id=target_user_id, error=str(e))
        # If we fail, try to edit the message to show error
        try:
            await query.edit_message_text("Could not load profile. Please try again.")
        except Exception:
            pass  # Silently ignore if we can't send the error message
