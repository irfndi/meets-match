import asyncio
import math
from typing import Any, Dict, List, Optional, Tuple

import sentry_sdk
from geopy.geocoders import Nominatim  # type: ignore

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


async def geocode_city(city_text: str, language: str = "en") -> Optional[Dict[str, Any]]:
    query = city_text.strip()
    if not query:
        return None

    with sentry_sdk.start_span(op="geocoding.geocode", name=query) as span:
        try:
            result = await asyncio.to_thread(
                _geocoder.geocode,
                query,
                language=language or "en",
                addressdetails=True,
                exactly_one=True,
            )
            if not result:
                span.set_data("found", False)
                return None

            span.set_data("found", True)
            address = result.raw.get("address", {})
            info = _extract_city_country(address)

            span.set_data("city", info["city"])
            span.set_data("country", info["country"])

            return {
                "latitude": float(result.latitude),
                "longitude": float(result.longitude),
                "city": info["city"],
                "country": info["country"],
            }
        except Exception as e:
            span.set_status("internal_error")
            span.set_data("error", str(e))
            return None


def normalize_city_alias(query_text: str, country: Optional[str]) -> str:
    alias_map = {
        "indonesia": {
            "bdg": "Bandung",
            "jkt": "Jakarta",
            "jogja": "Yogyakarta",
            "yogya": "Yogyakarta",
            "sby": "Surabaya",
            "mlg": "Malang",
            "bgr": "Bogor",
            "tgr": "Tangerang",
            "dpk": "Depok",
            "bks": "Bekasi",
        }
    }
    key = (country or "").lower()
    q = query_text.strip().lower()
    if key in alias_map and q in alias_map[key]:
        return alias_map[key][q]
    return query_text


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmb / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


async def search_cities(
    query_text: str,
    limit: int = 8,
    language: str = "en",
    prefer_country: Optional[str] = None,
    prefer_coords: Optional[Tuple[float, float]] = None,
) -> List[Dict[str, Any]]:
    query = query_text.strip()
    if not query:
        return []

    with sentry_sdk.start_span(op="geocoding.search", name=query) as span:
        try:
            results = await asyncio.to_thread(
                _geocoder.geocode,
                query,
                language=language or "en",
                addressdetails=True,
                exactly_one=False,
                limit=max(1, limit),
            )
            if not results:
                span.set_data("count", 0)
                return []

            seen = set()
            candidates: List[Dict[str, Any]] = []
            for r in results:
                address = r.raw.get("address", {})
                info = _extract_city_country(address)
                city = info.get("city")
                country = info.get("country")
                if not city or not country:
                    continue
                key = (city, country)
                if key in seen:
                    continue
                seen.add(key)
                candidates.append(
                    {
                        "latitude": float(r.latitude),
                        "longitude": float(r.longitude),
                        "city": city,
                        "country": country,
                    }
                )
                if len(candidates) >= limit:
                    break

            if prefer_country or prefer_coords:

                def sort_key(c: Dict[str, Any]) -> Tuple[float, float]:
                    country_match = 0.0
                    country_val = c.get("country")
                    if prefer_country and country_val and str(country_val).lower() == prefer_country.lower():
                        country_match = 1.0
                    dist = 1e9
                    lat = c.get("latitude")
                    lon = c.get("longitude")
                    if prefer_coords and lat is not None and lon is not None:
                        dist = _distance_km(prefer_coords[0], prefer_coords[1], float(lat), float(lon))
                    return (-country_match, dist)

                candidates.sort(key=sort_key)

            span.set_data("count", len(candidates))
            return candidates
        except Exception as e:
            span.set_status("internal_error")
            span.set_data("error", str(e))
            return []


async def reverse_geocode_coordinates(latitude: float, longitude: float) -> Optional[Dict[str, Any]]:
    with sentry_sdk.start_span(op="geocoding.reverse", name=f"{latitude},{longitude}") as span:
        try:
            result = await asyncio.to_thread(
                _geocoder.reverse,
                (latitude, longitude),
                language="en",
                addressdetails=True,
                exactly_one=True,
            )
            if not result:
                span.set_data("found", False)
                return None

            span.set_data("found", True)
            address = result.raw.get("address", {})
            info = _extract_city_country(address)

            span.set_data("city", info["city"])
            span.set_data("country", info["country"])

            return {
                "latitude": float(latitude),
                "longitude": float(longitude),
                "city": info["city"],
                "country": info["country"],
            }
        except Exception as e:
            span.set_status("internal_error")
            span.set_data("error", str(e))
            return None
