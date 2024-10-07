from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes, CommandHandler, CallbackQueryHandler
from utils.menu import show_profile_menu
from utils.database import get_user_profile, update_user_profile
from utils.constants import PROFILE_FIELDS

async def profile(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle the /profile command."""
    await show_profile_menu(update, context)

async def profile_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle profile-related callbacks."""
    query = update.callback_query
    await query.answer()

    action = query.data.split('_')[1]
    if action == 'view':
        user_profile = await get_user_profile(update.effective_user.id)
        profile_text = "\n".join([f"{field.title()}: {value}" for field, value in user_profile.items()])
        await query.edit_message_text(text=f"Your profile:\n\n{profile_text}")
    elif action == 'edit':
        keyboard = [
            [InlineKeyboardButton(field.title(), callback_data=f'profile_edit_{field}')]
            for field in PROFILE_FIELDS
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text("Select a field to edit:", reply_markup=reply_markup)
    elif action.startswith('edit_'):
        field = action.split('_')[1]
        context.user_data['editing_field'] = field
        await query.edit_message_text(f"Please enter your new {field}:")
    else:
        await query.edit_message_text("Invalid action.")

async def profile_input_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle user input for profile editing."""
    field = context.user_data.get('editing_field')
    if field:
        new_value = update.message.text
        await update_user_profile(update.effective_user.id, {field: new_value})
        del context.user_data['editing_field']
        await update.message.reply_text(f"Your {field} has been updated to: {new_value}")
        await show_profile_menu(update, context)

def setup_profile_handlers(application):
    """Set up handlers for profile-related commands and callbacks."""
    application.add_handler(CommandHandler("profile", profile))
    application.add_handler(CallbackQueryHandler(profile_handler, pattern='^profile_'))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, profile_input_handler))

__all__ = ['profile', 'profile_handler', 'profile_input_handler', 'setup_profile_handlers']