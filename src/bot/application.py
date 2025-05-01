"""Telegram bot application for the MeetMatch bot."""

import asyncio
from typing import Optional, Set

from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    Defaults,
    MessageHandler,
    filters,
)

from src.bot.handlers import (
    about_command,
    age_command,
    bio_command,
    chat_callback,
    chat_command,
    gender_command,
    handle_location,
    help_command,
    interests_command,
    location_command,
    match_callback,
    match_command,
    matches_command,
    message_handler,
    name_command,
    profile_command,
    settings_callback,
    settings_command,
    start_command,
)

# Middleware imports will be added as needed
from src.config import get_settings
from src.utils.errors import MeetMatchError
from src.utils.logging import configure_logging, get_logger

logger = get_logger(__name__)


class BotApplication:
    """Telegram bot application."""

    def __init__(self) -> None:
        """Initialize the bot application."""
        self.application: Optional[Application] = None
        self.admin_ids: Set[str] = set(get_settings().ADMIN_IDS.split(",") if get_settings().ADMIN_IDS else [])

        logger.info("Initializing bot application", admin_ids=self.admin_ids)

    async def setup(self) -> None:
        """Set up the bot application.

        Returns:
                None
        """
        # Create application with defaults
        defaults = Defaults(
            parse_mode="HTML",
            allow_sending_without_reply=True,
        )

        # Initialize application
        self.application = Application.builder().token(get_settings().TELEGRAM_TOKEN).defaults(defaults).build()

        # Register handlers
        self._register_handlers()

        logger.info("Bot application setup complete")

    def _register_handlers(self) -> None:
        """Register all handlers.

        Returns:
                None
        """
        if not self.application:
            raise MeetMatchError("Application not initialized")

        # Start and registration
        self.application.add_handler(CommandHandler("start", start_command))

        # Profile commands
        self.application.add_handler(CommandHandler("profile", profile_command))
        self.application.add_handler(CommandHandler("name", name_command))
        self.application.add_handler(CommandHandler("age", age_command))
        self.application.add_handler(CommandHandler("gender", gender_command))
        self.application.add_handler(CommandHandler("bio", bio_command))
        self.application.add_handler(CommandHandler("interests", interests_command))
        self.application.add_handler(CommandHandler("location", location_command))

        # Match commands
        self.application.add_handler(CommandHandler("match", match_command))
        self.application.add_handler(CommandHandler("matches", matches_command))

        # Chat commands
        self.application.add_handler(CommandHandler("chat", chat_command))

        # Settings commands
        self.application.add_handler(CommandHandler("settings", settings_command))

        # Help commands
        self.application.add_handler(CommandHandler("help", help_command))
        self.application.add_handler(CommandHandler("about", about_command))

        # Callback handlers
        self.application.add_handler(CallbackQueryHandler(match_callback, pattern=r"^(like_|dislike_|next_match)"))
        self.application.add_handler(CallbackQueryHandler(chat_callback, pattern=r"^(chat_|back_to_matches)"))
        self.application.add_handler(
            CallbackQueryHandler(
                settings_callback,
                pattern=r"^(settings_|looking_for_|min_age_|max_age_|max_distance_|notifications_|back_to_settings)",
            )
        )

        # Special handlers
        self.application.add_handler(MessageHandler(filters.LOCATION & filters.ChatType.PRIVATE, handle_location))

        # Message handler (for chat)
        self.application.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND & filters.ChatType.PRIVATE, message_handler)
        )

        # Error handler
        self.application.add_error_handler(self._error_handler)

        logger.info("Handlers registered")

    async def _error_handler(self, update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle errors in the bot.

        Args:
                update: Update that caused the error
                context: Context with error information

        Returns:
                None
        """
        error = context.error

        # Get chat ID for error response
        chat_id = update.effective_chat.id if update and update.effective_chat else None

        if isinstance(error, MeetMatchError):
            # Handle custom errors
            logger.warning(
                "Bot error",
                error_type=error.__class__.__name__,
                error_message=str(error),
                error_details=getattr(error, "details", {}),
                update_id=update.update_id if update else None,
            )

            if chat_id:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=f"Error: {error.message}",
                )
        else:
            # Handle unexpected errors
            logger.error(
                "Unexpected bot error",
                error=str(error),
                update_id=update.update_id if update else None,
                exc_info=error,
            )

            if chat_id:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text="An unexpected error occurred. Please try again later.",
                )

    async def run(self) -> None:
        """Run the bot application.

        Returns:
                None
        """
        if not self.application:
            await self.setup()

        # Start the bot
        await self.application.initialize()
        await self.application.start()

        logger.info("Bot started")

        try:
            # Run until stopped
            await self.application.updater.start_polling()
            await self.application.updater.idle()
        finally:
            # Stop the bot
            await self.application.stop()
            await self.application.shutdown()

            logger.info("Bot stopped")


async def run_bot() -> None:
    """Run the bot application.

    Returns:
        None
    """
    bot = BotApplication()
    await bot.run()


def start_bot() -> None:
    """Start the bot application.

    Returns:
        None
    """
    # Configure logging first
    configure_logging(
        get_settings().LOG_LEVEL, get_settings().ENVIRONMENT, get_settings().SENTRY_DSN, get_settings().ENABLE_SENTRY
    )

    asyncio.run(run_bot())
