from telegram import KeyboardButton, ReplyKeyboardMarkup


def main_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["/profile", "/match"], ["/matches", "/settings"], ["/help"]],
        resize_keyboard=True,
    )


def registration_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["/name", "/age", "/gender"], ["/bio", "/interests"], ["/location", "/help"]],
        resize_keyboard=True,
    )


def profile_main_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["👤 View Profile", "🔎 Browse Profiles"], ["🛠 Edit Profile"], ["🖼 Update Photo", "✏️ Update Bio"], ["/help"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def cancel_keyboard(placeholder: str | None = None) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["Cancel"]],
        resize_keyboard=True,
        one_time_keyboard=True,
        input_field_placeholder=placeholder or None,
    )


def skip_keyboard(placeholder: str | None = None) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["Skip"]],
        resize_keyboard=True,
        one_time_keyboard=True,
        input_field_placeholder=placeholder or None,
    )


def gender_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["Male", "Female"], ["Cancel"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def gender_optional_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["Male", "Female"], ["Skip"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def location_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[KeyboardButton(text="Share Location", request_location=True)], ["Cancel"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def reengagement_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["1 🚀", "2"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def location_optional_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [[KeyboardButton(text="Share Location", request_location=True)], ["Skip"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def skip_cancel_keyboard(placeholder: str | None = None) -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["Skip", "Cancel"]],
        resize_keyboard=True,
        one_time_keyboard=True,
        input_field_placeholder=placeholder or None,
    )


def no_matches_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["/profile", "/settings"], ["/matches", "/help"]],
        resize_keyboard=True,
    )


def setup_profile_prompt_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["Setup Profile"], ["/profile"]],
        resize_keyboard=True,
    )


def location_candidates_keyboard(options: list[str]) -> ReplyKeyboardMarkup:
    rows = [[opt] for opt in options]
    rows.append(["Cancel"])
    return ReplyKeyboardMarkup(
        rows,
        resize_keyboard=True,
        one_time_keyboard=True,
    )
