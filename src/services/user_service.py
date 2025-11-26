"""User service for the MeetMatch bot."""

# TODO: Cloudflare Migration (D1/KV/R2)
# This service likely contains logic interacting with the database (Supabase/PostgreSQL)
# for user CRUD, caching (Redis), and potentially file storage (S3 for photos).
# - All database CRUD operations must be rewritten to use Cloudflare D1 (via bindings).
# - All caching logic needs to be updated to use Cloudflare KV (via bindings).
# - Any photo/file storage logic must be updated to use Cloudflare R2 (via bindings).
# Review all methods for persistence, caching, and file storage logic.

from datetime import datetime
from typing import Dict, List, Optional, Union, cast

from src.models.user import Location, Preferences, User
from src.utils.cache import delete_cache, get_cache_model, set_cache
from src.utils.database import execute_query
from src.utils.errors import NotFoundError, ValidationError
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Cache keys
USER_CACHE_KEY = "user:{user_id}"
USER_LOCATION_CACHE_KEY = "user:location:{user_id}"


def get_user(user_id: str) -> User:
    """Get a user by ID.

    Args:
        user_id: User ID

    Returns:
        User object

    Raises:
        NotFoundError: If user not found
    """
    # Check cache first
    cache_key = USER_CACHE_KEY.format(user_id=user_id)
    # Use sliding expiration: extend cache by 1 hour on every access
    cached_user = get_cache_model(cache_key, User, extend_ttl=3600)
    if cached_user:
        logger.debug("User retrieved from cache", user_id=user_id)
        return cached_user

    # Query database
    result = execute_query(
        table="users",
        query_type="select",
        filters={"id": user_id},
    )

    data = result.data
    if not data or len(data) == 0:
        logger.warning("User not found", user_id=user_id)
        raise NotFoundError(f"User not found: {user_id}")

    # Convert to User model
    user = User.model_validate(data[0])

    # Cache user
    set_cache(cache_key, user, expiration=3600)  # 1 hour

    logger.debug("User retrieved from database", user_id=user_id)
    return user


def create_user(user: User) -> User:
    """Create a new user.

    Args:
        user: User object

    Returns:
        Created user object

    Raises:
        ValidationError: If user already exists
    """
    # Check if user already exists
    try:
        existing_user = get_user(user.id)
        if existing_user:
            logger.warning("User already exists", user_id=user.id)
            raise ValidationError(
                f"User already exists: {user.id}",
                details={"user_id": user.id},
            )
    except NotFoundError:
        # User doesn't exist, continue with creation
        pass

    # Set timestamps
    now = datetime.now()
    user.created_at = now
    user.updated_at = now
    user.last_active = now

    # Insert into database
    result = execute_query(
        table="users",
        query_type="insert",
        data=user.model_dump(),
    )

    if not result.data or len(result.data) == 0:
        logger.error("Failed to create user", user_id=user.id)
        raise ValidationError(
            f"Failed to create user: {user.id}",
            details={"user_id": user.id},
        )

    # Cache user
    cache_key = USER_CACHE_KEY.format(user_id=user.id)
    set_cache(cache_key, user, expiration=3600)  # 1 hour

    logger.info("User created", user_id=user.id)
    return user


def update_user(user_id: str, data: Dict[str, Union[str, int, bool, datetime, List[str], Dict]]) -> User:
    """Update a user.

    Args:
        user_id: User ID
        data: User data to update

    Returns:
        Updated user object

    Raises:
        NotFoundError: If user not found
        ValidationError: If update data is invalid
    """
    # Get current user
    get_user(user_id)

    # Update timestamps
    data["updated_at"] = datetime.now()

    # Update user in database
    result = execute_query(
        table="users",
        query_type="update",
        filters={"id": user_id},
        data=data,
    )

    if not result.data or len(result.data) == 0:
        logger.error("Failed to update user", user_id=user_id)
        raise ValidationError(
            f"Failed to update user: {user_id}",
            details={"user_id": user_id},
        )

    # Invalidate caches to avoid stale reads
    cache_key = USER_CACHE_KEY.format(user_id=user_id)
    delete_cache(cache_key)
    location_cache_key = USER_LOCATION_CACHE_KEY.format(user_id=user_id)
    if (
        "location" in data
        or "location_latitude" in data
        or "location_longitude" in data
        or "location_city" in data
        or "location_country" in data
    ):
        delete_cache(location_cache_key)

    # Get updated user from database and refresh caches
    updated_user = get_user(user_id)
    set_cache(cache_key, updated_user, expiration=3600)  # 1 hour

    # Refresh location cache if available
    if updated_user.location:
        set_cache(location_cache_key, updated_user.location, expiration=86400)
    elif "location" in data:
        try:
            location_data = cast(Dict, data["location"])  # type: ignore[index]
            location = Location.model_validate(location_data)
            set_cache(location_cache_key, location, expiration=86400)
        except Exception:
            pass

    logger.info("User updated", user_id=user_id)
    return updated_user


def update_user_location(user_id: str, location: Location) -> User:
    """Update a user's location.

    Args:
        user_id: User ID
        location: Location object

    Returns:
        Updated user object

    Raises:
        NotFoundError: If user not found
    """
    # Update location timestamp
    location.last_updated = datetime.now()

    # Update user
    user = update_user(user_id, {"location": location.model_dump()})

    # Update location cache
    location_cache_key = USER_LOCATION_CACHE_KEY.format(user_id=user_id)
    set_cache(location_cache_key, location, expiration=86400)  # 24 hours

    logger.info("User location updated", user_id=user_id, location=location.model_dump())
    return user


def get_user_location_text(user_id: str) -> Optional[str]:
    """Get a human-readable location string (city, country) for a user.

    Falls back to flat DB fields if nested location isn't present.
    """
    try:
        user = get_user(user_id)
        if getattr(user, "location", None) and getattr(user.location, "city", None):
            city = user.location.city or ""
            country = user.location.country or ""
            text = f"{city}, {country}".strip().rstrip(",")
            return text if text else None
    except Exception:
        pass

    try:
        result = execute_query(
            table="users",
            query_type="select",
            filters={"id": user_id},
        )
        data = result.data or []
        if data:
            row = data[0]
            loc = row.get("location")
            if loc and isinstance(loc, dict):
                city = loc.get("city") or ""
                country = loc.get("country") or ""
                text = f"{city}, {country}".strip().rstrip(",")
                if text:
                    return text
            city = row.get("location_city") or ""
            country = row.get("location_country") or ""
            text = f"{city}, {country}".strip().rstrip(",")
            return text if text else None
    except Exception:
        pass

    return None


def update_user_preferences(user_id: str, preferences: Preferences) -> User:
    """Update a user's preferences.

    Args:
        user_id: User ID
        preferences: Preferences object

    Returns:
        Updated user object

    Raises:
        NotFoundError: If user not found
    """
    # Update user
    user = update_user(user_id, {"preferences": preferences.model_dump()})

    logger.info("User preferences updated", user_id=user_id)
    return user


def delete_user(user_id: str) -> None:
    """Delete a user.

    Args:
        user_id: User ID

    Raises:
        NotFoundError: If user not found
    """
    # Check if user exists
    get_user(user_id)

    # Delete from database
    result = execute_query(
        table="users",
        query_type="delete",
        filters={"id": user_id},
    )

    if not result.data:
        logger.error("Failed to delete user", user_id=user_id)
        raise ValidationError(
            f"Failed to delete user: {user_id}",
            details={"user_id": user_id},
        )

    # Delete cache
    cache_key = USER_CACHE_KEY.format(user_id=user_id)
    delete_cache(cache_key)

    # Delete location cache
    location_cache_key = USER_LOCATION_CACHE_KEY.format(user_id=user_id)
    delete_cache(location_cache_key)

    logger.info("User deleted", user_id=user_id)


def get_user_location(user_id: str) -> Optional[Location]:
    """Get a user's location.

    Args:
        user_id: User ID

    Returns:
        Location object or None if not set

    Raises:
        NotFoundError: If user not found
    """
    # Check cache first
    location_cache_key = USER_LOCATION_CACHE_KEY.format(user_id=user_id)
    cached_location = get_cache_model(location_cache_key, Location)
    if cached_location:
        logger.debug("User location retrieved from cache", user_id=user_id)
        return cached_location

    # Get user
    user = get_user(user_id)

    # Return location if set
    if user.location:
        # Cache location
        set_cache(location_cache_key, user.location, expiration=86400)  # 24 hours
        return user.location

    return None


def update_last_active(user_id: str) -> None:
    """Update a user's last active timestamp.

    Args:
        user_id: User ID

    Raises:
        NotFoundError: If user not found
    """
    now = datetime.now()
    update_user(user_id, {"last_active": now})
    logger.debug("User last active updated", user_id=user_id, timestamp=now)
