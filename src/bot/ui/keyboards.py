from telegram import KeyboardButton, ReplyKeyboardMarkup


def main_menu() -> ReplyKeyboardMarkup:
    """
    Create the main menu keyboard.

    Returns:
        ReplyKeyboardMarkup: The main menu keyboard.
    """
    return ReplyKeyboardMarkup(
        [
            ["🚀 Start Match", "👤 View Profile"],
            ["💤 Sleep / Pause", "📨 Invite Friend"],
            ["⚙️ Settings"],
        ],
        resize_keyboard=True,
    )


def registration_menu() -> ReplyKeyboardMarkup:
    """
    Create the registration/profile command menu.

    Returns:
        ReplyKeyboardMarkup: The registration menu keyboard.
    """
    return ReplyKeyboardMarkup(
        [["/name", "/age", "/gender"], ["/bio", "/interests"], ["/location", "/help"]],
        resize_keyboard=True,
    )


def profile_main_menu() -> ReplyKeyboardMarkup:
    """
    Create the profile management menu.

    Returns:
        ReplyKeyboardMarkup: The profile main menu keyboard.
    """
    return ReplyKeyboardMarkup(
        [["👤 View Profile", "🔎 Browse Profiles"], ["🛠 Edit Profile"], ["🖼 Update Photo", "✏️ Update Bio"], ["/help"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def cancel_keyboard(placeholder: str | None = None) -> ReplyKeyboardMarkup:
    """
    Create a keyboard with a 'Cancel' button.

    Args:
        placeholder (str | None): Placeholder text for the input field.

    Returns:
        ReplyKeyboardMarkup: The cancel keyboard.
    """
    return ReplyKeyboardMarkup(
        [["Cancel"]],
        resize_keyboard=True,
        one_time_keyboard=True,
        input_field_placeholder=placeholder or None,
    )


def skip_keyboard(placeholder: str | None = None) -> ReplyKeyboardMarkup:
    """
    Create a keyboard with a 'Skip' button.

    Args:
        placeholder (str | None): Placeholder text for the input field.

    Returns:
        ReplyKeyboardMarkup: The skip keyboard.
    """
    return ReplyKeyboardMarkup(
        [["Skip"]],
        resize_keyboard=True,
        one_time_keyboard=True,
        input_field_placeholder=placeholder or None,
    )


def gender_keyboard() -> ReplyKeyboardMarkup:
    """
    Create a keyboard for gender selection (Male/Female/Cancel).

    Returns:
        ReplyKeyboardMarkup: The gender selection keyboard.
    """
    return ReplyKeyboardMarkup(
        [["Male", "Female"], ["Cancel"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def gender_optional_keyboard() -> ReplyKeyboardMarkup:
    """
    Create a keyboard for optional gender selection (Male/Female/Skip).

    Returns:
        ReplyKeyboardMarkup: The optional gender selection keyboard.
    """
    return ReplyKeyboardMarkup(
        [["Male", "Female"], ["Skip"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def gender_preference_keyboard() -> ReplyKeyboardMarkup:
    """
    Create a keyboard for gender preference selection (Men/Women/Skip).

    Returns:
        ReplyKeyboardMarkup: The gender preference keyboard.
    """
    return ReplyKeyboardMarkup(
        [["Men", "Women"], ["Skip"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def gender_preference_required_keyboard() -> ReplyKeyboardMarkup:
    """
    Create a keyboard for required gender preference selection (Men/Women/Both/Cancel).

    Returns:
        ReplyKeyboardMarkup: The required gender preference keyboard.
    """
    return ReplyKeyboardMarkup(
        [["Men", "Women"], ["Both"], ["Cancel"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def location_keyboard() -> ReplyKeyboardMarkup:
    """
    Create a keyboard with a 'Share Location' button and 'Cancel'.

    Returns:
        ReplyKeyboardMarkup: The location sharing keyboard.
    """
    return ReplyKeyboardMarkup(
        [[KeyboardButton(text="Share Location", request_location=True)], ["Cancel"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def reengagement_keyboard() -> ReplyKeyboardMarkup:
    """
    Create a keyboard for re-engagement responses.

    Returns:
        ReplyKeyboardMarkup: The re-engagement keyboard.
    """
    return ReplyKeyboardMarkup(
        [["1 🚀", "2"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def location_optional_keyboard() -> ReplyKeyboardMarkup:
    """
    Create a keyboard with a 'Share Location' button and 'Skip'.

    Returns:
        ReplyKeyboardMarkup: The optional location sharing keyboard.
    """
    return ReplyKeyboardMarkup(
        [[KeyboardButton(text="Share Location", request_location=True)], ["Skip"]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def skip_cancel_keyboard(placeholder: str | None = None) -> ReplyKeyboardMarkup:
    """
    Create a keyboard with 'Skip' and 'Cancel' buttons.

    Args:
        placeholder (str | None): Placeholder text for the input field.

    Returns:
        ReplyKeyboardMarkup: The skip/cancel keyboard.
    """
    return ReplyKeyboardMarkup(
        [["Skip", "Cancel"]],
        resize_keyboard=True,
        one_time_keyboard=True,
        input_field_placeholder=placeholder or None,
    )


def no_matches_menu() -> ReplyKeyboardMarkup:
    """
    Create a menu for when no matches are found.

    Returns:
        ReplyKeyboardMarkup: The no matches menu keyboard.
    """
    return ReplyKeyboardMarkup(
        [["/profile", "/settings"], ["/matches", "/help"]],
        resize_keyboard=True,
    )


def setup_profile_prompt_keyboard() -> ReplyKeyboardMarkup:
    """
    Create a keyboard prompting the user to setup their profile.

    Returns:
        ReplyKeyboardMarkup: The setup profile prompt keyboard.
    """
    return ReplyKeyboardMarkup(
        [["Setup Profile"], ["/profile"]],
        resize_keyboard=True,
    )


def location_candidates_keyboard(options: list[str]) -> ReplyKeyboardMarkup:
    """
    Create a keyboard with a list of location candidates.

    Args:
        options (list[str]): List of location option strings.

    Returns:
        ReplyKeyboardMarkup: The location candidates keyboard.
    """
    rows = [[opt] for opt in options]
    rows.append(["Cancel"])
    return ReplyKeyboardMarkup(
        rows,
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def media_upload_keyboard(media_count: int = 0, max_count: int = 3, allow_done: bool = False) -> ReplyKeyboardMarkup:
    """
    Create a keyboard for multi-file media upload.

    Displays progress and allows the user to finish uploading or cancel.

    Args:
        media_count (int): Number of media files uploaded so far.
        max_count (int): Maximum allowed media files.
        allow_done (bool): Whether to show the 'Done' button even if no new media has been uploaded
                           (useful for skipping updates or when existing media is present).

    Returns:
        ReplyKeyboardMarkup: The media upload keyboard.
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
