"""Telegram bot application for the MeetMatch bot."""

import sentry_sdk
from telegram import BotCommand, Update
from telegram.error import Conflict
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
    gender_command,
    gender_selection,
    handle_text_message,
    help_command,
    interests_command,
    location_command,
    location_handler,
    match_callback,
    match_command,
    matches_command,
    matches_pagination_callback,
    name_command,
    photo_handler,
    premium_command,
    profile_command,
    reengagement_response,
    settings_callback,
    settings_command,
    settings_text_router,
    start_command,
    start_profile_setup,
    view_profile_callback,
)
from src.bot.jobs import auto_sleep_inactive_users_job, cleanup_old_media_job, inactive_user_reminder_job
from src.config import settings
from src.utils.errors import MeetMatchError
from src.utils.logging import get_logger

logger = get_logger(__name__)


class BotApplication:
    """Telegram bot application."""

    def __init__(self) -> None:
        """Initialize the bot application."""
        self.application: Application | None = None
        self.admin_ids: set[str] = set(settings.ADMIN_IDS.split(",") if settings.ADMIN_IDS else [])

        logger.info("Initializing bot application", admin_ids=self.admin_ids)

    def _build_application(self) -> Application:
        """Build and return the configured Application instance.

        Returns:
            Configured Application instance.
        """
        defaults = Defaults(
            parse_mode="HTML",
            allow_sending_without_reply=True,
        )
        return (
            Application.builder()
            .token(settings.TELEGRAM_BOT_TOKEN)
            .defaults(defaults)
            .post_init(self._post_init)
            .build()
        )

    async def setup(self) -> None:
        """Set up the bot application.

        Returns:
                None
        """
        self.application = self._build_application()
        self._register_handlers()
        logger.info("Bot application setup complete")

    async def _post_init(self, application: Application) -> None:
        """Set bot slash commands after application initialization.

        Args:
            application: The initialized Telegram Application instance.
        """
        # Register scheduled jobs
        if application.job_queue:
            application.job_queue.run_repeating(
                inactive_user_reminder_job,
                interval=86400,  # Run daily
                first=60,  # Start after 60 seconds
                name="inactive_user_reminder",
            )
            logger.info("Inactive user reminder job registered")

            application.job_queue.run_repeating(
                cleanup_old_media_job,
                interval=86400,  # Run daily
                first=3600,  # Start after 1 hour
                name="cleanup_old_media",
            )
            logger.info("Old media cleanup job registered")

            # Auto-sleep job - runs every minute to check for inactive users
            application.job_queue.run_repeating(
                auto_sleep_inactive_users_job,
                interval=60,  # Run every minute
                first=30,  # Start after 30 seconds
                name="auto_sleep_inactive_users",
            )
            logger.info("Auto-sleep inactive users job registered")

        try:
            await application.bot.set_my_commands(
                [
                    BotCommand("start", "Start the bot and register"),
                    BotCommand("help", "Show help information"),
                    BotCommand("about", "About MeetMatch"),
                    BotCommand("profile", "View and edit your profile"),
                    BotCommand("match", "Find new matches"),
                    BotCommand("matches", "View your matches"),
                    BotCommand("settings", "Adjust preferences"),
                    BotCommand("premium", "Premium features"),
                ]
            )
            logger.info("Bot slash commands registered")
        except Exception as e:
            logger.error("Failed to register bot commands", error=str(e), exc_info=e)

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

        # Settings commands
        self.application.add_handler(CommandHandler("settings", settings_command))
        self.application.add_handler(CommandHandler("premium", premium_command))

        # Help commands
        self.application.add_handler(CommandHandler("help", help_command))
        self.application.add_handler(CommandHandler("about", about_command))

        # Callback handlers
        self.application.add_handler(
            CallbackQueryHandler(match_callback, pattern=r"^(like_|dislike_|next_match|skip_notification|view_match_)")
        )
        self.application.add_handler(CallbackQueryHandler(view_profile_callback, pattern=r"^view_profile_"))
        self.application.add_handler(
            CallbackQueryHandler(
                matches_pagination_callback, pattern=r"^(matches_page_|saved_matches_page_|new_matches|back_to_matches)"
            )
        )
        self.application.add_handler(
            CallbackQueryHandler(
                settings_callback,
                pattern=r"^(settings.*|region_.*|language_.*|min_age_.*|max_age_.*|max_distance_.*|notifications_.*|back_to_settings)$",
            )
        )

        # Special handlers
        self.application.add_handler(MessageHandler(filters.LOCATION & filters.ChatType.PRIVATE, location_handler))
        self.application.add_handler(MessageHandler(filters.PHOTO & filters.ChatType.PRIVATE, photo_handler))
        self.application.add_handler(
            MessageHandler(
                filters.Regex(r"^(Male|Female)$") & filters.ChatType.PRIVATE,
                gender_selection,
            )
        )

        # Re-engagement response handler
        self.application.add_handler(
            MessageHandler(
                filters.Regex(r"^(1 🚀|2)$") & filters.ChatType.PRIVATE,
                reengagement_response,
            )
        )

        # Setup Profile button handler
        self.application.add_handler(
            MessageHandler(
                filters.Regex(r"^Setup Profile$") & filters.ChatType.PRIVATE,
                start_profile_setup,
            )
        )

        # Settings text options handler
        self.application.add_handler(
            MessageHandler(
                filters.Regex(r"^(🌍 Region|🗣 Language|💠 Premium|🔄 Reset.*|Region|Language|Premium|Reset.*)$")
                & filters.ChatType.PRIVATE,
                settings_text_router,
            )
        )

        # Profile text input handler (for conversational flow)
        self.application.add_handler(
            MessageHandler(
                filters.TEXT & ~filters.COMMAND & filters.ChatType.PRIVATE,
                handle_text_message,
            )
        )

        # Error handler
        self.application.add_error_handler(self._error_handler)

        logger.info("Handlers registered")

    async def _error_handler(self, update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle errors in the bot.

        Args:
                update: Update that caused the error
                context: Context with error information

        Returns:
                None
        """
        error = context.error

        # Cast update to Update if possible for type checking, though it can be None
        update_obj: Update | None = update if isinstance(update, Update) else None

        # Handle polling conflict explicitly to avoid repeated error spam
        if isinstance(error, Conflict):
            logger.critical(
                "Polling conflict detected: another bot instance is running for this token. Shutting down.",
                error=str(error),
                update_id=getattr(update_obj, "update_id", None),
            )
            # Exit gracefully and let the outer exception handler deal with it
            return

        # Get chat ID for error response
        chat_id = None
        if update_obj and hasattr(update_obj, "effective_chat") and update_obj.effective_chat:
            chat_id = update_obj.effective_chat.id

        if isinstance(error, MeetMatchError):
            # Handle custom errors
            logger.warning(
                "Bot error",
                error_type=error.__class__.__name__,
                error_message=str(error),
                error_details=getattr(error, "details", {}),
                update_id=getattr(update_obj, "update_id", None),
            )

            if chat_id:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text=f"Error: {error.message}",
                )
        else:
            # Handle unexpected errors
            if settings.SENTRY_DSN:
                with sentry_sdk.push_scope() as scope:
                    if update_obj and update_obj.effective_user:
                        scope.set_user(
                            {"id": update_obj.effective_user.id, "username": update_obj.effective_user.username}
                        )
                    if update_obj:
                        # Avoid circular reference or too large objects if possible, but to_dict() is usually fine for telegram objects
                        try:
                            scope.set_extra("update", update_obj.to_dict())
                        except Exception:
                            scope.set_extra("update", str(update_obj))
                    sentry_sdk.capture_exception(error)

            logger.error(
                "Unexpected bot error",
                error=str(error),
                update_id=getattr(update_obj, "update_id", None),
                exc_info=error,
            )

            if chat_id:
                await context.bot.send_message(
                    chat_id=chat_id,
                    text="An unexpected error occurred. Please try again later.",
                )

    def setup_sync(self) -> None:
        """Set up the bot application synchronously."""
        self.application = self._build_application()
        self._register_handlers()
        logger.info("Bot application setup complete")

    def run(self) -> None:
        """Run the bot application."""
        if not self.application:
            self.setup_sync()

        assert self.application is not None

        logger.info("Bot starting...")
        try:
            self.application.run_polling(drop_pending_updates=True, bootstrap_retries=-1)
        except Conflict as ce:
            logger.error(
                "Polling conflict detected: another bot instance is running for this token.",
                error=str(ce),
            )
            return
        except Exception as e:
            logger.error("Bot failed to start", error=str(e))
            raise
        logger.info("Bot stopped")

    @property
    def is_running(self) -> bool:
        """Check if the bot is running and polling."""
        if not self.application or not self.application.updater:
            return False
        return self.application.updater.running

    async def start(self) -> None:
        """Start the bot application in background mode (for API integration)."""
        if not self.application:
            await self.setup()

        assert self.application is not None

        logger.info("Bot starting in background mode...")
        await self.application.initialize()

        # Delete webhook before polling to avoid conflict
        try:
            logger.info("Ensuring webhook is deleted before polling...")
            await self.application.bot.delete_webhook(drop_pending_updates=True)
        except Exception as e:
            logger.warning("Failed to delete webhook", error=str(e))

        await self.application.start()
        if self.application.updater:
            try:
                # Use allowed_updates to filter updates if needed, but None gets all defaults
                await self.application.updater.start_polling(
                    drop_pending_updates=True,
                    bootstrap_retries=-1,  # Infinite retries to handle temporary connection issues
                    timeout=20,  # Increase timeout slightly
                )
            except Conflict as e:
                logger.error("Polling conflict detected during startup", error=str(e))
                raise  # Let caller handle the conflict

    async def stop(self) -> None:
        """Stop the bot application."""
        if self.application:
            logger.info("Bot stopping...")
            if self.application.updater:
                await self.application.updater.stop()
            await self.application.stop()
            await self.application.shutdown()
            logger.info("Bot stopped")


def start_bot() -> None:
    """Start the bot application."""
    bot = BotApplication()
    bot.run()
