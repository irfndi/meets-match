"""Profile management handlers for the MeetMatch bot."""

# TODO: Post-Cloudflare Migration Review
# These handlers rely on the service layer (e.g., user_service, conversation_service).
# After the service layer is refactored to use Cloudflare D1/KV/R2:
# 1. Review how Cloudflare bindings/context ('env') are passed to service calls, if needed.
# 2. Update error handling if D1/KV/R2 exceptions differ from previous DB/cache exceptions.
# 3. Check if data structures returned by service calls have changed.
# 4. Ensure photo handling logic aligns with R2 implementation in user_service.

from telegram import ReplyKeyboardMarkup, Update
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated, user_command_limiter
from src.models.user import Gender
from src.services.user_service import get_user, update_user
from src.utils.logging import get_logger

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

# Field update messages
NAME_UPDATE_MESSAGE = "Please enter your name using /name Your Name"
AGE_UPDATE_MESSAGE = "Please enter your age using /age 25 (must be between 18-100)"
GENDER_UPDATE_MESSAGE = "Please select your gender:"
BIO_UPDATE_MESSAGE = "Please enter a brief bio using /bio Your bio here (max 300 characters)"
INTERESTS_UPDATE_MESSAGE = "Please enter your interests using /interests comma,separated,list"
LOCATION_UPDATE_MESSAGE = "Please share your location or use /location City, Country"

# Confirmation messages
NAME_UPDATED_MESSAGE = "✅ Name updated to: {name}"
AGE_UPDATED_MESSAGE = "✅ Age updated to: {age}"
GENDER_UPDATED_MESSAGE = "✅ Gender updated to: {gender}"
BIO_UPDATED_MESSAGE = "✅ Bio updated"
INTERESTS_UPDATED_MESSAGE = "✅ Interests updated"
LOCATION_UPDATED_MESSAGE = "✅ Location updated to: {location}"


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
            missing_fields.append("👤 /name - Set your name")
        if not user.age:
            missing_fields.append("🎂 /age - Set your age")
        if not user.gender:
            missing_fields.append("⚧ /gender - Set your gender")
        if not user.bio:
            missing_fields.append("📝 /bio - Add a brief bio")
        if not user.interests:
            missing_fields.append("🌟 /interests - Add your interests")
        if not user.location_city:
            missing_fields.append("📍 /location - Set your location")

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
async def name_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /name command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    user_id = str(update.effective_user.id)
    message_text = update.message.text.strip()

    # Check if command includes the name
    if message_text == "/name":
        await update.message.reply_text(NAME_UPDATE_MESSAGE)
        return

    # Extract name from command
    name = message_text[5:].strip()
    if not name:
        await update.message.reply_text(NAME_UPDATE_MESSAGE)
        return

    try:
        # Update user's name
        update_user(user_id, {"first_name": name})

        await update.message.reply_text(
            NAME_UPDATED_MESSAGE.format(name=name),
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/profile", "/age"],
                    ["/gender", "/bio"],
                    ["/interests", "/location"],
                ],
                resize_keyboard=True,
            ),
        )
    except Exception as e:
        logger.error(
            "Error updating name",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
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

    user_id = str(update.effective_user.id)
    message_text = update.message.text.strip()

    # Check if command includes the age
    if message_text == "/age":
        await update.message.reply_text(AGE_UPDATE_MESSAGE)
        return

    # Extract age from command
    try:
        age_str = message_text[4:].strip()
        age = int(age_str)

        # Validate age
        if age < 18 or age > 100:
            await update.message.reply_text("Age must be between 18 and 100. Please try again.")
            return

        # Update user's age
        update_user(user_id, {"age": age})

        await update.message.reply_text(
            AGE_UPDATED_MESSAGE.format(age=age),
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/profile", "/name"],
                    ["/gender", "/bio"],
                    ["/interests", "/location"],
                ],
                resize_keyboard=True,
            ),
        )
    except ValueError:
        await update.message.reply_text("Invalid age format. Please enter a number between 18 and 100.")
    except Exception as e:
        logger.error(
            "Error updating age",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again.")


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
        # Show gender selection keyboard
        await update.message.reply_text(
            GENDER_UPDATE_MESSAGE,
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["Male", "Female"],
                    ["Other", "Cancel"],
                ],
                resize_keyboard=True,
                one_time_keyboard=True,
            ),
        )
        # Set conversation state
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
        # Map input to Gender enum
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

        # Update user's gender
        update_user(user_id, {"gender": gender.value})

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
async def bio_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /bio command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    user_id = str(update.effective_user.id)
    message_text = update.message.text.strip()

    # Check if command includes the bio
    if message_text == "/bio":
        await update.message.reply_text(BIO_UPDATE_MESSAGE)
        return

    # Extract bio from command
    bio = message_text[4:].strip()
    if not bio:
        await update.message.reply_text(BIO_UPDATE_MESSAGE)
        return

    try:
        # Validate bio length
        if len(bio) > 300:
            await update.message.reply_text("Bio is too long. Please keep it under 300 characters.")
            return

        # Update user's bio
        update_user(user_id, {"bio": bio})

        await update.message.reply_text(
            BIO_UPDATED_MESSAGE,
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/profile", "/name"],
                    ["/age", "/gender"],
                    ["/interests", "/location"],
                ],
                resize_keyboard=True,
            ),
        )
    except Exception as e:
        logger.error(
            "Error updating bio",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again.")


@authenticated
async def interests_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /interests command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    user_id = str(update.effective_user.id)
    message_text = update.message.text.strip()

    # Check if command includes the interests
    if message_text == "/interests":
        await update.message.reply_text(INTERESTS_UPDATE_MESSAGE)
        return

    # Extract interests from command
    interests_text = message_text[10:].strip()
    if not interests_text:
        await update.message.reply_text(INTERESTS_UPDATE_MESSAGE)
        return

    try:
        # Parse interests
        interests = [interest.strip() for interest in interests_text.split(",") if interest.strip()]

        # Validate interests
        if not interests:
            await update.message.reply_text("Please provide at least one interest.")
            return

        if len(interests) > 10:
            await update.message.reply_text("Too many interests. Please provide at most 10 interests.")
            return

        # Update user's interests
        update_user(user_id, {"interests": interests})

        await update.message.reply_text(
            INTERESTS_UPDATED_MESSAGE,
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/profile", "/name"],
                    ["/age", "/gender"],
                    ["/bio", "/location"],
                ],
                resize_keyboard=True,
            ),
        )
    except Exception as e:
        logger.error(
            "Error updating interests",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again.")


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

    # Check if command includes the location
    if message_text == "/location":
        await update.message.reply_text(
            LOCATION_UPDATE_MESSAGE,
            reply_markup=ReplyKeyboardMarkup(
                [
                    [{"text": "Share Location", "request_location": True}],
                    ["Cancel"],
                ],
                resize_keyboard=True,
                one_time_keyboard=True,
            ),
        )
        # Set conversation state
        context.user_data["awaiting_location"] = True
        return

    # Extract location from command
    location_text = message_text[9:].strip()
    if not location_text:
        await update.message.reply_text(LOCATION_UPDATE_MESSAGE)
        return

    # Process manual location entry
    await process_manual_location(update, context, location_text)


@authenticated
async def location_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle location sharing.

    Args:
        update: The update object
        context: The context object
    """
    # Check if we're awaiting location
    if not context.user_data.get("awaiting_location"):
        return

    user_id = str(update.effective_user.id)

    try:
        # Get location coordinates
        location = update.message.location
        latitude = location.latitude
        longitude = location.longitude

        # TODO: Use a geocoding service to get city and country from coordinates
        # For now, just store the coordinates
        location_data = {
            "location_latitude": latitude,
            "location_longitude": longitude,
            "location_city": "Unknown City",  # Will be replaced with geocoding
            "location_country": "Unknown Country",  # Will be replaced with geocoding
        }

        # Update user's location
        update_user(user_id, location_data)

        await update.message.reply_text(
            LOCATION_UPDATED_MESSAGE.format(
                location=f"{location_data['location_city']}, {location_data['location_country']}"
            ),
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/profile", "/name"],
                    ["/age", "/gender"],
                    ["/bio", "/interests"],
                ],
                resize_keyboard=True,
            ),
        )
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

    # Clear conversation state
    context.user_data.pop("awaiting_location", None)


async def process_manual_location(update: Update, context: ContextTypes.DEFAULT_TYPE, location_text: str) -> None:
    """Process manual location entry.

    Args:
        update: The update object
        context: The context object
        location_text: Location text
    """
    user_id = str(update.effective_user.id)

    try:
        # Parse city and country
        parts = [part.strip() for part in location_text.split(",")]

        if len(parts) < 2:
            await update.message.reply_text("Please provide both city and country separated by a comma.")
            return

        city = parts[0]
        country = parts[1]

        # TODO: Validate location with geocoding service
        # For now, just store the provided values
        location_data = {
            "location_city": city,
            "location_country": country,
            "location_latitude": None,  # Will be updated with geocoding
            "location_longitude": None,  # Will be updated with geocoding
        }

        # Update user's location
        update_user(user_id, location_data)

        await update.message.reply_text(
            LOCATION_UPDATED_MESSAGE.format(location=f"{city}, {country}"),
            reply_markup=ReplyKeyboardMarkup(
                [
                    ["/profile", "/name"],
                    ["/age", "/gender"],
                    ["/bio", "/interests"],
                ],
                resize_keyboard=True,
            ),
        )
    except Exception as e:
        logger.error(
            "Error updating location manually",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again.")
