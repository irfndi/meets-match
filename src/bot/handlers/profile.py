"""
Handlers for user profile management commands.

Refactoring Notes:
1. Ensure all handlers use async service calls.
2. Add robust error handling using custom exceptions.
3. Check if data structures returned by service calls have changed.
4. Ensure photo handling logic aligns with R2 implementation in user_service.
"""

from telegram import ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
from telegram.ext import ContextTypes

from ...models.user import Gender
from ...services.user_service import get_user, update_user
from ...utils.errors import NotFoundError, ValidationError, ExternalServiceError
from ...utils.location import geocode_location, reverse_geocode_coordinates
from ...utils.logging import get_logger
from ...utils.validators import (
    is_valid_age,
    is_valid_bio,
    is_valid_gender,
    is_valid_interests,
    is_valid_name,
)
from ..middleware.auth import authenticated
from ..middleware.rate_limiter import user_command_limiter

# Local application imports
from .messages import (
    AGE_UPDATE_MESSAGE,
    AGE_UPDATED_MESSAGE,
    BIO_UPDATE_MESSAGE,
    BIO_UPDATED_MESSAGE,
    GENDER_UPDATE_MESSAGE,
    GENDER_UPDATED_MESSAGE,
    GEOCODING_FAILED_MESSAGE,
    INVALID_LOCATION_FORMAT_MESSAGE,
    INTERESTS_UPDATE_MESSAGE,
    INTERESTS_UPDATED_MESSAGE,
    LOCATION_UPDATE_MESSAGE,
    LOCATION_UPDATED_SUCCESS_MESSAGE,
    PROFILE_COMPLETE_MESSAGE,
    PROFILE_INCOMPLETE_MESSAGE,
)

logger = get_logger(__name__)

# Profile command messages


# Field update messages


# Confirmation messages


@authenticated
async def profile_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /profile command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting - Assumes middleware is updated/handles env
    # await user_command_limiter()(update, context)

    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]  # Retrieve env from context

    try:
        user = await get_user(env, user_id)  # Use await and pass env
    except NotFoundError:
        await update.message.reply_text("Could not find your profile. Try /start again.")
        return
    except Exception as e:
        logger.error("Error fetching profile", user_id=user_id, error=str(e), exc_info=True)
        await update.message.reply_text("An error occurred fetching your profile.")
        return

    # Check if profile is complete
    if user.is_profile_complete:
        # Show complete profile
        await update.message.reply_text(
            PROFILE_COMPLETE_MESSAGE.format(
                name=user.first_name,
                age=user.age,
                gender=user.gender.value if user.gender else "Not set",
                bio=user.bio or "Not set",
                interests=", ".join(user.interests) if user.interests else "Not set",
                location=f"{user.location_city}, {user.location_country}" if user.location_city else "Not set",
            ),
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/name", "/age", "/gender"],
                    ["/bio", "/interests", "/location"],
                    ["/match", "/back"],
                ],
                resize_keyboard=True,
            ),
        )
    else:
        # Show incomplete profile with missing fields
        missing_fields = []
        if not user.first_name:
            missing_fields.append(" /name - Set your name")
        if not user.age:
            missing_fields.append(" /age - Set your age")
        if not user.gender:
            missing_fields.append(" /gender - Set your gender")
        if not user.bio:
            missing_fields.append(" /bio - Add a brief bio")
        if not user.interests:
            missing_fields.append(" /interests - Add your interests")
        if not user.location_city:
            missing_fields.append(" /location - Set your location")

        await update.message.reply_text(
            PROFILE_INCOMPLETE_MESSAGE.format(missing_fields="\n".join(missing_fields)),
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/name", "/age", "/gender"],
                    ["/bio", "/interests", "/location"],
                    ["/help", "/back"],
                ],
                resize_keyboard=True,
            ),
        )


@authenticated
@user_command_limiter(scope="profile_update")
async def name_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles the /name command to update the user's first name."""
    env = context.bot_data["env"]
    user_id = str(update.effective_user.id)
    logger = get_logger(__name__)
    logger.info("/name command received", user_id=user_id)

    # Ensure message and text exist
    if not update.message or not update.message.text:
        logger.warning("Update or message text missing for /name", user_id=user_id)
        # Use effective_message here as well for consistency, though unlikely to be triggered
        if update.effective_message:
            await update.effective_message.reply_text("Something went wrong. Could not process your request.")
        return

    parts = update.message.text.split(maxsplit=1)

    if len(parts) < 2:
        await update.effective_message.reply_text("Please provide your name after the command, e.g., /name John")
        return

    name = parts[1].strip()

    try:
        # Validate the name (re-use the validator)
        if not is_valid_name(name):
            # is_valid_name should raise ValidationError, but handle direct False just in case
            await update.effective_message.reply_text("Invalid name format. Please use only letters and spaces.")
            return

        await update_user(env, user_id, {"first_name": name})
        await update.effective_message.reply_text(f"Name updated successfully to {name}!")
        logger.info("User name updated successfully", user_id=user_id, name=name)

    except ValidationError as e:
        logger.warning("Validation error updating name", user_id=user_id, error=str(e))
        await update.effective_message.reply_text(str(e))
    except NotFoundError:
        logger.error("User not found during name update", user_id=user_id)
        await update.effective_message.reply_text("Could not find your profile. Please try /start again.")
    except Exception as e:
        logger.error("Error updating name", user_id=user_id, name=name, error=str(e), exc_info=True)
        await update.effective_message.reply_text(
            "Sorry, something went wrong while updating your name. Please try again later."
        )


@authenticated
@user_command_limiter(scope="profile_update")
async def age_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /age command."""
    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]  # Retrieve env from context

    if not context.args or len(context.args) != 1:
        await update.effective_message.reply_text(AGE_UPDATE_MESSAGE)
        return

    age_str = context.args[0]
    try:
        age = int(age_str)
    except ValueError:
        await update.effective_message.reply_text(
            f"Invalid age: '{age_str}'. Age must be a number.\nUsage: {AGE_UPDATE_MESSAGE}"
        )
        return

    # Validate age
    if not is_valid_age(age):
        await update.effective_message.reply_text(
            f"Invalid age: {age}. Age must be between 18 and 100.\nUsage: {AGE_UPDATE_MESSAGE}"
        )
        return

    try:
        # Update user's age
        # Note: Ideally, age should be calculated from birth_date.
        # If storing age directly, ensure birth_date is also updated or handled.
        # For now, just updating the age field if it exists.
        # Consider adding birth_date update logic here or in user_service.
        await update_user(env, user_id, {"age": age})
        await update.effective_message.reply_text(AGE_UPDATED_MESSAGE.format(age=age))
    except ValidationError as e:
        logger.warning("Validation error updating age", user_id=user_id, age=age, error=str(e))
        await update.effective_message.reply_text(f"Validation error: {e}")
    except Exception as e:
        logger.error("Error updating age", user_id=user_id, age=age, error=str(e), exc_info=True)
        await update.effective_message.reply_text("Sorry, an error occurred while updating your age.")


@authenticated
@user_command_limiter(scope="profile_update")
async def gender_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /gender command."""
    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]  # Retrieve env from context

    if not context.args or len(context.args) != 1:
        await update.effective_message.reply_text(GENDER_UPDATE_MESSAGE)
        return

    gender_str = context.args[0].strip().lower()

    # Validate gender
    if not is_valid_gender(gender_str):
        valid_options = ", ".join(g.value for g in Gender)
        await update.effective_message.reply_text(
            f"Invalid gender: '{context.args[0]}'. Please use one of: {valid_options}.\nUsage: {GENDER_UPDATE_MESSAGE}"
        )
        return

    try:
        gender_enum = Gender(gender_str)
        await update_user(env, user_id, {"gender": gender_enum})
        await update.effective_message.reply_text(GENDER_UPDATED_MESSAGE.format(gender=gender_enum.value))
    except ValidationError as e:
        logger.warning("Validation error updating gender", user_id=user_id, gender=gender_str, error=str(e))
        await update.effective_message.reply_text(f"Validation error: {e}")
    except Exception as e:
        logger.error("Error updating gender", user_id=user_id, gender=gender_str, error=str(e), exc_info=True)
        await update.effective_message.reply_text("Sorry, an error occurred while updating your gender.")


@authenticated
# @user_command_limiter() # This decorator might not be needed if gender uses ConversationHandler
async def process_gender_selection(update: Update, context: ContextTypes.DEFAULT_TYPE, gender_str: str) -> None:
    """Process gender selection from keyboard or text input."""
    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]  # Retrieve env from context

    if gender_str.lower() == "cancel":
        await update.message.reply_text(
            "Gender update canceled.",
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/profile", "/name"],
                    ["/age", "/bio"],
                    ["/interests", "/location"],
                ],
                resize_keyboard=True,
            ),
        )
        return

    try:
        gender_map = {
            "male": Gender.MALE,
            "female": Gender.FEMALE,
            "other": Gender.OTHER,
        }

        gender_key = gender_str.lower()
        if gender_key not in gender_map:
            await update.message.reply_text("Invalid gender. Please select Male, Female, or Other.")
            return

        gender = gender_map[gender_key]

        await update_user(env, user_id, {"gender": gender.value})
        await update.message.reply_text(
            GENDER_UPDATED_MESSAGE.format(gender=gender.value),
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/profile", "/name"],
                    ["/age", "/bio"],
                    ["/interests", "/location"],
                ],
                resize_keyboard=True,
            ),
        )
    except Exception as e:
        logger.error(
            "Error updating gender",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again.")


@authenticated
@user_command_limiter(scope="profile_update")
async def bio_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /bio command."""
    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]  # Retrieve env from context

    if not context.args:
        await update.effective_message.reply_text(BIO_UPDATE_MESSAGE)
        return

    bio = " ".join(context.args).strip()

    # Add check for empty bio after stripping
    if not bio:
        await update.effective_message.reply_text(BIO_UPDATE_MESSAGE)
        return

    # Validate bio
    if not is_valid_bio(bio):
        await update.effective_message.reply_text(
            f"Invalid bio. Please provide a bio between 1 and 500 characters.\nUsage: {BIO_UPDATE_MESSAGE}"
        )
        return

    try:
        await update_user(env, user_id, {"bio": bio})
        await update.effective_message.reply_text(BIO_UPDATED_MESSAGE)
    except ValidationError as e:
        logger.warning("Validation error updating bio", user_id=user_id, error=str(e))
        await update.effective_message.reply_text(f"Validation error: {e}")
    except Exception as e:
        logger.error("Error updating bio", user_id=user_id, error=str(e), exc_info=True)
        await update.effective_message.reply_text("Sorry, an error occurred while updating your bio.")


@authenticated
@user_command_limiter(scope="profile_update")
async def interests_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /interests command."""
    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]  # Retrieve env from context

    if not context.args:
        await update.effective_message.reply_text(INTERESTS_UPDATE_MESSAGE)
        return

    interests_str = " ".join(context.args)
    interests_list = [interest.strip() for interest in interests_str.split(",") if interest.strip()]

    # Add check for empty list after splitting/stripping
    if not interests_list:
        await update.effective_message.reply_text(INTERESTS_UPDATE_MESSAGE)
        return

    # Validate interests
    if not is_valid_interests(interests_list):
        await update.effective_message.reply_text(
            f"Invalid interests. Please provide 1-10 interests, separated by commas. "
            f"Each interest should be 1-50 characters."
            f"\nUsage: {INTERESTS_UPDATE_MESSAGE}"
        )
        return

    try:
        await update_user(env, user_id, {"interests": interests_list})
        await update.effective_message.reply_text(INTERESTS_UPDATED_MESSAGE)
    except ValidationError as e:
        logger.warning("Validation error updating interests", user_id=user_id, error=str(e))
        await update.effective_message.reply_text(f"Validation error: {e}")
    except Exception as e:
        logger.error("Error updating interests", user_id=user_id, error=str(e), exc_info=True)
        await update.effective_message.reply_text("Sorry, an error occurred while updating your interests.")


@authenticated
@user_command_limiter(scope="profile_update")
async def location_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /location command.

    Can handle manual entry (City, Country) or location sharing.
    """
    user_id = str(update.effective_user.id)
    message = update.effective_message or update.message
    raw_text = message.text

    if raw_text is None:
        logger.warning("location_command received update with no text", user_id=user_id)
        return

    # Check if it's exactly /location
    if raw_text == "/location":
        await message.reply_text(
            LOCATION_UPDATE_MESSAGE,
            reply_markup=ReplyKeyboardMarkup(
                [
                    [{"text": "Share Location", "request_location": True}],
                    [{"text": "Cancel"}],
                ],
                resize_keyboard=True,
                one_time_keyboard=True,
            ),
        )
        context.user_data["awaiting_location"] = True
        return
    # Check if it starts with /location (handles '/location text' and '/location ')
    elif raw_text.startswith("/location"):
        location_text = raw_text[len("/location") :].strip()
        if not location_text:
            # Command followed by whitespace only, e.g. /location
            await message.reply_text(INVALID_LOCATION_FORMAT_MESSAGE)
            return
        else:
            # Command followed by actual location text
            await process_manual_location(update, context, location_text)
            return
    else:
        # Command handler should prevent this, but log if it occurs
        logger.warning("location_command triggered with unexpected text", user_id=user_id, text=raw_text)
        await message.reply_text(LOCATION_UPDATE_MESSAGE)
        return


@authenticated
@user_command_limiter(scope="profile_update")
async def handle_location(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle receiving a shared location."""
    env = context.bot_data["env"]
    user_id = str(update.effective_user.id)
    message = update.effective_message

    if not context.user_data.get("awaiting_location"):
        logger.info(f"User {user_id} sent location unexpectedly.")
        # Optionally reply? For now, just ignore.
        return

    shared_location = message.location
    if not shared_location:
        logger.warning("handle_location called without location data in message")
        return

    lat = shared_location.latitude
    lon = shared_location.longitude

    try:
        geocoded_data = await reverse_geocode_coordinates(lat, lon)

        # Validate geocoding result *before* proceeding
        if not geocoded_data or not geocoded_data.get("city") or not geocoded_data.get("country"):
            logger.warning(f"Reverse geocoding failed or returned incomplete data for user {user_id} at ({lat}, {lon})")
            await message.reply_text(GEOCODING_FAILED_MESSAGE)
            context.user_data["awaiting_location"] = False
            return
        else:
            # Proceed only if geocoding was successful and complete
            location_data = {
                "location_latitude": lat,
                "location_longitude": lon,
                "location_city": geocoded_data.get("city"),
                "location_country": geocoded_data.get("country"),
            }

            await update_user(env, user_id, location_data)
            await message.reply_text(LOCATION_UPDATED_SUCCESS_MESSAGE, reply_markup=ReplyKeyboardRemove())
            context.user_data["awaiting_location"] = False

    except ExternalServiceError as e:
        logger.error(f"External service error handling location for user {user_id}: {e}", exc_info=True)
        await message.reply_text(GEOCODING_FAILED_MESSAGE)
        context.user_data["awaiting_location"] = False
    except Exception as e:
        logger.error(f"Error handling location for user {user_id}: {e}", exc_info=True)
        await message.reply_text("Sorry, something went wrong. Please try again later.")
        context.user_data["awaiting_location"] = False


async def process_manual_location(update: Update, context: ContextTypes.DEFAULT_TYPE, location_text: str) -> None:
    """Process manual location entry."""
    user_id = str(update.effective_user.id)
    env = context.bot_data["env"]
    message = update.effective_message

    try:
        geocoded_data = await geocode_location(location_text)

        # Validate geocoding result *before* proceeding
        if not geocoded_data or not geocoded_data.get("city") or not geocoded_data.get("country"):
            logger.warning(
                f"Geocoding failed or returned incomplete data for user {user_id} at location '{location_text}'"
            )
            await message.reply_text(GEOCODING_FAILED_MESSAGE)
            return
        else:
            # Proceed only if geocoding was successful and complete
            location_data = {
                "location_city": geocoded_data.get("city"),
                "location_country": geocoded_data.get("country"),
                "location_latitude": geocoded_data.get("latitude"),
                "location_longitude": geocoded_data.get("longitude"),
            }

            await update_user(env, user_id, location_data)
            await message.reply_text(LOCATION_UPDATED_SUCCESS_MESSAGE, reply_markup=ReplyKeyboardRemove())
            # Clear any state if needed, e.g., if this was part of a conversation
            # context.user_data.pop("some_state", None)
    except ExternalServiceError as e:
        logger.error(f"External service error processing manual location for user {user_id}: {e}", exc_info=True)
        await message.reply_text(GEOCODING_FAILED_MESSAGE)
    except ValidationError as e:
        logger.warning("Invalid manual location format", user_id=user_id, location_text=location_text, error=str(e))
        await message.reply_text(str(e))
    except Exception as e:
        logger.error(f"Error updating location manually for user {user_id}: {e}", exc_info=True)
        await message.reply_text("Sorry, something went wrong. Please try again later.")
