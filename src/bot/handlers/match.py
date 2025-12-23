"""Match handlers for the MeetMatch bot."""

from typing import cast

from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    ReplyKeyboardRemove,
    Update,
)
from telegram.ext import ContextTypes

from src.bot.media_sender import send_media_group_safe
from src.bot.middleware import authenticated, profile_required, user_command_limiter
from src.bot.ui.keyboards import main_menu
from src.config import settings
from src.models.match import MatchStatus
from src.services.matching_service import (
    create_match,
    dislike_match,
    get_active_matches,
    get_match_by_id,
    get_potential_matches,
    get_saved_matches,
    like_match,
    skip_match,
)
from src.services.user_service import get_user
from src.utils.cache import get_cache, set_cache
from src.utils.errors import NotFoundError
from src.utils.logging import get_logger
from src.utils.security import escape_html

# Shared constant for user editing state
USER_EDITING_STATE_KEY = "user:editing:{user_id}"

logger = get_logger(__name__)

# Match command messages
NO_MATCHES_MESSAGE = """
No potential matches found right now. 🕵️

Try adjusting your preferences in <b>Settings ⚙️</b> or check back later!
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

You and {name} liked each other.
"""


@authenticated
@profile_required
async def match_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle the /match command.

    Initiates the matching flow, displaying potential matches one by one.
    Checks user eligibility and rate limits before showing matches.

    Args:
        update (Update): The update object from Telegram.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    if not update.effective_user:
        return

    # Determine message object to reply to
    message = update.message
    if not message and update.callback_query and update.callback_query.message:
        message = cast(Message, update.callback_query.message)

    if not message:
        return

    user_id = str(update.effective_user.id)

    match_shown = await get_and_show_match(update, context, user_id)

    if not match_shown:
        await message.reply_text(
            NO_MATCHES_MESSAGE,
            parse_mode="HTML",
            reply_markup=main_menu(),
        )


async def get_and_show_match(update: Update, context: ContextTypes.DEFAULT_TYPE, user_id: str) -> bool:
    """
    Get and show the next potential match.

    Retrieves a potential match candidate, creates a match record, and displays
    the candidate's profile to the user. Enforces daily match viewing limits based
    on user tier.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
        user_id (str): The ID of the user requesting a match.

    Returns:
        bool: True if a match was successfully shown (or limit reached message sent),
              False if no matches are available.
    """
    # Determine message object to reply to
    message = update.message
    if not message and update.callback_query and update.callback_query.message:
        message = cast(Message, update.callback_query.message)

    if not message:
        return False

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
            from datetime import datetime, timezone

            today = datetime.now(timezone.utc).strftime("%Y%m%d")
            key = f"user:daily:match_view:{user_id}:{today}"
            val = get_cache(key)
            cnt = int(val) if val and val.isdigit() else 0
            if cnt >= limit:
                await message.reply_text(
                    "You've reached today's match limit for your plan. Use /premium to upgrade.",
                    reply_markup=main_menu(),
                )
                return True  # Treated as shown/handled to avoid "no matches" fallback in some contexts

            set_cache(key, str(cnt + 1), expiration=24 * 3600)

        potential_matches = get_potential_matches(user_id)

        if not potential_matches:
            return False

        # Get the first potential match (User object)
        match_user = potential_matches[0]

        # Create/Get match record
        match = create_match(user_id, match_user.id)

        # Format interests
        interests_text = ", ".join(match_user.interests) if match_user.interests else "None"

        # Format location
        location_text = (
            f"{match_user.location.city}, {match_user.location.country}"
            if match_user.location and match_user.location.city
            else "Unknown location"
        )

        # Send match profile
        profile_text = MATCH_PROFILE_TEMPLATE.format(
            name=escape_html(match_user.first_name),
            age=match_user.age,
            gender=match_user.gender.value if match_user.gender else "Not specified",
            bio=escape_html(match_user.bio) or "No bio provided",
            interests=escape_html(interests_text),
            location=escape_html(location_text),
        )

        reply_markup = InlineKeyboardMarkup(
            [
                [
                    InlineKeyboardButton("👍 Like", callback_data=f"like_{match.id}"),
                    InlineKeyboardButton("👎 Pass", callback_data=f"dislike_{match.id}"),
                ],
                [
                    InlineKeyboardButton("⏭️ Next", callback_data="next_match"),
                ],
            ]
        )

        # Send media if available
        if match_user.photos and len(match_user.photos) > 0:
            await send_media_group_safe(message.reply_media_group, match_user.photos)

        await message.reply_text(
            profile_text,
            reply_markup=reply_markup,
        )
        return True

    except Exception as e:
        logger.error(
            "Error in get_and_show_match",
            user_id=user_id,
            error=str(e),
            exc_info=e,
        )
        await message.reply_text("Sorry, something went wrong. Please try again later.")
        return True  # Handled error


@authenticated
@profile_required
async def match_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle match-related callbacks (like, dislike, view, skip).

    Processes button clicks from match profiles and match notifications.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
    """
    query = update.callback_query
    if not query or not update.effective_user:
        return

    user_id = str(update.effective_user.id)

    try:
        await query.answer()
        callback_data = query.data
        if not callback_data:
            return

        if callback_data.startswith("like_"):
            # Handle like action
            match_id = callback_data[5:]
            await handle_like(update, context, match_id)

        elif callback_data.startswith("dislike_"):
            # Handle dislike action
            match_id = callback_data[8:]
            await handle_dislike(update, context, match_id)

        elif callback_data.startswith("view_match_"):
            # Handle view match
            match_id = callback_data.split("_")[-1]
            await handle_view_match(update, context, match_id)

        elif callback_data == "next_match":
            # Show next match
            if query.message:
                await query.delete_message()
            await match_command(update, context)

        elif callback_data.startswith("skip_notification_"):
            # Handle skip notification
            match_id = callback_data.split("_")[-1]
            skip_match(match_id, user_id)

            await query.answer("Match saved for later!")

            # Remove the inline keyboard first
            await query.edit_message_text(
                "Match skipped! You can find them later in your /matches list (Saved Matches).", reply_markup=None
            )

            # Then send the follow-up message with ReplyKeyboard
            if query.message and isinstance(query.message, Message):
                await context.bot.send_message(
                    chat_id=query.message.chat_id, text="What would you like to do next?", reply_markup=main_menu()
                )

    except Exception as e:
        logger.error(
            "Error in match callback",
            user_id=user_id,
            callback_data=query.data if query else "None",
            error=str(e),
            exc_info=e,
        )
        if query:
            await query.edit_message_text("Sorry, something went wrong. Please try again with /match.")


async def handle_like(update: Update, context: ContextTypes.DEFAULT_TYPE, match_id: str) -> None:
    """
    Handle liking a match.

    Records the LIKE action. If it's a mutual match, notifies both users
    (the current user immediately, the other user via message if not busy).

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
        match_id (str): The ID of the match being liked.
    """
    query = update.callback_query
    if not query or not update.effective_user:
        return

    user_id = str(update.effective_user.id)

    try:
        # Get match details
        match = get_match_by_id(match_id)
        target_user_id = match.user1_id if match.user2_id == user_id else match.user2_id
        target_user = get_user(target_user_id)

        # Like the match
        is_mutual = like_match(match_id, user_id)

        if is_mutual:
            # Mutual match
            tg_link = f"tg://user?id={target_user.id}"
            await query.edit_message_text(
                MUTUAL_MATCH_MESSAGE.format(
                    name=escape_html(target_user.first_name),
                    match_id=match_id,
                ),
                reply_markup=InlineKeyboardMarkup(
                    [
                        [
                            InlineKeyboardButton(f"💬 Chat with {target_user.first_name}", url=tg_link),
                        ],
                        [
                            InlineKeyboardButton("⏭️ Continue Matching", callback_data="next_match"),
                        ],
                    ]
                ),
            )

            # Notify the OTHER user (target_user) about the match (Interrupt)
            # But only if they are not editing their profile
            try:
                target_editing_key = USER_EDITING_STATE_KEY.format(user_id=target_user.id)
                is_editing = get_cache(target_editing_key)

                if not is_editing:
                    # We need the liker's info (current user)
                    current_user = get_user(user_id)

                    notify_text = (
                        f"🎉 New Match! You matched with {escape_html(current_user.first_name)}!\n\n"
                        f"Start a conversation now or skip for later."
                    )

                    notify_markup = InlineKeyboardMarkup(
                        [
                            [InlineKeyboardButton("👀 View Match", callback_data=f"view_match_{match_id}")],
                            [InlineKeyboardButton("⏭️ Skip (See later)", callback_data=f"skip_notification_{match_id}")],
                        ]
                    )

                    await context.bot.send_message(chat_id=target_user.id, text=notify_text, reply_markup=notify_markup)
            except Exception as e:
                logger.warning("Failed to send match notification", error=str(e), target_user_id=target_user.id)
        else:
            # One-sided like
            await query.edit_message_text(
                MATCH_LIKED_MESSAGE.format(name=escape_html(target_user.first_name)),
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
    """
    Handle disliking a match.

    Records the DISLIKE action and prompts the user to continue matching.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
        match_id (str): The ID of the match being disliked.
    """
    query = update.callback_query
    if not query or not update.effective_user:
        return

    user_id = str(update.effective_user.id)

    try:
        # Get match details
        match = get_match_by_id(match_id)
        target_user_id = match.user1_id if match.user2_id == user_id else match.user2_id
        target_user = get_user(target_user_id)

        # Dislike the match
        dislike_match(match_id, user_id)

        await query.edit_message_text(
            MATCH_DISLIKED_MESSAGE.format(name=escape_html(target_user.first_name)),
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


async def handle_view_match(update: Update, context: ContextTypes.DEFAULT_TYPE, match_id: str) -> None:
    """
    Handle viewing a specific match profile.

    Used when viewing details of a saved match or a new match notification.
    Displays the user's profile and media, along with action buttons.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
        match_id (str): The ID of the match to view.
    """
    query = update.callback_query
    if not query or not update.effective_user:
        return

    user_id = str(update.effective_user.id)

    try:
        match = get_match_by_id(match_id)

        # Security check: Ensure user is part of the match
        if user_id != match.user1_id and user_id != match.user2_id:
            logger.warning("Unauthorized match view attempt", user_id=user_id, match_id=match_id)
            if query.message:
                await query.edit_message_text("This match is no longer available. Try /match to find new matches.")
            return

        # Determine target user
        target_user_id = match.user1_id if match.user2_id == user_id else match.user2_id
        match_user = get_user(target_user_id)

        # Format interests
        interests_text = ", ".join(match_user.interests) if match_user.interests else "None"

        # Format location
        location_text = (
            f"{match_user.location.city}, {match_user.location.country}"
            if match_user.location and match_user.location.city
            else "Unknown location"
        )

        message_text = MATCH_PROFILE_TEMPLATE.format(
            name=escape_html(match_user.first_name),
            age=match_user.age,
            gender=match_user.gender.value if match_user.gender else "Not specified",
            bio=escape_html(match_user.bio) or "No bio provided",
            interests=escape_html(interests_text),
            location=escape_html(location_text),
        )

        # Determine buttons based on context
        buttons = []
        if match.status == MatchStatus.MATCHED:
            tg_link = f"tg://user?id={match_user.id}"
            buttons.append([InlineKeyboardButton(f"💬 Chat with {match_user.first_name}", url=tg_link)])
        else:
            buttons.append(
                [
                    InlineKeyboardButton("👍 Like", callback_data=f"like_{match.id}"),
                    InlineKeyboardButton("👎 Pass", callback_data=f"dislike_{match.id}"),
                ]
            )

        # Add Back button
        buttons.append([InlineKeyboardButton("⬅️ Back to Matches", callback_data="matches_page_0")])

        reply_markup = InlineKeyboardMarkup(buttons)

        # Delete the previous message (menu/list) to show media cleanly
        try:
            await query.delete_message()
        except Exception:
            pass  # Message might be too old or already deleted

        # Send media if available
        if match_user.photos and len(match_user.photos) > 0 and query.message and hasattr(query.message, "chat_id"):
            chat_id = cast(Message, query.message).chat_id
            await send_media_group_safe(context.bot.send_media_group, match_user.photos, chat_id=chat_id)

        if query.message and hasattr(query.message, "chat_id"):
            chat_id = cast(Message, query.message).chat_id
            await context.bot.send_message(chat_id=chat_id, text=message_text, reply_markup=reply_markup)

    except Exception as e:
        logger.error("Error viewing match", error=str(e), match_id=match_id)
        # If we fail, try to send error message
        try:
            if query.message and hasattr(query.message, "chat_id"):
                chat_id = cast(Message, query.message).chat_id
                await context.bot.send_message(chat_id=chat_id, text="Could not load profile. Please try again later.")
        except Exception:
            pass  # Silently ignore if we can't send the error message


@authenticated
@profile_required
async def matches_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle the /matches command.

    Displays a paginated list of the user's active (mutual) matches.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
    """
    # Apply rate limiting
    await user_command_limiter()(update, context)

    if not update.effective_user:
        return

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
        if update.message:
            await update.message.reply_text("Sorry, something went wrong. Please try again later.")


async def matches_pagination_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle pagination for matches list.

    Navigates between pages of active or saved matches.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
    """
    query = update.callback_query
    if not query or not update.effective_user:
        return

    await query.answer()

    user_id = str(update.effective_user.id)
    data = query.data
    if not data:
        return

    try:
        if data == "new_matches":
            # Delete the matches list and start matching
            try:
                if query.message:
                    await query.delete_message()
            except Exception:
                pass  # Message might already be deleted
            await match_command(update, context)
            return

        if data.startswith("matches_page_"):
            page = int(data.split("_")[-1])
            await show_matches_page(update, context, page)

        elif data.startswith("saved_matches_page_"):
            page = int(data.split("_")[-1])
            await show_saved_matches_page(update, context, page)

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
            pass  # Silently ignore if we can't send the error message


async def show_matches_page(update: Update, context: ContextTypes.DEFAULT_TYPE, page: int) -> None:
    """
    Show a page of active matches.

    Fetches active matches from the database, enforcing history limits for free users.
    Renders a list of matches with chat links.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
        page (int): The page number to display (0-based).
    """
    if not update.effective_user:
        return

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
        elif update.message:
            await update.message.reply_text(text, reply_markup=reply_markup)
        return

    # Get matches (fetch one extra to check if next page exists)
    matches = get_active_matches(user_id, limit=limit + 1, offset=offset)

    has_next = len(matches) > limit
    current_matches = matches[:limit]

    keyboard = []

    if not current_matches and page == 0:
        message = "You don't have any active matches yet."
    else:
        # Create message with matches list
        message = f"<b>Your Active Matches (Page {page + 1})</b>\n\n"

        for match in current_matches:
            # Get match user details
            match_user_id = match.user1_id if match.user2_id == user_id else match.user2_id
            match_user = get_user(match_user_id)

            # Add to message
            message += f"👤 <b>{escape_html(match_user.first_name)}</b>, {match_user.age}\n"

            # Add chat button
            tg_link = f"tg://user?id={match_user.id}"
            keyboard.append(
                [
                    InlineKeyboardButton(
                        f"💬 Chat with {match_user.first_name}",
                        url=tg_link,
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

    # Add "View Saved Matches" button
    keyboard.append([InlineKeyboardButton("📂 View Saved Matches", callback_data="saved_matches_page_0")])

    # Add "Find new matches" button
    keyboard.append([InlineKeyboardButton("🔍 Find new matches", callback_data="new_matches")])

    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.callback_query:
        await update.callback_query.edit_message_text(
            message,
            reply_markup=reply_markup,
        )
    elif update.message:
        await update.message.reply_text(
            message,
            reply_markup=reply_markup,
        )


async def show_saved_matches_page(update: Update, context: ContextTypes.DEFAULT_TYPE, page: int) -> None:
    """
    Show a page of saved matches.

    Saved matches are those the user has skipped/saved for later.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
        page (int): The page number to display (0-based).
    """
    if not update.effective_user:
        return

    user_id = str(update.effective_user.id)
    limit = 5
    offset = page * limit

    # Get matches (fetch one extra to check if next page exists)
    matches = get_saved_matches(user_id, limit=limit + 1, offset=offset)

    has_next = len(matches) > limit
    current_matches = matches[:limit]

    keyboard = []

    if not current_matches and page == 0:
        message = "You don't have any saved matches."
    else:
        # Create message with matches list
        message = f"<b>Saved Matches (Page {page + 1})</b>\n\n"

        for match in current_matches:
            # Get match user details
            # If I am user1 and I skipped, user2 is target.
            # If I am user2 and I skipped, user1 is target.
            match_user_id = match.user1_id if match.user2_id == user_id else match.user2_id
            match_user = get_user(match_user_id)

            # Add to message
            message += f"👤 <b>{escape_html(match_user.first_name)}</b>, {match_user.age}\n"

            # Add view profile button
            keyboard.append(
                [
                    InlineKeyboardButton(
                        "👤 View Profile",
                        callback_data=f"view_match_{match.id}",
                    )
                ]
            )

        # Add navigation buttons
        nav_row = []
        if page > 0:
            nav_row.append(InlineKeyboardButton("⬅️ Previous", callback_data=f"saved_matches_page_{page - 1}"))
        if has_next:
            nav_row.append(InlineKeyboardButton("Next ➡️", callback_data=f"saved_matches_page_{page + 1}"))

        if nav_row:
            keyboard.append(nav_row)

    # Add "View Active Matches" button
    keyboard.append([InlineKeyboardButton("🤝 View Active Matches", callback_data="matches_page_0")])

    # Add "Find new matches" button
    keyboard.append([InlineKeyboardButton("🔍 Find new matches", callback_data="new_matches")])

    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.callback_query:
        await update.callback_query.edit_message_text(
            message,
            reply_markup=reply_markup,
        )
    elif update.message:
        await update.message.reply_text(
            message,
            reply_markup=reply_markup,
        )


async def reengagement_response(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle re-engagement response (1 🚀 or 2).

    Processes quick replies from the re-engagement notification.
    "1 🚀" triggers matching, "2" dismisses the prompt.

    Args:
        update (Update): The update object.
        context (ContextTypes.DEFAULT_TYPE): The callback context.
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
