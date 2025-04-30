"""Utility functions for location processing and geocoding."""

from .errors import ValidationError
from .logging import get_logger

logger = get_logger(__name__)


async def geocode_location(location_text: str) -> dict[str, str | float | None]:
    """Parses 'City, Country' text and prepares data for storage.

    Args:
        location_text: The user-provided location string.

    Returns:
        A dictionary containing city, country, and placeholder lat/lon.

    Raises:
        ValidationError: If the input format is invalid.
    """
    parts = [part.strip() for part in location_text.split(",")]
    if len(parts) != 2 or not all(parts):
        raise ValidationError("Invalid format. Please use 'City, Country'.")

    city = parts[0].title()  # Normalize case
    country = parts[1].title()  # Normalize case

    logger.info("Geocoding manual location", city=city, country=country)
    # TODO: Implement actual geocoding API call here to validate city/country
    # and potentially get coordinates.
    # If geocoding fails, could raise ValidationError.

    return {
        "city": city,
        "country": country,
        "latitude": None,  # Placeholder until geocoding is implemented
        "longitude": None,  # Placeholder until geocoding is implemented
    }


async def reverse_geocode_coordinates(latitude: float, longitude: float) -> dict[str, str]:
    """Gets city and country from coordinates (Placeholder).

    Args:
        latitude: The latitude.
        longitude: The longitude.

    Returns:
        A dictionary containing placeholder city and country.

    Raises:
        ValueError: If coordinates are invalid (future).
        # Add specific exceptions for geocoding API errors (future).
    """
    logger.info("Reverse geocoding coordinates", latitude=latitude, longitude=longitude)
    # TODO: Implement actual reverse geocoding API call here.
    # Handle potential API errors and raise appropriate exceptions.
    # Validate coordinates if necessary.

    # Placeholder implementation
    return {
        "city": "Unknown City",
        "country": "Unknown Country",
    }
