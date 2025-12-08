import random
from datetime import datetime, timedelta, timezone

import sentry_sdk
from telegram.ext import ContextTypes

from src.bot.ui.keyboards import reengagement_keyboard
from src.models.user import Gender
from src.services.matching_service import get_pending_incoming_likes_count
from src.services.user_service import get_inactive_users, get_users_for_auto_sleep, set_user_sleeping, update_user
from src.utils.database import utcnow
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Fibonacci sequence for inactivity reminders (in days) - Modified for 3-day aggressive phase
INACTIVITY_DAYS = [1, 2, 3, 7, 14, 30]

# Auto-sleep inactivity threshold in minutes
AUTO_SLEEP_INACTIVITY_MINUTES = 15

# Placeholder image for "We Miss You" - can be replaced with actual asset URL
REMINDER_IMAGE_URL = "https://placehold.co/600x400/png?text=We+Miss+You"


async def auto_sleep_inactive_users_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Job to automatically put inactive users into sleep/pause mode.

    Users who have been inactive for AUTO_SLEEP_INACTIVITY_MINUTES minutes
    will be automatically set to sleeping status. Their profile remains visible
    to others in the match cycle, but they are in "paused" state.
    """
    logger.info("Running auto-sleep inactive users job")

    with sentry_sdk.start_span(op="job.auto_sleep", name="auto_sleep_inactive_users") as span:
        try:
            users = get_users_for_auto_sleep(AUTO_SLEEP_INACTIVITY_MINUTES)
            if not users:
                logger.debug("No users eligible for auto-sleep")
                span.set_data("eligible_users", 0)
                return

            logger.info("Found users eligible for auto-sleep", count=len(users))
            span.set_data("eligible_users", len(users))

            for user in users:
                try:
                    # Set user to sleeping
                    set_user_sleeping(user.id, True)

                    # Send notification to user about auto-sleep
                    try:
                        await context.bot.send_message(
                            chat_id=user.id,
                            text=(
                                "💤 *You've been automatically paused due to inactivity.*\n\n"
                                "Your profile remains visible to others in the match cycle.\n\n"
                                "We will notify you here if someone likes your profile! 🔔\n\n"
                                "Type /start to wake up and resume."
                            ),
                            parse_mode="Markdown",
                        )
                    except Exception as e:
                        # User might have blocked the bot or other issues
                        logger.warning("Failed to notify user about auto-sleep", user_id=user.id, error=str(e))

                    logger.info("Auto-slept user", user_id=user.id)

                except Exception as e:
                    logger.warning("Failed to auto-sleep user", user_id=user.id, error=str(e))

        except Exception as e:
            logger.error("Error in auto-sleep job", error=str(e))
            span.set_status("internal_error")
            span.set_data("error", str(e))


async def cleanup_old_media_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Job to delete old media files (> 1 year) that are no longer referenced."""
    from src.utils.media import get_storage_path

    logger.info("Running old media cleanup job")

    with sentry_sdk.start_span(op="job.cleanup", name="cleanup_old_media") as span:
        try:
            storage_path = get_storage_path()
            if not storage_path.exists():
                span.set_data("status", "no_storage_path")
                return

            # 1 year threshold
            threshold = datetime.now(timezone.utc) - timedelta(days=365)

            # Walk through user directories
            count = 0
            for user_dir in storage_path.iterdir():
                if not user_dir.is_dir():
                    continue

                for file_path in user_dir.iterdir():
                    if not file_path.is_file():
                        continue

                    # Check file modification time
                    mtime = datetime.fromtimestamp(file_path.stat().st_mtime, tz=timezone.utc)

                    if mtime < threshold:
                        try:
                            file_path.unlink()
                            count += 1
                        except Exception as e:
                            logger.error("Failed to delete old file", file_path=str(file_path), error=str(e))
                            span.set_data("error_file", str(file_path))

            logger.info("Cleanup complete", deleted_files=count)
            span.set_data("deleted_files", count)

        except Exception as e:
            logger.error("Error in media cleanup job", error=str(e))
            span.set_status("internal_error")
            span.set_data("error", str(e))


async def inactive_user_reminder_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Job to send reminders to inactive users."""
    logger.info("Running inactive user reminder job")

    with sentry_sdk.start_span(op="job.reminder", name="inactive_user_reminder") as span:
        total_reminded = 0
        try:
            for days in INACTIVITY_DAYS:
                try:
                    users = get_inactive_users(days)
                    if not users:
                        continue

                    logger.info("Found inactive users", count=len(users), days_inactive=days)

                    for user in users:
                        try:
                            # Check if already reminded recently (within 12 hours) to avoid double sends on restart
                            if user.last_reminded_at:
                                now = datetime.now(timezone.utc)
                                last_reminded = user.last_reminded_at
                                if last_reminded.tzinfo is None:
                                    last_reminded = last_reminded.replace(tzinfo=timezone.utc)

                                if (now - last_reminded).total_seconds() < 43200:  # 12 hours
                                    continue

                            # Generate personalized message
                            city = "nearby"
                            if user.location and user.location.city:
                                city = user.location.city

                            target_gender = "people"
                            if user.preferences and user.preferences.gender_preference:
                                prefs = user.preferences.gender_preference
                                if len(prefs) == 1:
                                    if prefs[0] == Gender.FEMALE:
                                        target_gender = "women"
                                    elif prefs[0] == Gender.MALE:
                                        target_gender = "men"

                            # Determine message based on inactivity duration and pending matches
                            if days <= 3:
                                # Check for pending likes
                                try:
                                    pending_likes = get_pending_incoming_likes_count(user.id)
                                except Exception:
                                    pending_likes = 0

                                if pending_likes > 0:
                                    # Match-based re-engagement (Aggressive)
                                    msg = random.choice(
                                        [
                                            f"Some {target_gender} from {city} want to chat with you right now! 👀\n\n1. Show them.\n2. Skip.",
                                            f"You have pending matches in {city}! 🔥\n\n1. Show them.\n2. Skip.",
                                            f"Someone in {city} liked your profile! 💘\n\n1. Show them.\n2. Skip.",
                                        ]
                                    )
                                else:
                                    # Generic re-engagement (New people nearby)
                                    msg = random.choice(
                                        [
                                            f"New {target_gender} in {city} are looking for a match! 🔥\n\n1. Show them.\n2. Skip.",
                                            f"You have new potential matches in {city}. Don't keep them waiting! ⏰\n\n1. Show them.\n2. Skip.",
                                            f"{city} is buzzing! 🐝 See who's online nearby.\n\n1. Show them.\n2. Skip.",
                                        ]
                                    )
                            else:
                                # > 3 days: Standard re-engagement (Fibonacci)
                                msg = f"👋 We miss you! Come back and find new matches in {city}."

                            try:
                                # Send text message with re-engagement keyboard
                                await context.bot.send_message(
                                    chat_id=user.id, text=msg, reply_markup=reengagement_keyboard()
                                )
                            except Exception as keyboard_error:
                                # Fallback - log and try without keyboard
                                logger.debug(
                                    "Keyboard send failed, trying fallback",
                                    user_id=user.id,
                                    error=str(keyboard_error),
                                )
                                try:
                                    await context.bot.send_message(chat_id=user.id, text=msg)
                                except Exception as fallback_error:
                                    logger.warning(
                                        "Fallback send also failed",
                                        user_id=user.id,
                                        keyboard_error=str(keyboard_error),
                                        fallback_error=str(fallback_error),
                                    )
                                    raise

                            # Update last_reminded_at
                            update_user(user.id, {"last_reminded_at": utcnow()})
                            total_reminded += 1

                            logger.info("Sent reminder to user", user_id=user.id, days_inactive=days)

                        except Exception as e:
                            logger.warning("Failed to send reminder to user", user_id=user.id, error=str(e))

                except Exception as e:
                    logger.error("Error processing inactivity bucket", days=days, error=str(e))

            span.set_data("total_reminded", total_reminded)

        except Exception as e:
            span.set_status("internal_error")
            span.set_data("error", str(e))
