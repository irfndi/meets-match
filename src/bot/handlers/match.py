"""Match handlers for the MeetMatch bot."""

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
from telegram.ext import ContextTypes

from src.bot.middleware import authenticated, profile_required, user_command_limiter
from src.bot.ui.keyboards import no_matches_menu
from src.config import settings
from src.services.matching_service import (
    dislike_match,
    get_active_matches,
    get_match_by_id,
    get_potential_matches,
    like_match,
)
from src.services.user_service import get_user
from src.utils.cache import get_cache, set_cache
from src.utils.errors import NotFoundError
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Match command messages
NO_MATCHES_MESSAGE = """
No potential matches found at the moment.

Try again later or adjust your matching preferences with /settings.
"""

MATCH_PROFILE_TEMPLATE = """
👤 {name}, {age}
⚧ {gender}

📝 {bio}

🌟 Interests: {interests}

📍 {location}

Do you like this match?
"""

MATCH_LIKED_MESSAGE = """
You liked {name}!

If they like you back, you'll be able to start a conversation.
"""

MATCH_DISLIKED_MESSAGE = """
You passed on {name}.

Let's find someone else for you.
"""

MUTUAL_MATCH_MESSAGE = """
🎉 It's a match!

You and {name} liked each other. Start a conversation with /chat {match_id}.
"""


@authenticated
@profile_required
async def match_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /match command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    user_id = str(update.effective_user.id)

    try:
        # Get potential matches
        user = get_user(user_id)
        tier = "free"
        if user.preferences and getattr(user.preferences, "premium_tier", None):
            tier = user.preferences.premium_tier or "free"
        admin_ids = (settings.ADMIN_IDS or "").split(",") if settings.ADMIN_IDS else []
        if user_id in [aid.strip() for aid in admin_ids if aid.strip()]:
            tier = "admin"

        limits = {"free": 20, "pro": 200, "admin": None}
        limit = limits.get(tier, 20)
        if limit is not None:
            from datetime import datetime

            today = datetime.utcnow().strftime("%Y%m%d")
            key = f"user:daily:match_view:{user_id}:{today}"
            val = get_cache(key)
            cnt = int(val) if val and val.isdigit() else 0
            if cnt >= limit:
                await update.message.reply_text(
                    "You've reached today's match limit for your plan. Use /premium to upgrade.",
                    reply_markup=no_matches_menu(),
                )
                return
            set_cache(key, str(cnt + 1), expiration=24 * 3600)

        potential_matches = get_potential_matches(user_id)

        if not potential_matches:
            await update.message.reply_text(
                NO_MATCHES_MESSAGE,
                reply_markup=no_matches_menu(),
            )
            return

        # Get the first potential match
        match = potential_matches[0]
        match_user = get_user(match.target_user_id)

        # Format interests
        interests_text = ", ".join(match_user.interests) if match_user.interests else "None"

        # Format location
        location_text = (
            f"{match_user.location.city}, {match_user.location.country}"
            if match_user.location and match_user.location.city
            else "Unknown location"
        )

        # Send match profile
        await update.message.reply_text(
            MATCH_PROFILE_TEMPLATE.format(
                name=match_user.first_name,
                age=match_user.age,
                gender=match_user.gender.value if match_user.gender else "Not specified",
                bio=match_user.bio or "No bio provided",
                interests=interests_text,
                location=location_text,
            ),
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton("👍 Like", callback_data=f"like_{match.id}"),
                        InlineKeyboardButton("👎 Pass", callback_data=f"dislike_{match.id}"),
                    ],
                    [
                        InlineKeyboardButton("⏭️ Next", callback_data="next_match"),
                    ],
                ]
            ),
        )

    except Exception as e:
        logger.error(
            "Error in match command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again later.")


@authenticated
@profile_required
async def match_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle match-related callbacks.

    Args:
        update: The update object
        context: The context object
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        await query.answer()
        callback_data = query.data

        if callback_data.startswith("like_"):
            # Handle like action
            match_id = callback_data[5:]
            await handle_like(update, context, match_id)

        elif callback_data.startswith("dislike_"):
            # Handle dislike action
            match_id = callback_data[8:]
            await handle_dislike(update, context, match_id)

        elif callback_data == "next_match":
            # Show next match
            await query.delete_message()
            await match_command(update, context)

    except Exception as e:
        logger.error(
            "Error in match callback",
            user_id=user_id,
            callback_data=query.data,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again with /match.")


async def handle_like(update: Update, context: ContextTypes.DEFAULT_TYPE, match_id: str) -> None:
    """Handle liking a match.

    Args:
        update: The update object
        context: The context object
        match_id: Match ID
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        # Get match details
        match = get_match_by_id(match_id)
        target_user = get_user(match.target_user_id)

        # Like the match
        is_mutual = like_match(match_id)

        if is_mutual:
            # Mutual match
            await query.edit_message_text(
                MUTUAL_MATCH_MESSAGE.format(
                    name=target_user.first_name,
                    match_id=match_id,
                ),
                reply_markup=InlineKeyboardMarkup(
                    [
                        [
                            InlineKeyboardButton("💬 Start Chat", callback_data=f"chat_{match_id}"),
                        ],
                        [
                            InlineKeyboardButton("⏭️ Continue Matching", callback_data="next_match"),
                        ],
                    ]
                ),
            )
        else:
            # One-sided like
            await query.edit_message_text(
                MATCH_LIKED_MESSAGE.format(name=target_user.first_name),
                reply_markup=InlineKeyboardMarkup(
                    [
                        [
                            InlineKeyboardButton("⏭️ Continue Matching", callback_data="next_match"),
                        ],
                    ]
                ),
            )

    except NotFoundError:
        logger.warning(
            "Match not found in like handler",
            user_id=user_id,
            match_id=match_id,
        )
        await query.edit_message_text("This match is no longer available. Try /match to find new matches.")

    except Exception as e:
        logger.error(
            "Error in like handler",
            user_id=user_id,
            match_id=match_id,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again with /match.")


async def handle_dislike(update: Update, context: ContextTypes.DEFAULT_TYPE, match_id: str) -> None:
    """Handle disliking a match.

    Args:
        update: The update object
        context: The context object
        match_id: Match ID
    """
    query = update.callback_query
    user_id = str(update.effective_user.id)

    try:
        # Get match details
        match = get_match_by_id(match_id)
        target_user = get_user(match.target_user_id)

        # Dislike the match
        dislike_match(match_id)

        await query.edit_message_text(
            MATCH_DISLIKED_MESSAGE.format(name=target_user.first_name),
            reply_markup=InlineKeyboardMarkup(
                [
                    [
                        InlineKeyboardButton("⏭️ Continue Matching", callback_data="next_match"),
                    ],
                ]
            ),
        )

    except NotFoundError:
        logger.warning(
            "Match not found in dislike handler",
            user_id=user_id,
            match_id=match_id,
        )
        await query.edit_message_text("This match is no longer available. Try /match to find new matches.")

    except Exception as e:
        logger.error(
            "Error in dislike handler",
            user_id=user_id,
            match_id=match_id,
            error=str(e),
            exc_info=e,
        )
        await query.edit_message_text("Sorry, something went wrong. Please try again with /match.")


@authenticated
@profile_required
async def matches_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /matches command.

    Args:
        update: The update object
        context: The context object
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    user_id = str(update.effective_user.id)

    try:
        await show_matches_page(update, context, 0)

    except Exception as e:
        logger.error(
            "Error in matches command",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await update.message.reply_text("Sorry, something went wrong. Please try again later.")


async def matches_pagination_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle pagination for matches list.

    Args:
        update: The update object
        context: The context object
    """
    query = update.callback_query
    await query.answer()

    user_id = str(update.effective_user.id)
    data = query.data

    try:
        if data == "new_matches":
            # Delete the matches list and start matching
            try:
                await query.delete_message()
            except Exception:
                pass  # Message might already be deleted
            await match_command(update, context)
            return

        if data.startswith("matches_page_"):
            page = int(data.split("_")[-1])
            await show_matches_page(update, context, page)

    except Exception as e:
        logger.error(
            "Error in matches pagination",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        try:
            await query.edit_message_text("Sorry, something went wrong. Please try again later.")
        except Exception:
            pass


async def show_matches_page(update: Update, context: ContextTypes.DEFAULT_TYPE, page: int) -> None:
    """Show a page of matches.

    Args:
        update: The update object
        context: The context object
        page: Page number (0-based)
    """
    user_id = str(update.effective_user.id)
    limit = 5
    offset = page * limit

    # Tier-based history limit
    user = get_user(user_id)
    tier = "free"
    if user.preferences and getattr(user.preferences, "premium_tier", None):
        tier = user.preferences.premium_tier or "free"

    # Check admin status
    admin_ids = (settings.ADMIN_IDS or "").split(",") if settings.ADMIN_IDS else []
    if user_id in [aid.strip() for aid in admin_ids if aid.strip()]:
        tier = "admin"

    # History limits: Free = 10 matches (2 pages), Pro/Admin = Unlimited
    history_limits = {"free": 10, "pro": None, "admin": None}
    max_history = history_limits.get(tier, 10)

    if max_history is not None and offset >= max_history:
        text = (
            f"<b>Match History Limit Reached</b>\n\n"
            f"Free plan users can only view their last {max_history} matches.\n"
            f"Upgrade to Premium to view your full match history!"
        )
        keyboard = [
            [InlineKeyboardButton("⭐️ Upgrade to Premium", callback_data="premium_info")],
            [InlineKeyboardButton("⬅️ Back", callback_data=f"matches_page_{page - 1}")],
        ]

        reply_markup = InlineKeyboardMarkup(keyboard)
        if update.callback_query:
            await update.callback_query.edit_message_text(text, reply_markup=reply_markup)
        else:
            await update.message.reply_text(text, reply_markup=reply_markup)
        return

    # Get matches (fetch one extra to check if next page exists)
    matches = get_active_matches(user_id, limit=limit + 1, offset=offset)

    has_next = len(matches) > limit
    current_matches = matches[:limit]

    if not current_matches and page == 0:
        text = "You don't have any active matches yet. Use /match to start matching!"
        reply_markup = ReplyKeyboardMarkup(
            [
                ["/match", "/profile"],
                ["/settings", "/help"],
            ],
            resize_keyboard=True,
        )

        if update.callback_query:
            await update.callback_query.edit_message_text(text, reply_markup=None)
            # Send a new message for the reply keyboard
            await context.bot.send_message(
                chat_id=update.effective_chat.id, text="Use the menu below to navigate.", reply_markup=reply_markup
            )
        else:
            await update.message.reply_text(text, reply_markup=reply_markup)
        return

    # Create message with matches list
    message = f"<b>Your Matches (Page {page + 1})</b>\n\n"
    keyboard = []

    for match in current_matches:
        # Get match user details
        match_user_id = match.target_user_id if match.source_user_id == user_id else match.source_user_id
        match_user = get_user(match_user_id)

        # Add to message
        message += f"👤 <b>{match_user.first_name}</b>, {match_user.age}\n"

        # Add chat button
        keyboard.append(
            [
                InlineKeyboardButton(
                    f"💬 Chat with {match_user.first_name}",
                    callback_data=f"chat_{match.id}",
                )
            ]
        )

    # Add navigation buttons
    nav_row = []
    if page > 0:
        nav_row.append(InlineKeyboardButton("⬅️ Previous", callback_data=f"matches_page_{page - 1}"))
    if has_next:
        nav_row.append(InlineKeyboardButton("Next ➡️", callback_data=f"matches_page_{page + 1}"))

    if nav_row:
        keyboard.append(nav_row)

    # Add "Find new matches" button
    keyboard.append([InlineKeyboardButton("🔍 Find new matches", callback_data="new_matches")])

    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.callback_query:
        await update.callback_query.edit_message_text(
            message,
            reply_markup=reply_markup,
        )
    else:
        await update.message.reply_text(
            message,
            reply_markup=reply_markup,
        )


async def reengagement_response(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle re-engagement response (1 🚀 or 2).

    Args:
        update: The update object
        context: The context object
    """
    if not update.message or not update.message.text:
        return

    text = update.message.text.strip()

    if text == "1 🚀":
        # Start matching flow
        await match_command(update, context)

    elif text == "2":
        # Dismiss
        await update.message.reply_text(
            "Okay, type /match when you're ready.",
            reply_markup=ReplyKeyboardRemove(),
        )
