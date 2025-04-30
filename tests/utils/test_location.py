"""Tests for location utility functions."""

import pytest

from src.utils.errors import ValidationError
from src.utils.location import geocode_location, reverse_geocode_coordinates


@pytest.mark.asyncio
async def test_geocode_location_valid():
    """Test geocode_location with valid 'City, Country' input."""
    result = await geocode_location("New York, USA")
    assert result == {
        "city": "New York",
        "country": "Usa",  # Note: .title() case
        "latitude": None,
        "longitude": None,
    }

    result_lower = await geocode_location("london, uk")
    assert result_lower == {
        "city": "London",
        "country": "Uk",
        "latitude": None,
        "longitude": None,
    }

    result_mixed = await geocode_location(" san francisco , CA ")
    assert result_mixed == {
        "city": "San Francisco",
        "country": "Ca",
        "latitude": None,
        "longitude": None,
    }


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid_input",
    [
        "New York USA",  # Missing comma
        "New York,",  # Missing country
        ", USA",  # Missing city
        "",  # Empty string
        ",",  # Just a comma
        "City, Country, Extra",  # Too many parts
    ],
)
async def test_geocode_location_invalid_format(invalid_input):
    """Test geocode_location with invalid input formats."""
    with pytest.raises(ValidationError, match="Invalid format. Please use 'City, Country'."):
        await geocode_location(invalid_input)


@pytest.mark.asyncio
async def test_reverse_geocode_coordinates_placeholder():
    """Test reverse_geocode_coordinates returns placeholder values."""
    latitude = 40.7128
    longitude = -74.0060
    result = await reverse_geocode_coordinates(latitude, longitude)
    assert result == {"city": "Unknown City", "country": "Unknown Country"}

    # Test with different coordinates
    latitude_2 = 51.5074
    longitude_2 = -0.1278
    result_2 = await reverse_geocode_coordinates(latitude_2, longitude_2)
    assert result_2 == {"city": "Unknown City", "country": "Unknown Country"}
