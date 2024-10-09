import pytest
from bot.utils.validators import validate_age, validate_gender
from bot.utils.helpers import cancel_command, validate_age_range, parse_interests
from unittest.mock import AsyncMock, MagicMock

def test_validate_age():
    assert validate_age("25", 18, 100) is True
    assert validate_age("17", 18, 100) is False
    assert validate_age("101", 18, 100) is False
    assert validate_age("not a number", 18, 100) is False

def test_validate_gender():
    assert validate_gender("Male") is True
    assert validate_gender("Female") is True
    assert validate_gender("Other") is True
    assert validate_gender("Invalid") is False

@pytest.mark.asyncio
async def test_cancel_command():
    update = AsyncMock()
    context = MagicMock()

    await cancel_command(update, context)

    update.message.reply_text.assert_called_once_with("Command cancelled. What would you like to do next?", parse_mode='MarkdownV2')

def test_validate_age_range():
    assert validate_age_range("25", "35") == (25, 35)
    with pytest.raises(ValueError):
        validate_age_range("not a number", "35")
    with pytest.raises(ValueError):
        validate_age_range("25", "not a number")
    with pytest.raises(ValueError):
        validate_age_range("35", "25")

def test_parse_interests():
    assert parse_interests("reading, writing, coding") == ["reading", "writing", "coding"]
    assert parse_interests("  reading,   writing  ,coding  ") == ["reading", "writing", "coding"]
    assert parse_interests("") == []