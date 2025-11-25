"""Profile management handlers for the MeetMatch bot."""

# TODO: Post-Cloudflare Migration Review
# These handlers rely on the service layer (e.g., user_service, conversation_service).
# After the service layer is refactored to use Cloudflare D1/KV/R2:
# 1. Review how Cloudflare bindings/context ('env') are passed to service calls, if needed.
# 2. Update error handling if D1/KV/R2 exceptions differ from previous DB/cache exceptions.
# 3. Check if data structures returned by service calls have changed.
# 4. Ensure photo handling logic aligns with R2 implementation in user_service.

from telegram import ReplyKeyboardMarkup, Update, KeyboardButton
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated, user_command_limiter
from src.models.user import Gender
from src.services.user_service import get_user, update_user, get_user_location_text
from src.bot.handlers.match import match_command
from src.services.geocoding_service import geocode_city, reverse_geocode_coordinates
from src.utils.logging import get_logger
from src.bot.ui.keyboards import (
    main_menu,
    profile_main_menu,
    cancel_keyboard,
    skip_keyboard,
    skip_cancel_keyboard,
    gender_keyboard,
    gender_optional_keyboard,
    location_keyboard,
    location_optional_keyboard,
)

logger = get_logger(__name__)

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
LOCATION_UPDATE_MESSAGE = "Where are you located? Share your location or type 'City, Country' (e.g., 'Berlin, Germany'):"

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


def get_missing_required_fields(user) -> list:
    """Get list of missing required fields for a user."""
    missing = []
    if not user.first_name:
        missing.append("name")
    if not user.age:
        missing.append("age")
    return missing


def get_missing_recommended_fields(user) -> list:
    """Get list of missing recommended fields for a user."""
    missing = []
    if not user.gender:
        missing.append("gender")
    if not user.bio:
        missing.append("bio")
    if not getattr(user, 'interests', None) or len(user.interests) == 0:
        missing.append("interests")
    if not user.location or not user.location.city:
        missing.append("location")
    return missing


def check_and_update_profile_complete(user_id: str, context: ContextTypes.DEFAULT_TYPE = None) -> bool:
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
        if context:
            context.user_data["user"] = user
        return True
    elif not is_complete and user.is_profile_complete:
        update_user(user_id, {"is_profile_complete": False})
        user = get_user(user_id)
        if context:
            context.user_data["user"] = user
    elif context:
        context.user_data["user"] = user
    
    return is_complete


STATE_ADHOC_CONTINUE = "adhoc_continue_profile"


async def prompt_for_next_missing_field(update: Update, context: ContextTypes.DEFAULT_TYPE, user_id: str) -> bool:
    """Prompt user for the next missing required or recommended field (ad-hoc mode).
    
    Returns True if there was a missing field to prompt for, False if profile is complete.
    This is for single field edits, NOT the guided setup flow.
    """
    user = get_user(user_id)
    missing_required = get_missing_required_fields(user)
    missing_recommended = get_missing_recommended_fields(user)
    
    if not missing_required:
        context.user_data.pop(STATE_ADHOC_CONTINUE, None)
        check_and_update_profile_complete(user_id, context)
        
        if not missing_recommended:
            await update.message.reply_text(
                "🎉 Your profile is fully complete! You can start matching with /match!",
                reply_markup=ReplyKeyboardMarkup(
                    [["/profile", "/match"], ["/matches", "/help"]],
                    resize_keyboard=True,
                ),
            )
        else:
            missing_labels = [f.capitalize() for f in missing_recommended]
            await update.message.reply_text(
                f"✅ Your profile is ready for matching! You can start with /match now.\n\n"
                f"Optional fields you can still add: {', '.join(missing_labels)}\n"
                f"Use /profile to add them anytime!",
                reply_markup=ReplyKeyboardMarkup(
                    [["/profile", "/match"], ["/matches", "/help"]],
                    resize_keyboard=True,
                ),
            )
        return False
    
    context.user_data[STATE_ADHOC_CONTINUE] = True
    
    next_field = missing_required[0]
    field_label = next_field.capitalize()
    await update.message.reply_text(
        f"Your profile still needs: {field_label}\n\nLet's complete it now!",
    )
    
    if next_field == "name":
        context.user_data[STATE_AWAITING_NAME] = True
        await update.message.reply_text(NAME_UPDATE_MESSAGE, reply_markup=ReplyKeyboardMarkup([["Cancel"]], resize_keyboard=True))
    elif next_field == "age":
        context.user_data[STATE_AWAITING_AGE] = True
        await update.message.reply_text(AGE_UPDATE_MESSAGE, reply_markup=ReplyKeyboardMarkup([["Cancel"]], resize_keyboard=True))
    
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

    user_id = str(update.effective_user.id)
    user = get_user(user_id)

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
    prompt = NAME_UPDATE_MESSAGE if not has_name else f"{NAME_UPDATE_MESSAGE}\n\nCurrent: {user.first_name}\nType 'Skip' to keep the current value."
    await update.message.reply_text(
        prompt,
        reply_markup=(skip_cancel_keyboard("Type your name") if has_name else cancel_keyboard("Type your name")),
    )


async def _save_name(update: Update, context: ContextTypes.DEFAULT_TYPE, name: str) -> None:
    """Save the user's name."""
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
    prompt = AGE_UPDATE_MESSAGE if not has_age else f"{AGE_UPDATE_MESSAGE}\n\nCurrent: {user.age}\nType 'Skip' to keep the current value."
    await update.message.reply_text(
        prompt,
        reply_markup=(skip_cancel_keyboard("Enter a number 10-65") if has_age else cancel_keyboard("Enter a number 10-65")),
    )


async def _save_age(update: Update, context: ContextTypes.DEFAULT_TYPE, age_str: str) -> bool:
    """Save the user's age. Returns True if successful."""
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

    message_text = update.message.text.strip()

    # Check if command includes the gender
    if message_text == "/gender":
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        cur = None
        try:
            cur = user.gender.name.capitalize() if getattr(user, "gender", None) and hasattr(user.gender, "name") else (str(user.gender) if getattr(user, "gender", None) else None)
        except Exception:
            cur = str(getattr(user, "gender", "")) or None
        prompt = GENDER_UPDATE_MESSAGE if not cur else f"{GENDER_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
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
    # Check if we're awaiting gender selection
    if not context.user_data.get("awaiting_gender"):
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
    user_id = str(update.effective_user.id)
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
    prompt = BIO_UPDATE_MESSAGE if not cur else f"{BIO_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
    await update.message.reply_text(
        prompt,
        reply_markup=skip_keyboard("Write a short bio"),
    )


async def _save_bio(update: Update, context: ContextTypes.DEFAULT_TYPE, bio: str) -> bool:
    """Save the user's bio. Returns True if successful."""
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
    prompt = INTERESTS_UPDATE_MESSAGE if not cur else f"{INTERESTS_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
    await update.message.reply_text(
        prompt,
        reply_markup=skip_keyboard("music, travel, cooking"),
    )


async def _save_interests(update: Update, context: ContextTypes.DEFAULT_TYPE, interests_text: str) -> bool:
    """Save the user's interests. Returns True if successful."""
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

    str(update.effective_user.id)
    message_text = update.message.text.strip()

    # Always prompt for location interactively, ignoring any inline arguments
    if message_text.startswith("/location"):
        user_id = str(update.effective_user.id)
        cur = get_user_location_text(user_id)
        prompt = LOCATION_UPDATE_MESSAGE if not cur else f"{LOCATION_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
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

    user_id = str(update.effective_user.id)
    in_profile_setup = context.user_data.get(STATE_PROFILE_SETUP) is not None

    try:
        location = update.message.location
        latitude = location.latitude
        longitude = location.longitude

        geo = await reverse_geocode_coordinates(latitude, longitude)

        location_data = {
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
    user_id = str(update.effective_user.id)
    in_profile_setup = context.user_data.get(STATE_PROFILE_SETUP) is not None
    
    if location_text.lower() == "skip":
        context.user_data.pop("awaiting_location", None)
        if in_profile_setup:
            await _next_profile_step(update, context)
        else:
            await prompt_for_next_missing_field(update, context, user_id)
        return

    try:
        raw = location_text.strip()
        if not raw:
            await update.message.reply_text("Please type 'City, Country' (e.g., 'Berlin, Germany') or share your location:")
            return

        if "," not in raw:
            await update.message.reply_text("Please use the format 'City, Country' (e.g., 'Berlin, Germany') or share your location using the button.")
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

        location_data = {
            "location_latitude": geo["latitude"],
            "location_longitude": geo["longitude"],
            "location_city": geo["city"],
            "location_country": geo["country"],
        }

        update_user(user_id, location_data)
        user = get_user(user_id)
        context.user_data["user"] = user
        await update.message.reply_text(
            LOCATION_UPDATED_MESSAGE.format(location=f"{location_data['location_city']}, {location_data['location_country']}")
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


def clear_conversation_state(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Clear all conversation states."""
    states_to_clear = [
        STATE_AWAITING_NAME,
        STATE_AWAITING_AGE,
        STATE_AWAITING_BIO,
        STATE_AWAITING_INTERESTS,
        STATE_ADHOC_CONTINUE,
        "awaiting_gender",
        "awaiting_location",
    ]
    for state in states_to_clear:
        context.user_data.pop(state, None)


PROFILE_STEPS = ["name", "age", "gender", "bio", "interests", "location"]


async def _next_profile_step(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Move to the next step in profile setup."""
    current_step = context.user_data.get(STATE_PROFILE_SETUP, 0)
    next_step = current_step + 1
    
    if next_step >= len(PROFILE_STEPS):
        # Profile setup complete
        context.user_data.pop(STATE_PROFILE_SETUP, None)
        clear_conversation_state(context)
        
        user_id = str(update.effective_user.id)
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
    
    # Trigger the appropriate command
    if step_name == "name":
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        has_name = bool(getattr(user, "first_name", None))
        context.user_data[STATE_AWAITING_NAME] = True
        prompt = NAME_UPDATE_MESSAGE if not has_name else f"{NAME_UPDATE_MESSAGE}\n\nCurrent: {user.first_name}\nType 'Skip' to keep the current value."
        await update.message.reply_text(
            prompt,
            reply_markup=(skip_cancel_keyboard("Type your name") if has_name else cancel_keyboard("Type your name")),
        )
    elif step_name == "age":
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        has_age = bool(getattr(user, "age", None))
        context.user_data[STATE_AWAITING_AGE] = True
        prompt = AGE_UPDATE_MESSAGE if not has_age else f"{AGE_UPDATE_MESSAGE}\n\nCurrent: {user.age}\nType 'Skip' to keep the current value."
        await update.message.reply_text(
            prompt,
            reply_markup=(skip_cancel_keyboard("Enter a number 10-65") if has_age else cancel_keyboard("Enter a number 10-65")),
        )
    elif step_name == "gender":
        context.user_data["awaiting_gender"] = True
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        cur = None
        try:
            cur = user.gender.name.capitalize() if getattr(user, "gender", None) and hasattr(user.gender, "name") else (str(user.gender) if getattr(user, "gender", None) else None)
        except Exception:
            cur = str(getattr(user, "gender", "")) or None
        prompt = GENDER_UPDATE_MESSAGE if not cur else f"{GENDER_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
        await update.message.reply_text(
            prompt,
            reply_markup=gender_optional_keyboard(),
        )
    elif step_name == "bio":
        context.user_data[STATE_AWAITING_BIO] = True
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        cur = getattr(user, "bio", None)
        prompt = BIO_UPDATE_MESSAGE if not cur else f"{BIO_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
        await update.message.reply_text(prompt, reply_markup=skip_keyboard("Optional - you can Skip"))
    elif step_name == "interests":
        context.user_data[STATE_AWAITING_INTERESTS] = True
        user_id = str(update.effective_user.id)
        user = get_user(user_id)
        cur_list = getattr(user, "interests", []) or []
        cur = ", ".join(cur_list) if cur_list else None
        prompt = INTERESTS_UPDATE_MESSAGE if not cur else f"{INTERESTS_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
        await update.message.reply_text(prompt, reply_markup=skip_keyboard("Optional - you can Skip"))
    elif step_name == "location":
        context.user_data["awaiting_location"] = True
        user_id = str(update.effective_user.id)
        cur = get_user_location_text(user_id)
        prompt = LOCATION_UPDATE_MESSAGE if not cur else f"{LOCATION_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
        await update.message.reply_text(
            prompt,
            reply_markup=(location_optional_keyboard() if cur else location_keyboard()),
        )


async def start_profile_setup(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Start the guided profile setup flow."""
    clear_conversation_state(context)
    context.user_data[STATE_PROFILE_SETUP] = -1  # Will be incremented to 0
    
    await update.message.reply_text(
        "Let's set up your profile! I'll guide you through each step.\n\nYou can type 'Skip' to skip optional fields or 'Cancel' to stop at any time.",
    )
    
    await _next_profile_step(update, context)


@authenticated
async def handle_text_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle text messages when awaiting user input."""
    if not update.message or not update.message.text:
        return
    
    text = update.message.text.strip()

    if context.user_data.get(STATE_PROFILE_MENU):
        if text.startswith("1") or text == "🔎 Browse Profiles":
            await match_command(update, context)
            return
        if text == "2" or text == "🛠 Edit Profile":
            context.user_data.pop(STATE_PROFILE_MENU, None)
            await start_profile_setup(update, context)
            return
        if text == "3" or text == "🖼 Update Photo":
            context.user_data.pop(STATE_PROFILE_MENU, None)
            context.user_data[STATE_AWAITING_PHOTO] = True
            await update.message.reply_text("Send a photo to update your profile.")
            return
        if text == "4" or text == "✏️ Update Bio":
            context.user_data.pop(STATE_PROFILE_MENU, None)
            context.user_data[STATE_AWAITING_BIO] = True
            user_id = str(update.effective_user.id)
            user = get_user(user_id)
            cur = getattr(user, "bio", None)
            prompt = BIO_UPDATE_MESSAGE if not cur else f"{BIO_UPDATE_MESSAGE}\n\nCurrent: {cur}\nType 'Skip' to keep the current value."
            await update.message.reply_text(prompt)
            return
    
    # Handle cancel
    if text.lower() == "cancel":
        clear_conversation_state(context)
        context.user_data.pop(STATE_PROFILE_SETUP, None)
        context.user_data.pop(STATE_ADHOC_CONTINUE, None)
        await update.message.reply_text(
            "Cancelled. Use /profile to see your profile or continue editing.",
            reply_markup=main_menu(),
        )
        return
    
    # Handle skip (for optional fields in profile setup or adhoc continue mode)
    if text.lower() == "skip":
        in_profile_setup = context.user_data.get(STATE_PROFILE_SETUP) is not None
        in_adhoc_mode = context.user_data.get(STATE_ADHOC_CONTINUE)
        
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
            
            if step_name == "gender":
                context.user_data.pop("awaiting_gender", None)
            elif step_name == "bio":
                context.user_data.pop(STATE_AWAITING_BIO, None)
            elif step_name == "interests":
                context.user_data.pop(STATE_AWAITING_INTERESTS, None)
            elif step_name == "location":
                context.user_data.pop("awaiting_location", None)
            
            await _next_profile_step(update, context)
            return
        elif in_adhoc_mode:
            user_id = str(update.effective_user.id)
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
            await prompt_for_next_missing_field(update, context, user_id)
            return
        await process_gender_selection(update, context, text)
        
    elif context.user_data.get(STATE_AWAITING_BIO):
        if text.lower() == "skip":
            context.user_data.pop(STATE_AWAITING_BIO, None)
            await prompt_for_next_missing_field(update, context, user_id)
            return
        success = await _save_bio(update, context, text)
        if success:
            context.user_data.pop(STATE_AWAITING_BIO, None)
        
    elif context.user_data.get(STATE_AWAITING_INTERESTS):
        if text.lower() == "skip":
            context.user_data.pop(STATE_AWAITING_INTERESTS, None)
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
            await prompt_for_next_missing_field(update, context, user_id)
            return
        await process_manual_location(update, context, text)
    else:
        # Opportunistic manual location parsing when user types "City, Country"
        if "," in text:
            parts = [p.strip() for p in text.split(",")]
            if len(parts) >= 2 and parts[0] and parts[1]:
                await process_manual_location(update, context, text)

@authenticated
async def photo_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.message or not update.message.photo:
        return
    user_id = str(update.effective_user.id)
    file_id = update.message.photo[-1].file_id
    user = get_user(user_id)
    photos = list(user.photos or [])
    photos.append(file_id)
    photos = photos[-6:]
    update_user(user_id, {"photos": photos})
    context.user_data.pop(STATE_AWAITING_PHOTO, None)
    context.user_data["user"] = get_user(user_id)
    await update.message.reply_text("✅ Profile photo updated.")
