"""Profile management handlers for the MeetMatch bot."""

import time
from typing import Any, List, Union, cast

from telegram import (
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
    location_keyboard,
    location_optional_keyboard,
    main_menu,
    profile_main_menu,
    skip_cancel_keyboard,
    skip_keyboard,
)
from src.config import settings
from src.models.user import Gender, User
from src.services.geocoding_service import geocode_city, reverse_geocode_coordinates
from src.services.user_service import get_user, get_user_location_text, set_user_sleeping, update_user
from src.utils.cache import delete_cache, set_cache
from src.utils.logging import get_logger
from src.utils.media import delete_media, get_storage_path, save_media

logger = get_logger(__name__)

USER_EDITING_STATE_KEY = "user:editing:{user_id}"


def set_user_editing_state(user_id: str, is_editing: bool) -> None:
    """Set the user's editing state in Redis."""
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
STATE_PROFILE_SETUP = "profile_setup_step"
STATE_PROFILE_MENU = "profile_menu"
STATE_AWAITING_PHOTO = "awaiting_photo"

# Confirmation messages
NAME_UPDATED_MESSAGE = "✅ Name updated to: {name}"
AGE_UPDATED_MESSAGE = "✅ Age updated to: {age}"
GENDER_UPDATED_MESSAGE = "✅ Gender updated to: {gender}"
BIO_UPDATED_MESSAGE = "✅ Bio updated"
INTERESTS_UPDATED_MESSAGE = "✅ Interests updated"
LOCATION_UPDATED_MESSAGE = "✅ Location updated to: {location}"

# Required fields for profile completion (users cannot match without these)
REQUIRED_FIELDS = ["name", "age"]
# Recommended fields for better matching
RECOMMENDED_FIELDS = ["gender", "bio", "interests", "location"]


def get_missing_required_fields(user: User) -> list[str]:
    """Get list of missing required fields for a user."""
    missing = []
    if not user.first_name:
        missing.append("name")
    if not user.age:
        missing.append("age")
    if not user.photos or len(user.photos) < 1:
        missing.append("photos")
    return missing


def get_missing_recommended_fields(user: User) -> list[str]:
    """Get list of missing recommended fields for a user."""
    missing = []
    if not user.gender:
        missing.append("gender")
    if not user.bio:
        missing.append("bio")
    if not getattr(user, "interests", None) or len(user.interests) == 0:
        missing.append("interests")
    if not user.location or not user.location.city:
        missing.append("location")
    return missing


def check_and_update_profile_complete(user_id: str, context: ContextTypes.DEFAULT_TYPE | None = None) -> bool:
    """Check if profile is complete and update the flag if needed.

    Profile is considered complete when all REQUIRED fields are filled.
    Recommended fields are optional and don't block matching.

    If context is provided, also refreshes context.user_data["user"].

    Returns True if profile is now complete.
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


async def prompt_for_next_missing_field(
    update: Update, context: ContextTypes.DEFAULT_TYPE, user_id: str, silent_if_complete: bool = False
) -> bool:
    """Prompt user for the next missing required or recommended field (ad-hoc mode).

    Args:
        update: The update object
        context: The context object
        user_id: The user ID
        silent_if_complete: If True, don't send "Profile complete" message when returning False.

    Returns True if there was a missing field to prompt for, False if profile is complete (or cooldown active).
    This is for single field edits, NOT the guided setup flow.
    """
    if context.user_data is None:
        logger.error("context.user_data is None in prompt_for_next_missing_field")
        return False
    if not update.effective_message:
        logger.error("update.effective_message is None in prompt_for_next_missing_field")
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

        if remaining_recommended:
            next_field = remaining_recommended[0]
            field_label = next_field.capitalize()

            # Allow skipping bio if it's the only thing missing?
            # But let's prompt for it as part of the flow.

            context.user_data[STATE_ADHOC_CONTINUE] = True

            if next_field == "gender":
                context.user_data["awaiting_gender"] = True
                await update.effective_message.reply_text(GENDER_UPDATE_MESSAGE, reply_markup=gender_keyboard())
                return True
            elif next_field == "bio":
                context.user_data[STATE_AWAITING_BIO] = True
                await update.effective_message.reply_text(
                    BIO_UPDATE_MESSAGE, reply_markup=skip_keyboard("Write a short bio")
                )
                return True
            elif next_field == "interests":
                context.user_data[STATE_AWAITING_INTERESTS] = True
                await update.effective_message.reply_text(
                    INTERESTS_UPDATE_MESSAGE, reply_markup=skip_keyboard("music, travel, cooking")
                )
                return True
            elif next_field == "location":
                context.user_data["awaiting_location"] = True
                await update.effective_message.reply_text(LOCATION_UPDATE_MESSAGE, reply_markup=location_keyboard())
                return True

        # All fields (required + recommended) are done or skipped
        if not silent_if_complete:
            await update.effective_message.reply_text(
                "🎉 Your profile is fully complete! You can start matching with /match!",
                reply_markup=main_menu(),
            )
        return False

    context.user_data[STATE_ADHOC_CONTINUE] = True

    next_field = missing_required[0]
    field_label = next_field.capitalize()
    await update.effective_message.reply_text(
        f"Your profile still needs: {field_label}\n\nLet's complete it now!",
    )

    if next_field == "name":
        context.user_data[STATE_AWAITING_NAME] = True
        await update.effective_message.reply_text(
            NAME_UPDATE_MESSAGE, reply_markup=ReplyKeyboardMarkup([["Cancel"]], resize_keyboard=True)
        )
    elif next_field == "age":
        context.user_data[STATE_AWAITING_AGE] = True
        await update.effective_message.reply_text(
            AGE_UPDATE_MESSAGE, reply_markup=ReplyKeyboardMarkup([["Cancel"]], resize_keyboard=True)
        )
    elif next_field == "photos":
        context.user_data[STATE_AWAITING_PHOTO] = True
        await update.effective_message.reply_text(
            "Please upload at least one photo or video to complete your profile! 📸",
            reply_markup=ReplyKeyboardMarkup([["Cancel"]], resize_keyboard=True),
        )

    return True


@authenticated
async def profile_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /profile command.

    Args:
        update: The update object
        context: The context object
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
    """Handle the /name command.

    Args:
        update: The update object
        context: The context object
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
    """Save the user's name."""
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
    """Handle the /age command.

    Args:
        update: The update object
        context: The context object
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


async def _save_age(update: Update, context: ContextTypes.DEFAULT_TYPE, age_str: str) -> bool:
    """Save the user's age. Returns True if successful."""
    if not update.effective_user or not update.message or context.user_data is None:
        return False

    user_id = str(update.effective_user.id)

    try:
        age = int(age_str)

        if age < 10 or age > 65:
            await update.message.reply_text("Age must be between 10 and 65. Please try again:")
            return False

        update_user(user_id, {"age": age})
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
    """Handle the /gender command.

    Args:
        update: The update object
        context: The context object
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
    """Handle gender selection from keyboard.

    Args:
        update: The update object
        context: The context object
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

    # Clear conversation state
    context.user_data.pop("awaiting_gender", None)


async def process_gender_selection(update: Update, context: ContextTypes.DEFAULT_TYPE, gender_str: str) -> None:
    """Process gender selection.

    Args:
        update: The update object
        context: The context object
        gender_str: Selected gender string
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
        context.user_data.pop("awaiting_gender", None)
        if in_profile_setup:
            await _next_profile_step(update, context)
        else:
            await prompt_for_next_missing_field(update, context, user_id)
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
    """Handle the /bio command.

    Args:
        update: The update object
        context: The context object
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
    """Save the user's bio. Returns True if successful."""
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
    """Handle the /interests command.

    Args:
        update: The update object
        context: The context object
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
    """Save the user's interests. Returns True if successful."""
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
    """Handle the /location command.

    Args:
        update: The update object
        context: The context object
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
        context.user_data["awaiting_location"] = True
        return


@authenticated
async def location_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle location sharing.

    Args:
        update: The update object
        context: The context object
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

        location_data: dict[str, Any] = {
            "location_latitude": latitude,
            "location_longitude": longitude,
            "location_city": (geo or {}).get("city") or "Unknown City",
            "location_country": (geo or {}).get("country") or "Unknown Country",
        }

        update_user(user_id, location_data)
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
    """Process manual location entry.

    Args:
        update: The update object
        context: The context object
        location_text: Location text
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

        update_user(user_id, location_data)
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
    """Clear all conversation states."""
    if context.user_data is None:
        return
    states_to_clear = [
        STATE_AWAITING_NAME,
        STATE_AWAITING_AGE,
        STATE_AWAITING_BIO,
        STATE_AWAITING_INTERESTS,
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


PROFILE_STEPS = ["name", "age", "gender", "bio", "interests", "location"]


async def _next_profile_step(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Move to the next step in profile setup."""
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


async def start_profile_setup(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Start the guided profile setup flow."""
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
    """Handle text messages when awaiting user input."""
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
                name=user.first_name,
                age=user.age,
                gender=user.gender.value.capitalize()
                if isinstance(user.gender, Gender)
                else (user.gender or "Not specified"),
                media_count=len(user.photos) if user.photos else 0,
                bio=user.bio or "No bio yet.",
                interests=", ".join(user.interests) if user.interests else "No interests listed.",
                location=get_user_location_text(user.id) or "Location hidden",
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
            set_user_editing_state(str(update.effective_user.id), True)
            await update.message.reply_text("Send a photo to update your profile.")
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
        # Ensure user is active so they stay in the cycle (visible to others)
        update_user(user_id, {"is_active": True})

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

    # Handle cancel
    if text.lower() == "cancel":
        clear_conversation_state(context, user_id=str(update.effective_user.id))
        context.user_data.pop(STATE_PROFILE_SETUP, None)
        context.user_data.pop(STATE_ADHOC_CONTINUE, None)
        await update.message.reply_text(
            "Cancelled. Use /profile to see your profile or continue editing.",
            reply_markup=main_menu(),
        )
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

            skipped = context.user_data.get("skipped_profile_fields", {})
            if isinstance(skipped, list):
                skipped = {f: time.time() for f in skipped}

            if step_name == "gender":
                context.user_data.pop("awaiting_gender", None)
                skipped["gender"] = time.time()
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
                skipped["gender"] = time.time()
                field_skipped = True
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
            context.user_data.pop("awaiting_gender", None)

            skipped = context.user_data.get("skipped_profile_fields", {})
            if isinstance(skipped, list):
                skipped = {f: time.time() for f in skipped}

            skipped["gender"] = time.time()
            context.user_data["skipped_profile_fields"] = skipped

            await prompt_for_next_missing_field(update, context, user_id)
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
    """Handle photo and video uploads."""
    if not update.message or not update.effective_user or context.user_data is None:
        return

    user_id = str(update.effective_user.id)
    file_obj: PhotoSize | Video | None = None
    file_ext = "jpg"

    if update.message.photo:
        file_obj = update.message.photo[-1]
    elif update.message.video:
        video_obj = update.message.video
        file_obj = video_obj
        file_ext = "mp4"  # Default video ext
        if video_obj.mime_type:
            ext = video_obj.mime_type.split("/")[-1]
            if ext:
                file_ext = ext
    else:
        return

    try:
        if file_obj is None:
            return
        new_file = await file_obj.get_file()
        byte_array = await new_file.download_as_bytearray()

        saved_path = save_media(bytes(byte_array), user_id, file_ext)

        user = get_user(user_id)
        photos = list(user.photos or [])
        photos.append(saved_path)

        # Enforce max media count (delete oldest)
        if len(photos) > settings.MAX_MEDIA_COUNT:
            removed = photos.pop(0)
            delete_media(removed)

        update_user(user_id, {"photos": photos})

        # Check if profile is now complete (if this was the last missing field)
        if context.user_data.get(STATE_ADHOC_CONTINUE):
            # Re-run prompt logic to check if anything else is missing or show success
            await prompt_for_next_missing_field(update, context, user_id)
        else:
            await update.message.reply_text("✅ Media added to your profile!")

    except Exception as e:
        logger.error("Error saving media", user_id=user_id, error=str(e))
        await update.message.reply_text("Failed to save media. Please try again.")

    context.user_data.pop(STATE_AWAITING_PHOTO, None)
    context.user_data[STATE_PROFILE_MENU] = True
    context.user_data["user"] = get_user(user_id)
    await update.message.reply_text("✅ Profile photo updated.")


VIEW_PROFILE_TEMPLATE = """
👤 {name}, {age}
⚧ {gender}

📸 Media: {media_count} item(s)

📝 {bio}

🌟 Interests: {interests}

📍 {location}
"""


async def view_profile_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle viewing another user's profile."""
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
            name=target_user.first_name,
            age=target_user.age,
            gender=target_user.gender.value.capitalize()
            if isinstance(target_user.gender, Gender)
            else (target_user.gender or "Not specified"),
            media_count=len(target_user.photos) if target_user.photos else 0,
            bio=target_user.bio or "No bio yet.",
            interests=", ".join(target_user.interests) if target_user.interests else "No interests listed.",
            location=get_user_location_text(target_user.id) or "Location hidden",
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
            pass
