"""Settings handlers for the MeetMatch bot."""

# TODO: Post-Cloudflare Migration Review
# These handlers rely on the service layer (e.g., user_service).
# After the service layer is refactored to use Cloudflare D1/KV/R2:
# 1. Review how Cloudflare bindings/context ('env') are passed to service calls, if needed.
# 2. Update error handling if D1/KV/R2 exceptions differ from previous DB/cache exceptions.
# 3. Check if data structures returned by service calls have changed.

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated, user_command_limiter
from src.models.user import Gender, Preferences
from src.services.user_service import get_user, update_user, update_user_preferences
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Settings messages
SETTINGS_MESSAGE = """
⚙️ *Settings*

Adjust your matching preferences below:

*Current preferences:*
🔍 Looking for: {looking_for}
📏 Age range: {min_age}-{max_age}
📍 Max distance: {max_distance} km
🔔 Notifications: {notifications}

Select an option to change:
"""


@authenticated
async def settings_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /settings command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    user_id = str(update.effective_user.id)

    try:
        # Get user preferences
        user = get_user(user_id)

        # Format looking for based on preferences.gender_preference
        if user.preferences and user.preferences.gender_preference:
            gp = set([g.value if isinstance(g, Gender) else g for g in user.preferences.gender_preference])
            if gp == {Gender.MALE.value}:
                looking_for = "Men"
            elif gp == {Gender.FEMALE.value}:
                looking_for = "Women"
            else:
                looking_for = "Everyone"
        else:
            looking_for = "Everyone"

        # Format other preferences
        min_age = (user.preferences.min_age if user.preferences and user.preferences.min_age else 10)
        max_age = (user.preferences.max_age if user.preferences and user.preferences.max_age else 65)
        max_distance = (
            user.preferences.max_distance if user.preferences and user.preferences.max_distance else 50
        )
        notifications = "On" if (
            user.preferences.notifications_enabled
            if user.preferences and user.preferences.notifications_enabled is not None
            else True
        ) else "Off"

        # Send settings message
        await update.message.reply_text(
            SETTINGS_MESSAGE.format(
                looking_for=looking_for,
                min_age=min_age,
                max_age=max_age,
                max_distance=max_distance,
                notifications=notifications,
            ),
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup(
                [
                    [InlineKeyboardButton("🔍 Looking for", callback_data="settings_looking_for")],
                    [InlineKeyboardButton("📏 Age range", callback_data="settings_age_range")],
                    [InlineKeyboardButton("📍 Max distance", callback_data="settings_max_distance")],
                    [InlineKeyboardButton("🔔 Notifications", callback_data="settings_notifications")],
                    [InlineKeyboardButton("🔄 Reset to defaults", callback_data="settings_reset")],
                ]
            ),
        )

    except Exception as e:
        logger.error(
            "Error in settings command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again later.")


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

        if callback_data == "settings_looking_for":
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

        elif callback_data == "settings_age_range":
            # Show age range options
            await query.edit_message_text(
                "Select minimum and maximum age range:",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [
                            InlineKeyboardButton("Min: 10", callback_data="min_age_10"),
                            InlineKeyboardButton("Min: 20", callback_data="min_age_20"),
                        ],
                        [
                            InlineKeyboardButton("Min: 30", callback_data="min_age_30"),
                            InlineKeyboardButton("Min: 40", callback_data="min_age_40"),
                        ],
                        [
                            InlineKeyboardButton("Min: 50", callback_data="min_age_50"),
                            InlineKeyboardButton("Min: 55", callback_data="min_age_55"),
                        ],
                        [
                            InlineKeyboardButton("Max: 20", callback_data="max_age_20"),
                            InlineKeyboardButton("Max: 30", callback_data="max_age_30"),
                        ],
                        [
                            InlineKeyboardButton("Max: 40", callback_data="max_age_40"),
                            InlineKeyboardButton("Max: 50", callback_data="max_age_50"),
                        ],
                        [
                            InlineKeyboardButton("Max: 65", callback_data="max_age_65"),
                            InlineKeyboardButton("« Back", callback_data="back_to_settings"),
                        ],
                    ]
                ),
            )

        elif callback_data.startswith("min_age_") or callback_data.startswith("max_age_"):
            # Handle age range selection
            if callback_data.startswith("min_age_"):
                age_type = "min"
                age_value = int(callback_data.split("_")[2])
            else:
                age_type = "max"
                age_value = int(callback_data.split("_")[2])
            await handle_age_range(update, context, age_type, age_value)

        elif callback_data == "settings_max_distance":
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

        elif callback_data == "settings_notifications":
            # Show notifications options
            await query.edit_message_text(
                "Notification settings:",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("Turn On", callback_data="notifications_on")],
                        [InlineKeyboardButton("Turn Off", callback_data="notifications_off")],
                        [InlineKeyboardButton("« Back", callback_data="back_to_settings")],
                    ]
                ),
            )

        elif callback_data.startswith("notifications_"):
            # Handle notifications selection
            enabled = callback_data[14:] == "on"
            await handle_notifications(update, context, enabled)

        elif callback_data == "settings_reset":
            # Reset settings to defaults
            await handle_reset_settings(update, context)

        elif callback_data == "back_to_settings":
            # Go back to settings
            await settings_command(update, context)

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
        # Map selection to preferences.gender_preference
        user = get_user(user_id)
        prefs = user.preferences or Preferences()
        if looking_for == "male":
            prefs.gender_preference = [Gender.MALE]
        elif looking_for == "female":
            prefs.gender_preference = [Gender.FEMALE]
        else:
            prefs.gender_preference = None
        update_user_preferences(user_id, prefs)

        # Show confirmation
        await query.edit_message_text(
            f"✅ Looking for preference updated to: {looking_for.capitalize()}",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )

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
        # Update user preferences
        user = get_user(user_id)
        prefs = user.preferences or Preferences()
        if age_type == "min":
            prefs.min_age = age_value
            age_type_display = "minimum"
        else:
            prefs.max_age = age_value
            age_type_display = "maximum"
        update_user_preferences(user_id, prefs)

        # Show confirmation
        await query.edit_message_text(
            f"✅ {age_type_display.capitalize()} age preference updated to: {age_value}",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )

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
        # Update user preferences
        user = get_user(user_id)
        prefs = user.preferences or Preferences()
        prefs.max_distance = distance
        update_user_preferences(user_id, prefs)

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

    except Exception as e:
        logger.error(
            "Error updating max distance",
            user_id=user_id,
            distance=distance,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again.")


async def handle_notifications(update: Update, context: ContextTypes.DEFAULT_TYPE, enabled: bool) -> None:
    """Handle notifications selection.

    Args:
        update: The update object
        context: The context object
        enabled: Whether notifications are enabled
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        # Update user preferences
        user = get_user(user_id)
        prefs = user.preferences or Preferences()
        prefs.notifications_enabled = enabled
        update_user_preferences(user_id, prefs)

        # Show confirmation
        status = "enabled" if enabled else "disabled"
        await query.edit_message_text(
            f"✅ Notifications {status}",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )

    except Exception as e:
        logger.error(
            "Error updating notifications",
            user_id=user_id,
            enabled=enabled,
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
        user = get_user(user_id)
        prefs = Preferences()
        prefs.min_age = 10
        prefs.max_age = 65
        prefs.max_distance = 50
        prefs.gender_preference = None
        prefs.notifications_enabled = True
        update_user_preferences(user_id, prefs)

        # Show confirmation
        await query.edit_message_text(
            "✅ Settings reset to defaults",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )

    except Exception as e:
        logger.error(
            "Error resetting settings",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again.")
