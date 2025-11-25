from typing import Optional, Dict
import asyncio

from geopy.geocoders import Nominatim

_geocoder = Nominatim(user_agent="meetsmatch-bot/1.0")


def _extract_city_country(address: Dict[str, str]) -> Dict[str, Optional[str]]:
    city = (
        address.get("city")
        or address.get("town")
        or address.get("village")
        or address.get("hamlet")
        or address.get("municipality")
        or address.get("county")
        or address.get("state_district")
        or address.get("state")
    )
    country = address.get("country")
    return {"city": city, "country": country}


async def geocode_city(city_text: str) -> Optional[Dict[str, Optional[str]]]:
    query = city_text.strip()
    if not query:
        return None
    try:
        result = await asyncio.to_thread(
            _geocoder.geocode,
            query,
            language="en",
            addressdetails=True,
            exactly_one=True,
        )
        if not result:
            return None
        address = result.raw.get("address", {})
        info = _extract_city_country(address)
        return {
            "latitude": float(result.latitude),
            "longitude": float(result.longitude),
            "city": info["city"],
            "country": info["country"],
        }
    except Exception:
        return None


async def reverse_geocode_coordinates(latitude: float, longitude: float) -> Optional[Dict[str, Optional[str]]]:
    try:
        result = await asyncio.to_thread(
            _geocoder.reverse,
            (latitude, longitude),
            language="en",
            addressdetails=True,
            exactly_one=True,
        )
        if not result:
            return None
        address = result.raw.get("address", {})
        info = _extract_city_country(address)
        return {
            "latitude": float(latitude),
            "longitude": float(longitude),
            "city": info["city"],
            "country": info["country"],
        }
    except Exception:
        return None

