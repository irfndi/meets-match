"""Settings handlers for the MeetMatch bot."""

from typing import Any

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Message, Update
from telegram.error import BadRequest
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated, user_command_limiter
from src.models.user import Preferences
from src.services.user_service import get_user, update_user, update_user_preferences
from src.utils.errors import NotFoundError
from src.utils.logging import get_logger

logger = get_logger(__name__)

_SETTINGS_CALLBACK_PREFIXES = (
    "settings",
    "region_",
    "language_",
    "min_age_",
    "max_age_",
    "max_distance_",
    "notifications_",
    "back_to_settings",
)


def _get_effective_premium_tier(user_id: str, prefs: Preferences) -> str:
    """Return the user's effective premium tier, including admin overrides.

    Args:
        user_id: The user's ID
        prefs: The user's Preferences object

    Returns:
        The effective tier string: 'free', 'pro', or 'admin'
    """
    from src.config import settings as app_settings

    tier = prefs.premium_tier or "free"
    admin_ids = (app_settings.ADMIN_IDS or "").split(",") if app_settings.ADMIN_IDS else []
    if user_id in [aid.strip() for aid in admin_ids if aid.strip()]:
        tier = "admin"
    return tier


def _safe_get_preferences(user: Any) -> Preferences:
    """Safely extract preferences from user, handling None/corrupt data.

    Args:
        user: User object (may have None or invalid preferences)

    Returns:
        Valid Preferences object (existing or new default)
    """
    try:
        if user.preferences is not None:
            # Validate that it's a proper Preferences object
            if isinstance(user.preferences, Preferences):
                return user.preferences
            # If it's a dict (from corrupt cache), try to convert
            if isinstance(user.preferences, dict):
                return Preferences.model_validate(user.preferences)
            # Check if it has the expected Preferences attributes (duck typing)
            # This handles cases where preferences might be a mock or similar object in tests
            if hasattr(user.preferences, "preferred_country") and hasattr(user.preferences, "preferred_language"):
                # Try to create a Preferences object from the attributes
                # Need to clean up values that might be Mock objects (convert to None)
                try:

                    def _clean_value(val: Any, expected_type: type) -> Any:
                        """Clean a value, converting invalid types to None."""
                        if val is None:
                            return None
                        if isinstance(val, expected_type):
                            return val
                        # Not the expected type (likely a Mock), return None
                        return None

                    # Handle notifications_enabled separately to preserve False values
                    notif_val = _clean_value(getattr(user.preferences, "notifications_enabled", None), bool)
                    notifications = notif_val if notif_val is not None else True

                    return Preferences(
                        preferred_country=_clean_value(getattr(user.preferences, "preferred_country", None), str),
                        preferred_language=_clean_value(getattr(user.preferences, "preferred_language", None), str),
                        min_age=_clean_value(getattr(user.preferences, "min_age", None), int),
                        max_age=_clean_value(getattr(user.preferences, "max_age", None), int),
                        max_distance=_clean_value(getattr(user.preferences, "max_distance", None), int),
                        notifications_enabled=notifications,
                        premium_tier=_clean_value(getattr(user.preferences, "premium_tier", None), str),
                    )
                except Exception as inner_e:
                    logger.debug(
                        "Failed to reconstruct Preferences from attributes, using defaults",
                        error=str(inner_e),
                    )
    except Exception as e:
        logger.warning("Failed to extract preferences, using defaults", error=str(e))
    return Preferences()


async def _reply_or_edit(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
    parse_mode: str | None = None,
    error_fallback_text: str | None = None,
) -> None:
    """Helper function to reply or edit message based on update type.

    If the update is from a callback query, edits the original message.
    Otherwise, sends a new reply message.

    Args:
        update: The update object
        context: The context object
        text: Text content to send
        reply_markup: Optional keyboard markup
        parse_mode: Optional parse mode for markdown/HTML formatting
        error_fallback_text: Optional text to send if editing fails with an error
    """
    if update.callback_query:
        logger.debug("_reply_or_edit: callback detected, attempting edit")
        try:
            await update.callback_query.edit_message_text(text, reply_markup=reply_markup, parse_mode=parse_mode)
            logger.debug("_reply_or_edit: edit_message_text succeeded")
            return
        except BadRequest as e:
            if "Message is not modified" in str(e):
                logger.debug("_reply_or_edit: message not modified, skipping send")
                return
            else:
                logger.warning("_reply_or_edit: edit_message_text BadRequest, falling back", error=str(e))
        except Exception:
            logger.warning("_reply_or_edit: edit_message_text failed, falling back")

        # Fallback: send a new message using the effective chat
        fallback_text = error_fallback_text or text
        try:
            chat_id = update.effective_chat.id if update.effective_chat else None
            if chat_id and context.bot:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=fallback_text,
                    reply_markup=reply_markup,
                    parse_mode=parse_mode,
                )
                logger.debug("_reply_or_edit: sent message via context.bot", chat_id=chat_id)
                return
        except Exception:
            logger.warning("_reply_or_edit: failed to send via context.bot")
        # Final fallback: use the original callback message if available (avoid extra kwargs for error text)
        try:
            if update.callback_query.message and isinstance(update.callback_query.message, Message):
                if error_fallback_text:
                    await update.callback_query.message.reply_text(fallback_text)
                else:
                    await update.callback_query.message.reply_text(
                        fallback_text, reply_markup=reply_markup, parse_mode=parse_mode
                    )
                logger.debug("_reply_or_edit: sent message via callback_query.message")
                return
        except Exception:
            logger.warning("_reply_or_edit: failed to send via callback_query.message")

    if update.message:
        try:
            await update.message.reply_text(text, reply_markup=reply_markup, parse_mode=parse_mode)
            logger.debug("_reply_or_edit: reply_text succeeded")
        except Exception as e:
            logger.warning("_reply_or_edit: reply_text failed", error=str(e))


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
    # Apply rate limiting only for explicit commands/messages, not callback navigations
    if update.message:
        await user_command_limiter()(update, context)

    # Initialize user_data if None to prevent issues
    if context.user_data is None:
        logger.warning("context.user_data is None in settings_command")
        # Can't set context.user_data directly, but we can handle this gracefully
    else:
        # Clear any pending setting states to prevent interference
        context.user_data.pop("awaiting_region", None)
        context.user_data.pop("awaiting_language", None)

    if not update.effective_user:
        return

    user_id = str(update.effective_user.id)

    try:
        # Get user preferences
        user = get_user(user_id)

        # Safely extract preferences, handling None or corrupt data
        prefs = _safe_get_preferences(user)
        region = prefs.preferred_country or "Not set"
        language = prefs.preferred_language or update.effective_user.language_code or "Not set"

        settings_text = SETTINGS_MESSAGE.format(
            region=region,
            language=language,
        )
        settings_keyboard = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("🌍 Region", callback_data="settings_region")],
                [InlineKeyboardButton("🗣 Language", callback_data="settings_language")],
                [InlineKeyboardButton("💠 Premium", callback_data="settings_premium")],
                [InlineKeyboardButton("🔄 Reset to defaults", callback_data="settings_reset")],
            ]
        )

        # Send settings message
        if update.message:
            await update.message.reply_text(
                settings_text,
                parse_mode="Markdown",
                reply_markup=settings_keyboard,
            )
        elif update.callback_query:
            await _reply_or_edit(
                update,
                context,
                settings_text,
                reply_markup=settings_keyboard,
                parse_mode="Markdown",
                error_fallback_text="Sorry, something went wrong. Please try /start or /settings again.",
            )

    except NotFoundError:
        # User not found - this can happen due to race conditions or data issues
        # Provide recovery options
        logger.warning("User not found in settings_command, prompting to restart", user_id=user_id)
        error_msg = (
            "⚠️ We couldn't find your profile. This can happen if data was reset.\n\n"
            "Please use /start to set up your profile again."
        )
        if update.message:
            await update.message.reply_text(error_msg)
        elif update.callback_query and update.callback_query.message:
            from telegram import Message

            if isinstance(update.callback_query.message, Message):
                await update.callback_query.message.reply_text(error_msg)

    except Exception as e:
        logger.error(
            "Error in settings command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        error_msg = "Sorry, something went wrong. Please try /start or /settings again."
        if update.message:
            await update.message.reply_text(error_msg)
        elif update.callback_query and update.callback_query.message:
            # Check if message is accessible (not InaccessibleMessage)
            from telegram import Message

            if isinstance(update.callback_query.message, Message):
                await update.callback_query.message.reply_text(error_msg)


async def settings_callback_router(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Route callback queries to settings_callback if they belong to settings flows."""

    if not update.callback_query or not update.callback_query.data:
        return

    data = update.callback_query.data.strip().lower()
    if not data.startswith(_SETTINGS_CALLBACK_PREFIXES):
        return

    await settings_callback(update, context)


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
        logger.info("settings_callback received", user_id=user_id, data=callback_data)
        if not callback_data:
            # Provide feedback instead of silently returning
            logger.warning("Empty callback_data in settings_callback", user_id=user_id)
            await query.edit_message_text(
                "⚠️ Something went wrong. Please try again.",
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton("🔄 Return to Settings", callback_data="back_to_settings")]]
                ),
            )
            return

        if callback_data == "settings_region":
            await _reply_or_edit(
                update,
                context,
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

        elif callback_data == "region_type":
            await _reply_or_edit(update, context, "Please type your country name (e.g., Indonesia):")
            if context.user_data is not None:
                context.user_data["awaiting_region"] = True

        elif callback_data.startswith("region_"):
            country = callback_data.split("_", 1)[1]
            await handle_region(update, context, country)

        elif callback_data == "settings_language":
            await _reply_or_edit(
                update,
                context,
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

        elif callback_data == "language_type":
            await _reply_or_edit(update, context, "Please type your language code (e.g., en, id):")
            if context.user_data is not None:
                context.user_data["awaiting_language"] = True

        elif callback_data.startswith("language_"):
            code = callback_data.split("_", 1)[1]
            await handle_language(update, context, code)

        elif callback_data == "settings_age_range":
            await _reply_or_edit(
                update,
                context,
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
            await _reply_or_edit(
                update,
                context,
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
            await _reply_or_edit(
                update,
                context,
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
            # Use shared helper for premium tier determination
            user = get_user(user_id)
            prefs = _safe_get_preferences(user)
            tier = _get_effective_premium_tier(user_id, prefs)

            await _reply_or_edit(
                update,
                context,
                PREMIUM_MESSAGE.format(tier=tier),
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
                ),
                parse_mode="Markdown",
            )

        elif callback_data == "settings_reset":
            # Reset settings to defaults
            await handle_reset_settings(update, context)
        elif callback_data == "back_to_settings":
            # Go back to settings
            await settings_command(update, context)
        else:
            logger.warning("Unknown settings callback", user_id=user_id, data=callback_data)
            await _reply_or_edit(
                update,
                context,
                "⚠️ Unknown action. Returning to Settings.",
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("« Back", callback_data="back_to_settings")]]),
            )

    except Exception as e:
        logger.error(
            "Error in settings callback",
            user_id=user_id,
            callback_data=query.data,
            error=str(e),
            exc_info=e,
        )
        await _reply_or_edit(update, context, "Sorry, something went wrong. Please try again with /settings.")


async def handle_region(update: Update, context: ContextTypes.DEFAULT_TYPE, country: str) -> None:
    """Handle region (country) selection and update user preferences and location.

    Args:
        update: The update object.
        context: The context object.
        country: Selected country name.
    """
    if not update.effective_user:
        return

    # Answer callback query to prevent loading indicator
    if update.callback_query:
        try:
            await update.callback_query.answer()
        except BadRequest:
            pass  # Callback query may have already been answered or timed out

    user_id = str(update.effective_user.id)

    try:
        user = get_user(user_id)
        prefs = _safe_get_preferences(user)
        prefs.preferred_country = country

        # Sync to user location if not set or update country
        from src.models.user import Location

        if not user.location:
            user.location = Location(latitude=0.0, longitude=0.0, country=country)
        else:
            user.location.country = country

        # Update preferences (merge) and location
        logger.info("Updating user region in handle_region", user_id=user_id, country=country)
        # Merge preferences inline to avoid wiping other settings
        existing_prefs = _safe_get_preferences(user).model_dump()
        merged_prefs = {**existing_prefs, **{"preferred_country": country}}
        update_user(user_id, {"preferences": merged_prefs, "location": user.location.model_dump()})

        # Clear awaiting state if it exists
        if context.user_data:
            context.user_data.pop("awaiting_region", None)

        # Check if language is set
        if not prefs.preferred_language:
            await _reply_or_edit(
                update,
                context,
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

            # If we prompted for a missing field, don't send another message
            # The profile prompt is already showing, so we should not overwrite it
            if prompted:
                return

            # Profile is complete or cooldown active, show confirmation with Back button
            await _reply_or_edit(
                update,
                context,
                f"✅ Region updated to: {country}",
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
                ),
            )

    except NotFoundError:
        # User not found - redirect to /start
        logger.warning("User not found in handle_region", user_id=user_id)
        await _reply_or_edit(
            update,
            context,
            "⚠️ We couldn't find your profile. Please use /start to set up your profile again.",
        )

    except Exception as e:
        logger.error("Error updating region", user_id=user_id, country=country, error=str(e), exc_info=e)
        await _reply_or_edit(
            update,
            context,
            "Sorry, something went wrong. Please try /settings again.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔄 Return to Settings", callback_data="back_to_settings")]]
            ),
        )


async def handle_language(update: Update, context: ContextTypes.DEFAULT_TYPE, language_code: str) -> None:
    """Handle language selection and update user preferences.

    Args:
        update: The update object.
        context: The context object.
        language_code: Selected language code (e.g., "en", "id").
    """
    if not update.effective_user:
        return

    # Answer callback query to prevent loading indicator
    if update.callback_query:
        try:
            await update.callback_query.answer()
        except BadRequest:
            pass  # Callback query may have already been answered or timed out

    user_id = str(update.effective_user.id)

    try:
        code = (language_code or "").strip().lower()
        if not code:
            await _reply_or_edit(update, context, "Please type a valid language code (e.g., en, id).")
            return
        user = get_user(user_id)
        prefs = _safe_get_preferences(user)
        prefs.preferred_language = code
        update_user_preferences(user_id, prefs)

        # Clear awaiting state if it exists
        if context.user_data:
            context.user_data.pop("awaiting_language", None)

        # Check if region is set
        if not prefs.preferred_country:
            await _reply_or_edit(
                update,
                context,
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
            # Both set, continue to profile setup if needed
            from src.bot.handlers.profile import prompt_for_next_missing_field

            prompted = await prompt_for_next_missing_field(update, context, user_id)

            # If we prompted for a missing field, don't send another message
            # The profile prompt is already showing, so we should not overwrite it
            if prompted:
                return

            # Profile is complete or cooldown active, show confirmation with Back button
            await _reply_or_edit(
                update,
                context,
                f"✅ Language updated to: {code}",
                reply_markup=InlineKeyboardMarkup(
                    [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
                ),
            )

    except NotFoundError:
        # User not found - redirect to /start
        logger.warning("User not found in handle_language", user_id=user_id)
        await _reply_or_edit(
            update,
            context,
            "⚠️ We couldn't find your profile. Please use /start to set up your profile again.",
        )

    except Exception as e:
        logger.error("Error updating language", user_id=user_id, language=language_code, error=str(e), exc_info=e)
        await _reply_or_edit(
            update,
            context,
            "Sorry, something went wrong. Please try /settings again.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔄 Return to Settings", callback_data="back_to_settings")]]
            ),
        )


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
    user_id = str(update.effective_user.id)

    try:
        try:
            await update.callback_query.answer()
        except BadRequest:
            pass
        # Update user preferences
        user = get_user(user_id)
        prefs = _safe_get_preferences(user)
        if age_type == "min":
            prefs.min_age = age_value
            age_type_display = "minimum"
        else:
            prefs.max_age = age_value
            age_type_display = "maximum"
        update_user_preferences(user_id, prefs)

        await _reply_or_edit(
            update,
            context,
            f"✅ {age_type_display.capitalize()} age preference updated to: {age_value}",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )

    except NotFoundError:
        logger.warning("User not found in handle_age_range", user_id=user_id)
        await _reply_or_edit(
            update, context, "⚠️ We couldn't find your profile. Please use /start to set up your profile again."
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
        await _reply_or_edit(
            update,
            context,
            "Sorry, something went wrong. Please try again.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔄 Return to Settings", callback_data="back_to_settings")]]
            ),
        )


async def handle_max_distance(update: Update, context: ContextTypes.DEFAULT_TYPE, distance: int) -> None:
    """Handle max distance selection.

    Args:
        update: The update object
        context: The context object
        distance: Distance value
    """
    if not update.callback_query or not update.effective_user:
        return
    user_id = str(update.effective_user.id)

    try:
        try:
            await update.callback_query.answer()
        except BadRequest:
            pass
        # Update user preferences
        user = get_user(user_id)
        prefs = _safe_get_preferences(user)
        prefs.max_distance = distance
        update_user_preferences(user_id, prefs)

        # Format display text
        display_text = f"{distance} km"
        if distance >= 1000:
            display_text = "Anywhere"

        await _reply_or_edit(
            update,
            context,
            f"✅ Maximum distance updated to: {display_text}",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )

    except NotFoundError:
        logger.warning("User not found in handle_max_distance", user_id=user_id)
        await _reply_or_edit(
            update, context, "⚠️ We couldn't find your profile. Please use /start to set up your profile again."
        )

    except Exception as e:
        logger.error(
            "Error updating max distance",
            user_id=user_id,
            distance=distance,
            error=str(e),
            exc_info=e,
        )
        await _reply_or_edit(
            update,
            context,
            "Sorry, something went wrong. Please try again.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔄 Return to Settings", callback_data="back_to_settings")]]
            ),
        )


async def handle_notifications(update: Update, context: ContextTypes.DEFAULT_TYPE, enabled: bool) -> None:
    """Handle notifications selection.

    Args:
        update: The update object
        context: The context object
        enabled: Whether notifications are enabled
    """
    if not update.callback_query or not update.effective_user:
        return
    user_id = str(update.effective_user.id)

    try:
        try:
            await update.callback_query.answer()
        except BadRequest:
            pass
        # Update user preferences
        user = get_user(user_id)
        prefs = _safe_get_preferences(user)
        prefs.notifications_enabled = enabled
        update_user_preferences(user_id, prefs)

        status = "enabled" if enabled else "disabled"
        await _reply_or_edit(
            update,
            context,
            f"✅ Notifications {status}",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )

    except NotFoundError:
        logger.warning("User not found in handle_notifications", user_id=user_id)
        await _reply_or_edit(
            update, context, "⚠️ We couldn't find your profile. Please use /start to set up your profile again."
        )

    except Exception as e:
        logger.error(
            "Error updating notifications",
            user_id=user_id,
            enabled=enabled,
            error=str(e),
            exc_info=e,
        )
        await _reply_or_edit(
            update,
            context,
            "Sorry, something went wrong. Please try again.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔄 Return to Settings", callback_data="back_to_settings")]]
            ),
        )


async def handle_reset_settings(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle reset settings.

    Args:
        update: The update object
        context: The context object
    """
    if not update.effective_user:
        return
    user_id = str(update.effective_user.id)

    try:
        # Reset user preferences to defaults
        prefs = Preferences()
        prefs.min_age = 10
        prefs.max_age = 65
        prefs.max_distance = 20
        prefs.gender_preference = None
        prefs.notifications_enabled = True
        # Reset should replace the entire preferences object
        update_user(user_id, {"preferences": prefs.model_dump()})

        # Show confirmation
        await _reply_or_edit(
            update,
            context,
            "✅ Settings reset to defaults",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("« Back to Settings", callback_data="back_to_settings")]]
            ),
        )

    except NotFoundError:
        logger.warning("User not found in handle_reset_settings", user_id=user_id)
        await _reply_or_edit(
            update, context, "⚠️ We couldn't find your profile. Please use /start to set up your profile again."
        )

    except Exception as e:
        logger.error(
            "Error resetting settings",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await _reply_or_edit(
            update,
            context,
            "Sorry, something went wrong. Please try again.",
            reply_markup=InlineKeyboardMarkup(
                [[InlineKeyboardButton("🔄 Return to Settings", callback_data="back_to_settings")]]
            ),
        )


@authenticated
async def settings_text_router(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Route text commands to appropriate settings handlers.

    Args:
        update: The update object
        context: The context object
    """
    await user_command_limiter()(update, context)
    if not update.message or not update.message.text or not update.effective_user:
        return
    text = update.message.text.strip()
    if text in ["🌍 Region", "Region"]:
        await update.message.reply_text(
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
        return
    if text in ["🗣 Language", "Language"]:
        await update.message.reply_text(
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
        return
    if text in ["💠 Premium", "Premium"]:
        await premium_command(update, context)
        return
    if text.startswith("🔄 Reset") or text in ["Reset", "Reset to defaults"]:
        await handle_reset_settings(update, context)
        return


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
    """Handle the /premium command and display the user's current premium tier.

    Args:
        update: The update object
        context: The context object
    """
    await user_command_limiter()(update, context)
    if not update.effective_user or not update.message:
        return
    user_id = str(update.effective_user.id)

    try:
        user = get_user(user_id)
        prefs = _safe_get_preferences(user)
        tier = _get_effective_premium_tier(user_id, prefs)
        await update.message.reply_text(
            PREMIUM_MESSAGE.format(tier=tier),
            parse_mode="Markdown",
        )

    except NotFoundError:
        logger.warning("User not found in premium_command", user_id=user_id)
        await update.message.reply_text(
            "⚠️ We couldn't find your profile. Please use /start to set up your profile again."
        )

    except Exception as e:
        logger.error("Error in premium_command", user_id=user_id, error=str(e), exc_info=e)
        await update.message.reply_text("Sorry, something went wrong. Please try /start again.")
