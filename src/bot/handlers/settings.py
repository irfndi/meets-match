"""Settings handlers for the MeetMatch bot."""

# TODO: Post-Cloudflare Migration Review
# These handlers rely on the service layer (e.g., user_service).
# After the service layer is refactored to use Cloudflare D1/KV/R2:
# 1. Review how Cloudflare bindings/context ('env') are passed to service calls, if needed.
# 2. Update error handling if D1/KV/R2 exceptions differ from previous DB/cache exceptions.
# 3. Check if data structures returned by service calls have changed.

# Standard library imports

# Third-party imports
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update, constants
from telegram.ext import ContextTypes

# Local application imports
from src.bot.middleware.auth import authenticated
from src.bot.middleware.rate_limiter import user_command_limiter
from src.models.user import Gender, User
from src.services.user_service import update_user
from src.utils.logging import get_logger

# Relative imports within the bot handlers/constants
from ..constants import CALLBACK_DATA_PREFIX_SETTINGS, SETTINGS_MESSAGE

# Initialize logger
logger = get_logger(__name__)


# Keyboards
def build_settings_keyboard() -> InlineKeyboardMarkup:
    """Builds the main settings keyboard."""
    keyboard = [
        [InlineKeyboardButton("🔍 Looking for", callback_data=f"{CALLBACK_DATA_PREFIX_SETTINGS}looking_for")],
        [InlineKeyboardButton("🎂 Age Range", callback_data=f"{CALLBACK_DATA_PREFIX_SETTINGS}age_range")],
        [InlineKeyboardButton("📍 Max Distance", callback_data=f"{CALLBACK_DATA_PREFIX_SETTINGS}max_distance")],
        [InlineKeyboardButton("🔄 Reset Settings", callback_data=f"{CALLBACK_DATA_PREFIX_SETTINGS}reset")],
    ]
    return InlineKeyboardMarkup(keyboard)


@user_command_limiter()
@authenticated
async def settings_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /settings command.

    Args:
        update: The update object
        context: The context object
    """
    user: User | None = context.user_data.get("user")
    if not user:  # Should not happen due to @authenticated but check anyway
        logger.error("User not found in context for settings_command", user_id=update.effective_user.id)
        await update.message.reply_text("Could not retrieve your profile. Try /start again.")
        return

    await _display_settings_menu(update, context)


# Helper to display the main settings menu
async def _display_settings_menu(update: Update, context: ContextTypes.DEFAULT_TYPE, query=None) -> None:
    """Sends or edits the message to show the main settings menu."""
    user: User | None = context.user_data.get("user")
    if not user:
        logger.error("User not found in context for _display_settings_menu", user_id=update.effective_user.id)
        error_text = "Could not retrieve your profile. Try /start again."
        if query:
            await query.edit_message_text(error_text)
        elif update.message:
            await update.message.reply_text(error_text)
        return

    # Format settings message
    prefs = user.preferences
    gender_preference = prefs.gender_preference.capitalize() if prefs else "Any"
    min_age = prefs.min_age if prefs else "Not set"
    max_age = prefs.max_age if prefs else "Not set"
    max_distance = prefs.max_distance if prefs else "Not set"

    settings_text = SETTINGS_MESSAGE.format(
        gender_preference=gender_preference,
        min_age=min_age,
        max_age=max_age,
        max_distance=max_distance,
    )

    reply_markup = build_settings_keyboard()
    if query:
        await query.edit_message_text(settings_text, reply_markup=reply_markup, parse_mode=constants.ParseMode.MARKDOWN)
    elif update.message:
        await update.message.reply_text(
            settings_text, reply_markup=reply_markup, parse_mode=constants.ParseMode.MARKDOWN
        )


def build_age_range_keyboard() -> InlineKeyboardMarkup:
    """Builds the keyboard markup for selecting age range."""
    keyboard = [
        # Min Age Row 1
        [
            InlineKeyboardButton("Min: 18+", callback_data="min_age_18"),
            InlineKeyboardButton("Min: 26+", callback_data="min_age_26"),
        ],
        # Min Age Row 2
        [
            InlineKeyboardButton("Min: 36+", callback_data="min_age_36"),
            InlineKeyboardButton("Min: 46+", callback_data="min_age_46"),
        ],
        # Max Age Row (adjust values as needed)
        [
            InlineKeyboardButton("Max: -35", callback_data="max_age_35"),
            InlineKeyboardButton("Max: -50", callback_data="max_age_50"),
            InlineKeyboardButton("Max: -100", callback_data="max_age_100"),
        ],
        [InlineKeyboardButton("« Back", callback_data="back_to_settings")],
    ]
    return InlineKeyboardMarkup(keyboard)


@authenticated
async def settings_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle settings-related callbacks.

    Args:
        update: The update object
        context: The context object
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        await query.answer()
        callback_data = query.data

        if callback_data == f"{CALLBACK_DATA_PREFIX_SETTINGS}looking_for":
            # Show looking for options
            await query.edit_message_text(
                "Who are you interested in meeting?",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("Men", callback_data="looking_for_male")],
                        [InlineKeyboardButton("Women", callback_data="looking_for_female")],
                        [InlineKeyboardButton("Everyone", callback_data="looking_for_everyone")],
                        [InlineKeyboardButton("« Back", callback_data="back_to_settings")],
                    ]
                ),
            )

        elif callback_data.startswith("looking_for_"):
            # Handle looking for selection
            looking_for = callback_data[12:]
            await handle_looking_for(update, context, looking_for)

        elif callback_data == f"{CALLBACK_DATA_PREFIX_SETTINGS}age_range":
            # Corrected logic: Show separate menus for min and max, then handle individually
            await query.edit_message_text(
                "Select the desired age range:",
                reply_markup=build_age_range_keyboard(),  # Assuming a helper creates this
            )

        elif callback_data.startswith("min_age_"):
            # Handle min age selection
            age_value = int(callback_data[8:])
            await handle_age_range(update, context, "min", age_value)

        elif callback_data.startswith("max_age_"):
            # Handle max age selection
            age_value = int(callback_data[8:])
            await handle_age_range(update, context, "max", age_value)

        elif callback_data == f"{CALLBACK_DATA_PREFIX_SETTINGS}max_distance":
            # Show max distance options
            await query.edit_message_text(
                "Select maximum distance for matches:",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [
                            InlineKeyboardButton("5 km", callback_data="max_distance_5"),
                            InlineKeyboardButton("10 km", callback_data="max_distance_10"),
                        ],
                        [
                            InlineKeyboardButton("25 km", callback_data="max_distance_25"),
                            InlineKeyboardButton("50 km", callback_data="max_distance_50"),
                        ],
                        [
                            InlineKeyboardButton("100 km", callback_data="max_distance_100"),
                            InlineKeyboardButton("Anywhere", callback_data="max_distance_1000"),
                        ],
                        [InlineKeyboardButton("« Back", callback_data="back_to_settings")],
                    ]
                ),
            )

        elif callback_data.startswith("max_distance_"):
            # Handle max distance selection
            distance = int(callback_data[13:])
            await handle_max_distance(update, context, distance)

        elif callback_data == f"{CALLBACK_DATA_PREFIX_SETTINGS}reset":
            # Reset settings to defaults
            await handle_reset_settings(update, context)

        elif callback_data == "back_to_settings":
            # Use the helper function to display the menu
            query = update.callback_query  # Get query object again
            await _display_settings_menu(update, context, query=query)

    except Exception as e:
        logger.error(
            "Error in settings callback",
            user_id=user_id,
            callback_data=query.data,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again with /settings.")


async def handle_looking_for(update: Update, context: ContextTypes.DEFAULT_TYPE, looking_for: str) -> None:
    """Handle looking for selection.

    Args:
        update: The update object
        context: The context object
        looking_for: Looking for value
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        env = context.bot_data["env"]

        # Map selection to Gender enum
        looking_for_map = {
            "male": Gender.MALE.value,
            "female": Gender.FEMALE.value,
            "everyone": None,  # None means no preference
        }

        # Update user preferences
        update_data = {"preferences": {"gender_preference": looking_for_map.get(looking_for)}}
        await update_user(env, user_id, update_data)

        # Show confirmation
        await query.edit_message_text(
            f"✅ Looking for preference updated to: {looking_for.capitalize()}",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )
        await _display_settings_menu(update, context, query=query)

    except Exception as e:
        logger.error(
            "Error updating looking for preference",
            user_id=user_id,
            looking_for=looking_for,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again.")


async def handle_age_range(update: Update, context: ContextTypes.DEFAULT_TYPE, age_type: str, age_value: int) -> None:
    """Handle age range selection.

    Args:
        update: The update object
        context: The context object
        age_type: Age type (min or max)
        age_value: Age value
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        env = context.bot_data["env"]
        # Update user preferences
        update_data = {"preferences": {f"{age_type}_age": age_value}}
        await update_user(env, user_id, update_data)

        # Show confirmation
        await query.edit_message_text(
            f"✅ {age_type.capitalize()} age preference updated to: {age_value}",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )
        await _display_settings_menu(update, context, query=query)

    except Exception as e:
        logger.error(
            "Error updating age preference",
            user_id=user_id,
            age_type=age_type,
            age_value=age_value,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again.")


async def handle_max_distance(update: Update, context: ContextTypes.DEFAULT_TYPE, distance: int) -> None:
    """Handle max distance selection.

    Args:
        update: The update object
        context: The context object
        distance: Distance value
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        env = context.bot_data["env"]
        # Update user preferences
        update_data = {"preferences": {"max_distance": distance}}
        await update_user(env, user_id, update_data)

        # Format display text
        display_text = f"{distance} km"
        if distance >= 1000:
            display_text = "Anywhere"

        # Show confirmation
        await query.edit_message_text(
            f"✅ Maximum distance updated to: {display_text}",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )
        await _display_settings_menu(update, context, query=query)

    except Exception as e:
        logger.error(
            "Error updating max distance",
            user_id=user_id,
            distance=distance,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again.")


async def handle_reset_settings(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle reset settings.

    Args:
        update: The update object
        context: The context object
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        # Reset user preferences to defaults
        default_preferences_update = {
            "preferences": {
                "gender_preference": "any",  # Assuming 'any' is the representation for None/default
                "min_age": 18,
                "max_age": 100,  # Or a more sensible upper default?
                "max_distance": 50,  # Assuming 50km is default
            }
        }

        env = context.bot_data["env"]
        await update_user(env, user_id, default_preferences_update)

        # Show confirmation
        await query.edit_message_text(
            "✅ Settings reset to defaults",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )
        await _display_settings_menu(update, context, query=query)

    except Exception as e:
        logger.error(
            "Error resetting settings",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again.")
