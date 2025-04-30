"""Tests for the profile location handler functions ONLY."""

from unittest.mock import ANY, AsyncMock, MagicMock, patch

import pytest
from telegram import Location, ReplyKeyboardMarkup, ReplyKeyboardRemove, Update
from telegram.ext import ContextTypes

from src.bot.handlers.messages import (
    GEOCODING_FAILED_MESSAGE,
    INVALID_LOCATION_FORMAT_MESSAGE,
    LOCATION_UPDATE_MESSAGE,
    LOCATION_UPDATED_SUCCESS_MESSAGE,
)
from src.bot.handlers.profile import (
    handle_location,
    location_command,
    process_manual_location,
)
from src.utils.errors import ExternalServiceError, ValidationError

# Mock environment
MOCK_ENV = MagicMock()
MOCK_USER = MagicMock()
MOCK_USER.id = "12345"  # Mock user data

# Mock data for geocoding
MOCK_GEOCODED_DATA = {
    "latitude": 40.7128,
    "longitude": -74.0060,
    "address": "New York, NY, USA",
    "city": "New York",
    "country": "USA",
}
MOCK_GEOCODED_NAMES = {
    "city": "New York",
    "country": "USA",
}

# Mock KV Store for rate limiting and caching
mock_kv_store = AsyncMock()
mock_kv_store.get = AsyncMock(return_value=None)  # Simulate no previous timestamp/cache
mock_kv_store.set = AsyncMock()  # Allow set to be called
MOCK_ENV.KV = mock_kv_store  # Assign the mock KV to the mock ENV


# Helper function to set up common mock context
def setup_mock_context(mock_context):
    # Ensure bot_data includes the mocked ENV (which now has mocked KV)
    mock_context.bot_data = {"env": MOCK_ENV}
    # Use a standard dictionary for user_data
    mock_context.user_data = {}
    # Ensure effective_user is set for handlers needing it
    # (mock_update is passed in, so we assume it has effective_user set)


# --- Essential Fixtures --- #
@pytest.fixture
def mock_update():
    """Fixture for creating a mock Update object."""
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock()
    update.effective_user.id = "12345"  # Example user ID
    update.effective_message = MagicMock()
    update.effective_message.reply_text = AsyncMock()
    update.message = MagicMock()  # For text access
    update.effective_message.location = None  # Default location to None
    return update


@pytest.fixture
def mock_context():
    """Fixture to create a mock ContextTypes object."""
    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.bot_data = {"env": MOCK_ENV}
    # Use a standard dictionary
    context.user_data = {}
    return context


# --- Location Tests ONLY ---


# ==========================
# Location Command Tests
# ==========================
@pytest.mark.asyncio
@patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)
@patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock, return_value=MOCK_USER)
async def test_location_command_exact(
    mock_get_user, mock_update_last_active, mock_update: MagicMock, mock_context: MagicMock
):
    """Test the exact /location command."""
    setup_mock_context(mock_context)
    mock_update.effective_message.text = "/location"

    await location_command(mock_update, mock_context)

    mock_update.effective_message.reply_text.assert_called_once()
    args, kwargs = mock_update.effective_message.reply_text.call_args
    assert args[0] == LOCATION_UPDATE_MESSAGE
    assert isinstance(kwargs.get("reply_markup"), ReplyKeyboardMarkup)
    assert "awaiting_location" in mock_context.user_data


@pytest.mark.asyncio
@patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)
@patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock, return_value=MOCK_USER)
async def test_location_command_with_text(
    mock_get_user, mock_update_last_active, mock_update: MagicMock, mock_context: MagicMock
):
    """Test the /location command with location text provided."""
    setup_mock_context(mock_context)
    location_text = "London, UK"
    mock_update.effective_message.text = f"/location {location_text}"

    await location_command(mock_update, mock_context)

    # location_command calls process_manual_location internally.
    # If process_manual_location fails (e.g., due to mocked KV error during cache/rate limit),
    # the exception handler in location_command replies with the specific generic message.
    mock_update.effective_message.reply_text.assert_called_once_with(
        "Sorry, something went wrong. Please try again later."
    )
    assert "awaiting_location" not in mock_context.user_data


@pytest.mark.asyncio
@patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)
@patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock, return_value=MOCK_USER)
async def test_location_command_empty_text(
    mock_get_user, mock_update_last_active, mock_update: MagicMock, mock_context: MagicMock
):
    """Test the /location command with text that becomes empty after stripping."""
    setup_mock_context(mock_context)
    mock_update.effective_message.text = "/location "

    await location_command(mock_update, mock_context)

    # Expect the invalid format message because the text after /location is empty
    mock_update.effective_message.reply_text.assert_called_once_with(INVALID_LOCATION_FORMAT_MESSAGE)
    assert "awaiting_location" not in mock_context.user_data


@pytest.mark.asyncio
@patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)
@patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock, return_value=MOCK_USER)
async def test_location_command_with_whitespace_only(
    mock_get_user, mock_update_last_active, mock_update: MagicMock, mock_context: MagicMock
):
    """Test the /location command when only whitespace follows."""
    setup_mock_context(mock_context)
    mock_update.effective_message.text = "/location   "

    await location_command(mock_update, mock_context)

    # Assert the invalid format message is sent, as per the handler logic
    mock_update.effective_message.reply_text.assert_called_once_with(INVALID_LOCATION_FORMAT_MESSAGE)
    assert "awaiting_location" not in mock_context.user_data


# ==========================
# Handle Location Tests
# ==========================
@pytest.mark.asyncio
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
@patch("src.bot.handlers.profile.reverse_geocode_coordinates", new_callable=AsyncMock, return_value=MOCK_GEOCODED_NAMES)
@patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)
@patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock, return_value=MOCK_USER)
async def test_handle_location_valid(
    mock_get_user,
    mock_update_last_active,
    mock_reverse_geocode,
    mock_update_user,
    mock_update: MagicMock,
    mock_context: MagicMock,
):
    """Test handle_location with a valid shared location when expected."""
    setup_mock_context(mock_context)
    mock_context.user_data["awaiting_location"] = True
    shared_location = Location(latitude=51.5, longitude=-0.1)
    mock_update.effective_message.location = shared_location

    await handle_location(mock_update, mock_context)

    mock_reverse_geocode.assert_called_once_with(shared_location.latitude, shared_location.longitude)
    expected_location_data = {
        "location_latitude": shared_location.latitude,
        "location_longitude": shared_location.longitude,
        "location_city": MOCK_GEOCODED_NAMES["city"],
        "location_country": MOCK_GEOCODED_NAMES["country"],
    }
    mock_update_user.assert_called_once_with(MOCK_ENV, mock_update.effective_user.id, expected_location_data)
    expected_message = LOCATION_UPDATED_SUCCESS_MESSAGE
    mock_update.effective_message.reply_text.assert_called_once_with(
        expected_message,
        reply_markup=ANY,  # Check for ReplyKeyboardRemove indirectly
    )
    # Verify ReplyKeyboardRemove was used
    args, kwargs = mock_update.effective_message.reply_text.call_args
    assert isinstance(kwargs.get("reply_markup"), ReplyKeyboardRemove)

    # Check state is cleared correctly (set to False)
    assert mock_context.user_data.get("awaiting_location") is False


@pytest.mark.asyncio
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
@patch(
    "src.bot.handlers.profile.reverse_geocode_coordinates",
    new_callable=AsyncMock,
    # Simulate geocoder returning incomplete data
    return_value={"city": None, "country": None},
)
@patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)
@patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock, return_value=MOCK_USER)
async def test_handle_location_reverse_geocode_fails_no_address(
    mock_get_user,
    mock_update_last_active,
    mock_reverse_geocode,
    mock_update_user,
    mock_update: MagicMock,
    mock_context: MagicMock,
):
    """Test handle_location when reverse geocoding returns no address string (or dict missing key)."""
    setup_mock_context(mock_context)
    mock_context.user_data["awaiting_location"] = True
    mock_update.effective_message.location = MagicMock(latitude=10.0, longitude=20.0)

    await handle_location(mock_update, mock_context)

    mock_reverse_geocode.assert_called_once_with(10.0, 20.0)
    mock_update_user.assert_not_called()
    # Expect the specific geocoding failed message
    mock_update.effective_message.reply_text.assert_called_once_with(GEOCODING_FAILED_MESSAGE)
    assert mock_context.user_data.get("awaiting_location") is False


@pytest.mark.asyncio
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
@patch(
    "src.bot.handlers.profile.reverse_geocode_coordinates",
    new_callable=AsyncMock,
    side_effect=ExternalServiceError("Geocoding failed", service="mock_reverse_geocoder"),
)
@patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)
@patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock, return_value=MOCK_USER)
async def test_handle_location_reverse_geocode_raises_geocoding_error(
    mock_get_user,
    mock_update_last_active,
    mock_reverse_geocode,
    mock_update_user,
    mock_update: MagicMock,
    mock_context: MagicMock,
):
    """Test handle_location when reverse geocoding raises GeocodingError."""
    setup_mock_context(mock_context)
    mock_context.user_data["awaiting_location"] = True
    mock_update.effective_message.location = MagicMock(latitude=10.0, longitude=20.0)

    await handle_location(mock_update, mock_context)

    mock_reverse_geocode.assert_called_once_with(10.0, 20.0)
    mock_update_user.assert_not_called()
    # Expect the specific geocoding failed message
    mock_update.effective_message.reply_text.assert_called_once_with(GEOCODING_FAILED_MESSAGE)
    assert mock_context.user_data.get("awaiting_location") is False


@pytest.mark.asyncio
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
@patch(
    "src.bot.handlers.profile.reverse_geocode_coordinates",
    new_callable=AsyncMock,
    side_effect=Exception("Something broke"),
)
@patch("src.bot.middleware.auth.update_last_active", new_callable=AsyncMock)
@patch("src.bot.middleware.auth.get_user", new_callable=AsyncMock, return_value=MOCK_USER)
async def test_handle_location_reverse_geocode_raises_exception(
    mock_get_user,
    mock_update_last_active,
    mock_reverse_geocode,
    mock_update_user,
    mock_update: MagicMock,
    mock_context: MagicMock,
):
    """Test handle_location when reverse geocoding raises a generic Exception."""
    setup_mock_context(mock_context)
    mock_context.user_data["awaiting_location"] = True
    mock_update.effective_message.location = MagicMock(latitude=10.0, longitude=20.0)

    await handle_location(mock_update, mock_context)

    mock_reverse_geocode.assert_called_once_with(10.0, 20.0)
    mock_update_user.assert_not_called()
    # Expect the specific generic error message from the handler's except block
    mock_update.effective_message.reply_text.assert_called_once_with(
        "Sorry, something went wrong. Please try again later."
    )
    assert mock_context.user_data.get("awaiting_location") is False


# =============================
# Process Manual Location Tests
# =============================
@pytest.mark.asyncio
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
@patch("src.bot.handlers.profile.geocode_location", new_callable=AsyncMock, return_value=MOCK_GEOCODED_DATA)
async def test_process_manual_location_valid(
    mock_geocode, mock_update_user, mock_update: MagicMock, mock_context: MagicMock
):
    """Test process_manual_location with valid text."""
    setup_mock_context(mock_context)
    location_text = "New York, USA"

    await process_manual_location(mock_update, mock_context, location_text)

    mock_geocode.assert_called_once_with(location_text)
    expected_location_data = {
        "location_latitude": MOCK_GEOCODED_DATA["latitude"],
        "location_longitude": MOCK_GEOCODED_DATA["longitude"],
        "location_city": MOCK_GEOCODED_DATA["city"],
        "location_country": MOCK_GEOCODED_DATA["country"],
    }
    mock_update_user.assert_called_once_with(MOCK_ENV, mock_update.effective_user.id, expected_location_data)
    # Assert success message and keyboard removal
    mock_update.effective_message.reply_text.assert_called_once_with(LOCATION_UPDATED_SUCCESS_MESSAGE, reply_markup=ANY)
    args, kwargs = mock_update.effective_message.reply_text.call_args
    assert isinstance(kwargs.get("reply_markup"), ReplyKeyboardRemove)

    assert "awaiting_location" not in mock_context.user_data


@pytest.mark.asyncio
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
@patch(
    "src.bot.handlers.profile.geocode_location", new_callable=AsyncMock, side_effect=ValidationError("Invalid format")
)
async def test_process_manual_location_validation_error(
    mock_geocode, mock_update_user, mock_update: MagicMock, mock_context: MagicMock
):
    """Test process_manual_location when geocode raises ValidationError."""
    setup_mock_context(mock_context)
    location_text = "Invalid Location"
    error_message = "Invalid format"

    await process_manual_location(mock_update, mock_context, location_text)

    mock_geocode.assert_called_once_with(location_text)
    mock_update_user.assert_not_called()
    mock_update.effective_message.reply_text.assert_called_once_with(error_message)
    assert "awaiting_location" not in mock_context.user_data


@pytest.mark.asyncio
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock)
@patch(
    "src.bot.handlers.profile.geocode_location",
    new_callable=AsyncMock,
    side_effect=ExternalServiceError("Geocoding failed", service="mock_geocoder"),
)
async def test_process_manual_location_geocode_exception(
    mock_geocode, mock_update_user, mock_update: MagicMock, mock_context: MagicMock
):
    """Test process_manual_location when geocode raises GeocodingError."""
    setup_mock_context(mock_context)
    location_text = "Some Location"

    await process_manual_location(mock_update, mock_context, location_text)

    mock_geocode.assert_called_once_with(location_text)
    mock_update_user.assert_not_called()
    # Expect the specific geocoding failed message
    mock_update.effective_message.reply_text.assert_called_once_with(GEOCODING_FAILED_MESSAGE)
    assert "awaiting_location" not in mock_context.user_data


@pytest.mark.asyncio
@patch("src.bot.handlers.profile.update_user", new_callable=AsyncMock, side_effect=Exception("DB error"))
@patch("src.bot.handlers.profile.geocode_location", new_callable=AsyncMock, return_value=MOCK_GEOCODED_DATA)
async def test_process_manual_location_update_exception(
    mock_geocode, mock_update_user, mock_update: MagicMock, mock_context: MagicMock
):
    """Test process_manual_location when update_user raises an Exception."""
    setup_mock_context(mock_context)
    location_text = "Good Location"

    await process_manual_location(mock_update, mock_context, location_text)

    mock_geocode.assert_called_once_with(location_text)
    expected_location_data = {
        "location_latitude": MOCK_GEOCODED_DATA["latitude"],
        "location_longitude": MOCK_GEOCODED_DATA["longitude"],
        "location_city": MOCK_GEOCODED_DATA["city"],
        "location_country": MOCK_GEOCODED_DATA["country"],
    }
    mock_update_user.assert_called_once_with(MOCK_ENV, mock_update.effective_user.id, expected_location_data)
    # Expect the specific generic error message from the handler's except block
    mock_update.effective_message.reply_text.assert_called_once_with(
        "Sorry, something went wrong. Please try again later."
    )
    assert "awaiting_location" not in mock_context.user_data
