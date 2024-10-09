from telegram import ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardButton, InlineKeyboardMarkup

def get_profile_keyboard():
    keyboard = [
        ["Update Profile"],
        ["View Profile"]
    ]
    return ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True)

def get_update_profile_keyboard():
    keyboard = [
        ["Name", "Age"],
        ["Gender", "Looking for"],
        ["City", "Bio"],
        ["Done"]
    ]
    return ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True)

def get_back_keyboard():
    keyboard = [["Back"]]
    return ReplyKeyboardMarkup(keyboard, one_time_keyboard=True, resize_keyboard=True)

def get_main_menu_keyboard():
    # Example implementation of the main menu keyboard
    return {
        "keyboard": [
            [{"text": "Option 1"}, {"text": "Option 2"}],
            [{"text": "Help"}]
        ],
        "resize_keyboard": True,
        "one_time_keyboard": True
    }

def get_gender_keyboard():
    keyboard = [
        [KeyboardButton("Male"), KeyboardButton("Female")],
        [KeyboardButton("Other")]
    ]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True)