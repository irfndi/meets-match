"""Settings handlers for the MeetMatch bot."""

from typing import Any, Dict

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.error import BadRequest
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated, user_command_limiter
from src.models.user import Preferences
from src.services.user_service import get_user, update_user, update_user_preferences
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Settings messages
SETTINGS_MESSAGE = """
⚙️ *Settings*

Manage your region and language:

*Current:*
🌍 Region: {region}
🗣 Language: {language}

Use /premium to customize age range, distance, notifications (coming soon).
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

    # Clear any pending setting states to prevent interference
    if context.user_data:
        context.user_data.pop("awaiting_region", None)
        context.user_data.pop("awaiting_language", None)

    if not update.effective_user:
        return

    user_id = str(update.effective_user.id)

    try:
        # Get user preferences
        user = get_user(user_id)

        region = (
            user.preferences.preferred_country if user.preferences and user.preferences.preferred_country else "Not set"
        )
        language = (
            user.preferences.preferred_language
            if user.preferences and user.preferences.preferred_language
            else (update.effective_user.language_code or "Not set")
        )

        # Send settings message
        if update.message:
            await update.message.reply_text(
                SETTINGS_MESSAGE.format(
                    region=region,
                    language=language,
                ),
                parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("🌍 Region", callback_data="settings_region")],
                        [InlineKeyboardButton("🗣 Language", callback_data="settings_language")],
                        [InlineKeyboardButton("💠 Premium", callback_data="settings_premium")],
                        [InlineKeyboardButton("🔄 Reset to defaults", callback_data="settings_reset")],
                    ]
                ),
            )
        elif update.callback_query:
            try:
                await update.callback_query.edit_message_text(
                    SETTINGS_MESSAGE.format(
                        region=region,
                        language=language,
                    ),
                    parse_mode="Markdown",
                    reply_markup=InlineKeyboardMarkup(
                        [
                            [InlineKeyboardButton("🌍 Region", callback_data="settings_region")],
                            [InlineKeyboardButton("🗣 Language", callback_data="settings_language")],
                            [InlineKeyboardButton("💠 Premium", callback_data="settings_premium")],
                            [InlineKeyboardButton("🔄 Reset to defaults", callback_data="settings_reset")],
                        ]
                    ),
                )
            except BadRequest as e:
                if "Message is not modified" in str(e):
                    # Ignore if message is not modified
                    pass
                else:
                    raise e

    except Exception as e:
        logger.error(
            "Error in settings command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        if update.message:
            await update.message.reply_text("Sorry, something went wrong. Please try again later.")
        elif update.callback_query and update.callback_query.message:
            # Check if message is accessible (not InaccessibleMessage)
            from telegram import Message

            if isinstance(update.callback_query.message, Message):
                await update.callback_query.message.reply_text("Sorry, something went wrong. Please try again later.")


@authenticated
async def settings_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle settings-related callbacks.

    Args:
        update: The update object
        context: The context object
    """
    if not update.callback_query or not update.effective_user:
        return

    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        await query.answer()
        callback_data = query.data
        if not callback_data:
            return

        if callback_data == "settings_region":
            await query.edit_message_text(
                "Select your region (country):",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("Indonesia", callback_data="region_Indonesia")],
                        [InlineKeyboardButton("Singapore", callback_data="region_Singapore")],
                        [InlineKeyboardButton("Malaysia", callback_data="region_Malaysia")],
                        [InlineKeyboardButton("United States", callback_data="region_United States")],
                        [InlineKeyboardButton("India", callback_data="region_India")],
                        [InlineKeyboardButton("Type Country", callback_data="region_type")],
                        [InlineKeyboardButton("« Back", callback_data="back_to_settings")],
                    ]
                ),
            )

        elif callback_data.startswith("region_"):
            country = callback_data.split("_", 1)[1]
            await handle_region(update, context, country)

        elif callback_data == "region_type":
            await query.edit_message_text("Please type your country name (e.g., Indonesia):")
            if context.user_data is not None:
                context.user_data["awaiting_region"] = True

        elif callback_data == "settings_language":
            await query.edit_message_text(
                "Select your language:",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("English (en)", callback_data="language_en")],
                        [InlineKeyboardButton("Bahasa Indonesia (id)", callback_data="language_id")],
                        [InlineKeyboardButton("Type Language Code", callback_data="language_type")],
                        [InlineKeyboardButton("« Back", callback_data="back_to_settings")],
                    ]
                ),
            )

        elif callback_data.startswith("language_"):
            code = callback_data.split("_", 1)[1]
            await handle_language(update, context, code)

        elif callback_data == "language_type":
            await query.edit_message_text("Please type your language code (e.g., en, id):")
            if context.user_data is not None:
                context.user_data["awaiting_language"] = True

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

        elif callback_data == "settings_premium":
            # Reuse logic from premium_command
            user = get_user(user_id)
            tier = "free"
            if user.preferences and getattr(user.preferences, "premium_tier", None):
                tier = user.preferences.premium_tier or "free"

            from src.config import settings as app_settings

            admin_ids = (app_settings.ADMIN_IDS or "").split(",") if app_settings.ADMIN_IDS else []
            if user_id in [aid.strip() for aid in admin_ids if aid.strip()]:
                tier = "admin"

            await query.edit_message_text(
                PREMIUM_MESSAGE.format(tier=tier),
                parse_mode="Markdown",
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
                ),
            )

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


async def handle_region(update: Update, context: ContextTypes.DEFAULT_TYPE, country: str) -> None:
    if not update.callback_query or not update.effective_user:
        return
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        user = get_user(user_id)
        prefs = user.preferences or Preferences()
        prefs.preferred_country = country

        # Sync to user location if not set or update country
        from src.models.user import Location

        if not user.location:
            user.location = Location(latitude=0.0, longitude=0.0, country=country)
        else:
            user.location.country = country

        # Update user with both preferences and location
        update_data: Dict[str, Any] = {"preferences": prefs.model_dump(), "location": user.location.model_dump()}
        logger.info("Updating user region in handle_region", user_id=user_id, country=country, update_data=update_data)
        update_user(user_id, update_data)

        # Clear awaiting state if it exists
        if context.user_data:
            context.user_data.pop("awaiting_region", None)

        # Check if language is set
        if not prefs.preferred_language:
            await query.edit_message_text(
                f"✅ Region updated to: {country}\n\nNow, please select your language:",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("English (en)", callback_data="language_en")],
                        [InlineKeyboardButton("Bahasa Indonesia (id)", callback_data="language_id")],
                        [InlineKeyboardButton("Type Language Code", callback_data="language_type")],
                    ]
                ),
            )
        else:
            # Both set, continue to profile setup if needed
            from src.bot.handlers.profile import prompt_for_next_missing_field

            prompted = await prompt_for_next_missing_field(update, context, user_id)

            # If we prompted for a missing field, we don't need a Back button (focus on new prompt)
            # If we didn't prompt (profile complete or cooldown), show Back button so user isn't stuck
            reply_markup = None
            if not prompted:
                reply_markup = InlineKeyboardMarkup(
                    [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
                )

            await query.edit_message_text(
                f"✅ Region updated to: {country}",
                reply_markup=reply_markup,
            )

    except Exception as e:
        logger.error("Error updating region", user_id=user_id, country=country, error=str(e), exc_info=e)
        await query.edit_message_text("Sorry, something went wrong. Please try again.")


async def handle_language(update: Update, context: ContextTypes.DEFAULT_TYPE, language_code: str) -> None:
    if not update.callback_query or not update.effective_user:
        return
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        code = (language_code or "").strip().lower()
        if not code:
            await query.edit_message_text("Please type a valid language code (e.g., en, id).")
            return
        user = get_user(user_id)
        prefs = user.preferences or Preferences()
        prefs.preferred_language = code
        update_user_preferences(user_id, prefs)

        # Clear awaiting state if it exists
        if context.user_data:
            context.user_data.pop("awaiting_language", None)

        # Check if region is set
        if not prefs.preferred_country:
            await query.edit_message_text(
                f"✅ Language updated to: {code}\n\nNow, please select your region:",
                reply_markup=InlineKeyboardMarkup(
                    [
                        [InlineKeyboardButton("Indonesia (ID)", callback_data="region_Indonesia")],
                        [InlineKeyboardButton("United States (US)", callback_data="region_United States")],
                        [InlineKeyboardButton("United Kingdom (UK)", callback_data="region_United Kingdom")],
                        [InlineKeyboardButton("Other", callback_data="region_other")],
                    ]
                ),
            )
        else:
            await query.edit_message_text(
                f"✅ Language updated to: {code}",
                reply_markup=None,
            )
            # Both set, continue to profile setup if needed
            from src.bot.handlers.profile import prompt_for_next_missing_field

            await prompt_for_next_missing_field(update, context, user_id)

    except Exception as e:
        logger.error("Error updating language", user_id=user_id, language=language_code, error=str(e), exc_info=e)
        await query.edit_message_text("Sorry, something went wrong. Please try again.")


async def handle_age_range(update: Update, context: ContextTypes.DEFAULT_TYPE, age_type: str, age_value: int) -> None:
    """Handle age range selection.

    Args:
        update: The update object
        context: The context object
        age_type: Age type (min or max)
        age_value: Age value
    """
    if not update.callback_query or not update.effective_user:
        return
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
    if not update.callback_query or not update.effective_user:
        return
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
    if not update.callback_query or not update.effective_user:
        return
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
    if not update.callback_query or not update.effective_user:
        return
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        # Reset user preferences to defaults
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


PREMIUM_MESSAGE = """
💠 *Premium*

Coming soon.

Plans:
- Free: Daily match limit, basic features
- Pro: Higher limits, customize age range, distance, notifications

Your current tier: {tier}
"""


@authenticated
async def premium_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await user_command_limiter()(update, context)
    if not update.effective_user or not update.message:
        return
    user_id = str(update.effective_user.id)
    user = get_user(user_id)
    tier = "free"
    if user.preferences and getattr(user.preferences, "premium_tier", None):
        tier = user.preferences.premium_tier or "free"
    from src.config import settings as app_settings

    admin_ids = (app_settings.ADMIN_IDS or "").split(",") if app_settings.ADMIN_IDS else []
    if user_id in [aid.strip() for aid in admin_ids if aid.strip()]:
        tier = "admin"
    await update.message.reply_text(
        PREMIUM_MESSAGE.format(tier=tier),
        parse_mode="Markdown",
    )
