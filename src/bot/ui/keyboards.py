from telegram import KeyboardButton, ReplyKeyboardMarkup


def main_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [
            ["🚀 Start Match", "👤 View Profile"],
            ["💤 Sleep / Pause", "📨 Invite Friend"],
            ["⚙️ Settings"],
        ],
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


def gender_preference_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        [["Men", "Women"], ["Skip"]],
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


def media_upload_keyboard(media_count: int = 0, max_count: int = 3, allow_done: bool = False) -> ReplyKeyboardMarkup:
    """Keyboard for multi-file upload with Done button.

    Args:
        media_count: Number of media files uploaded so far
        max_count: Maximum allowed media files
        allow_done: Whether to show Done button even if media_count is 0

    Returns:
        Keyboard with Done (if media uploaded or allowed) and Cancel buttons
    """
    rows = []
    if media_count > 0:
        rows.append([f"✅ Done ({media_count}/{max_count})"])
    elif allow_done:
        rows.append(["✅ Done"])
    rows.append(["Cancel"])
    return ReplyKeyboardMarkup(
        rows,
        resize_keyboard=True,
        one_time_keyboard=False,
        input_field_placeholder=f"Send photo/video ({media_count}/{max_count})",
    )
