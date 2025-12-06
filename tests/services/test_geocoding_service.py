import importlib
import sys
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules."""
    modules_to_restore = [
        "src.services",
        "src.services.geocoding_service",
        "src.utils.errors",
        "src.utils.database",
        "src.config",
    ]

    original_modules = {}
    for module_name in modules_to_restore:
        if module_name in sys.modules:
            original_modules[module_name] = sys.modules[module_name]
            del sys.modules[module_name]

    yield

    for module_name, module in original_modules.items():
        sys.modules[module_name] = module


@pytest.fixture
def geocoding_service_module():
    import src.services.geocoding_service as service

    importlib.reload(service)
    return service


@pytest.fixture
def mock_geocoder(geocoding_service_module):
    """Mock the internal _geocoder object."""
    mock = MagicMock()
    with patch.object(geocoding_service_module, "_geocoder", mock):
        yield mock


@pytest.mark.asyncio
async def test_geocode_city_success(geocoding_service_module, mock_geocoder):
    """Test geocode_city success."""
    mock_location = MagicMock()
    mock_location.latitude = 40.7128
    mock_location.longitude = -74.0060
    mock_location.raw = {"address": {"city": "New York", "country": "USA"}}

    mock_geocoder.geocode.return_value = mock_location

    result = await geocoding_service_module.geocode_city("New York")

    assert result["city"] == "New York"
    assert result["country"] == "USA"
    assert result["latitude"] == 40.7128
    assert result["longitude"] == -74.0060


@pytest.mark.asyncio
async def test_geocode_city_not_found(geocoding_service_module, mock_geocoder):
    """Test geocode_city when location not found."""
    mock_geocoder.geocode.return_value = None

    result = await geocoding_service_module.geocode_city("Unknown City")

    assert result is None


@pytest.mark.asyncio
async def test_normalize_city_alias(geocoding_service_module):
    """Test normalize_city_alias."""
    assert geocoding_service_module.normalize_city_alias("bdg", "Indonesia") == "Bandung"
    assert geocoding_service_module.normalize_city_alias("jkt", "indonesia") == "Jakarta"
    assert geocoding_service_module.normalize_city_alias("unknown", "Indonesia") == "unknown"
    assert geocoding_service_module.normalize_city_alias("bdg", "USA") == "bdg"


@pytest.mark.asyncio
async def test_search_cities(geocoding_service_module, mock_geocoder):
    """Test search_cities."""
    mock_location1 = MagicMock()
    mock_location1.latitude = 40.7128
    mock_location1.longitude = -74.0060
    mock_location1.raw = {"address": {"city": "New York", "country": "USA"}}

    mock_location2 = MagicMock()
    mock_location2.latitude = 51.5074
    mock_location2.longitude = -0.1278
    mock_location2.raw = {"address": {"city": "London", "country": "UK"}}

    mock_geocoder.geocode.return_value = [mock_location1, mock_location2]

    results = await geocoding_service_module.search_cities("query")

    assert len(results) == 2
    assert results[0]["city"] == "New York"
    assert results[1]["city"] == "London"


@pytest.mark.asyncio
async def test_reverse_geocode_coordinates(geocoding_service_module, mock_geocoder):
    """Test reverse_geocode_coordinates."""
    mock_location = MagicMock()
    mock_location.raw = {"address": {"city": "Tokyo", "country": "Japan"}}

    mock_geocoder.reverse.return_value = mock_location

    result = await geocoding_service_module.reverse_geocode_coordinates(35.6762, 139.6503)

    assert result["city"] == "Tokyo"
    assert result["country"] == "Japan"
    assert result["latitude"] == 35.6762
    assert result["longitude"] == 139.6503
