from telegram import ReplyKeyboardMarkup, KeyboardButton

def get_main_menu_keyboard():
    keyboard = [
        [KeyboardButton("Find Match"), KeyboardButton("Update Preferences")],
        [KeyboardButton("View Profile"), KeyboardButton("Help")]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)

def get_gender_keyboard():
    keyboard = [
        [KeyboardButton("Male"), KeyboardButton("Female")],
        [KeyboardButton("Other")]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)