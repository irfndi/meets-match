import random
from datetime import datetime, timezone

from telegram.ext import ContextTypes

from src.bot.ui.keyboards import reengagement_keyboard
from src.models.user import Gender
from src.services.user_service import get_inactive_users, update_user
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Fibonacci sequence for inactivity reminders (in days)
INACTIVITY_DAYS = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]

# Placeholder image for "We Miss You" - can be replaced with actual asset URL
REMINDER_IMAGE_URL = "https://placehold.co/600x400/png?text=We+Miss+You"


async def inactive_user_reminder_job(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Job to send reminders to inactive users."""
    logger.info("Running inactive user reminder job")

    for days in INACTIVITY_DAYS:
        try:
            users = get_inactive_users(days)
            if not users:
                continue

            logger.info(f"Found {len(users)} users inactive for {days} days")

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

                    # Message variants
                    variants = [
                        f"Some {target_gender} from {city} want to chat with you right now! 👀\n\n1. Show them.\n2. Skip.",
                        f"New {target_gender} in {city} are looking for a match! 🔥\n\n1. Show them.\n2. Skip.",
                        f"You have new potential matches in {city}. Don't keep them waiting! ⏰\n\n1. Show them.\n2. Skip.",
                        f"👋 We miss you! Come back and find new matches in {city}.",
                        f"Someone in {city} might be your perfect match! 💘\n\n1. Show them.\n2. Skip.",
                        f"{city} is buzzing! 🐝 See who's online nearby.\n\n1. Show them.\n2. Skip.",
                    ]
                    
                    # Prioritize specific variants based on inactivity
                    if days <= 3:
                        msg = variants[0] # The "want to chat" variant is good for early re-engagement
                    elif days <= 7:
                        msg = variants[1]
                    else:
                        msg = random.choice(variants)

                    try:
                        # Send text message with re-engagement keyboard
                        await context.bot.send_message(
                            chat_id=user.id, 
                            text=msg,
                            reply_markup=reengagement_keyboard()
                        )
                    except Exception:
                        # Fallback
                        await context.bot.send_message(chat_id=user.id, text=msg)

                    # Update last_reminded_at
                    update_user(user.id, {"last_reminded_at": datetime.now(timezone.utc)})

                    logger.info(f"Sent reminder to user {user.id} (inactive {days} days)")

                except Exception as e:
                    logger.warning(f"Failed to send reminder to user {user.id}: {e}")

        except Exception as e:
            logger.error(f"Error processing inactivity for {days} days: {e}")
