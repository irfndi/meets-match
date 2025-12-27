"""User service for the MeetMatch bot."""

from datetime import datetime
from typing import Dict, List, Optional, Union, cast

import sentry_sdk

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
    with sentry_sdk.start_span(op="user.get", name=user_id) as span:
        # Check cache first
        cache_key = USER_CACHE_KEY.format(user_id=user_id)
        # Use sliding expiration: extend cache by 1 hour on every access
        cached_user = get_cache_model(cache_key, User, extend_ttl=3600)
        if cached_user:
            logger.debug("User retrieved from cache", user_id=user_id)
            span.set_data("source", "cache")
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
            span.set_status("not_found")
            raise NotFoundError(f"User not found: {user_id}")

        # Convert to User model
        user = User.model_validate(data[0])

        # Cache user
        set_cache(cache_key, user, expiration=3600)  # 1 hour

        logger.debug("User retrieved from database", user_id=user_id)
        span.set_data("source", "database")
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
    with sentry_sdk.start_span(op="user.create", name=user.id) as span:
        # Check if user already exists
        try:
            existing_user = get_user(user.id)
            if existing_user:
                logger.warning("User already exists", user_id=user.id)
                span.set_status("already_exists")
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
            span.set_status("internal_error")
            raise ValidationError(
                f"Failed to create user: {user.id}",
                details={"user_id": user.id},
            )

        # Cache user
        cache_key = USER_CACHE_KEY.format(user_id=user.id)
        set_cache(cache_key, user, expiration=3600)  # 1 hour

        logger.info("User created", user_id=user.id)
        return user


def get_users(user_ids: List[str]) -> List[User]:
    """Get multiple users by ID (batch).

    Args:
        user_ids: List of User IDs

    Returns:
        List of User objects (order not guaranteed)
    """
    if not user_ids:
        return []

    unique_ids = list(set(user_ids))
    users = []
    missing_ids = []

    # Check cache for each user
    for uid in unique_ids:
        try:
            cache_key = USER_CACHE_KEY.format(user_id=uid)
            cached_user = get_cache_model(cache_key, User, extend_ttl=3600)
            if cached_user:
                users.append(cached_user)
            else:
                missing_ids.append(uid)
        except Exception:
            missing_ids.append(uid)

    if missing_ids:
        # Query database for missing users
        try:
            result = execute_query(
                table="users",
                query_type="select",
                filters={"id__in": missing_ids},
            )

            if result.data:
                for user_data in result.data:
                    try:
                        user = User.model_validate(user_data)
                        users.append(user)

                        # Cache user
                        cache_key = USER_CACHE_KEY.format(user_id=user.id)
                        set_cache(cache_key, user, expiration=3600)
                    except Exception as e:
                        logger.error(
                            "Failed to validate user data in batch fetch", error=str(e), user_id=user_data.get("id")
                        )
        except Exception as e:
            logger.error("Failed to batch fetch users from DB", error=str(e))

    return users


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
    with sentry_sdk.start_span(op="user.update", name=user_id) as span:
        span.set_data("fields", list(data.keys()))

        # Get current user
        get_user(user_id)

        # Update timestamps
        data["updated_at"] = datetime.now()

        # Update user in database
        if "preferences" in data:
            logger.debug("Updating user preferences", user_id=user_id, preferences=data["preferences"])
        else:
            logger.debug("Executing update_user query", user_id=user_id, data_keys=list(data.keys()))

        result = execute_query(
            table="users",
            query_type="update",
            filters={"id": user_id},
            data=data,
        )

        if not result.data or len(result.data) == 0:
            logger.error("Failed to update user in DB", user_id=user_id, data_keys=list(data.keys()))
            span.set_status("internal_error")
            raise ValidationError(
                f"Failed to update user: {user_id}",
                details={"user_id": user_id},
            )

        logger.debug("Database update successful", user_id=user_id)

        # Invalidate caches to avoid stale reads
        cache_key = USER_CACHE_KEY.format(user_id=user_id)
        delete_cache(cache_key)
        logger.debug("Invalidated user cache", key=cache_key)
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
                pass  # Ignore cache update failures for location

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
    with sentry_sdk.start_span(op="user.update_location", name=user_id) as span:
        span.set_data("city", location.city)
        span.set_data("country", location.country)

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

    def _format_location(city: str, country: str) -> Optional[str]:
        """Format city and country into a single string, handling empty values."""
        parts = [p for p in (city, country) if p]
        return ", ".join(parts) if parts else None

    try:
        user = get_user(user_id)
        if user.location and (user.location.city or user.location.country):
            city = user.location.city or ""
            country = user.location.country or ""
            return _format_location(city, country)
    except Exception:
        pass  # Fall through to try DB query fallback

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
                text = _format_location(city, country)
                if text:
                    return text
            city = row.get("location_city") or ""
            country = row.get("location_country") or ""
            return _format_location(city, country)
    except Exception:
        pass  # Return None if location cannot be determined

    return None


def update_user_preferences(user_id: str, preferences: Preferences) -> User:
    """Update a user's preferences by merging with existing values.

    Args:
        user_id: User ID
        preferences: Preferences object

    Returns:
        Updated user object

    Raises:
        NotFoundError: If user not found
    """
    with sentry_sdk.start_span(op="user.update_preferences", name=user_id) as span:
        # Load existing preferences
        existing_user = get_user(user_id)
        existing_prefs = existing_user.preferences.model_dump() if existing_user.preferences else {}

        # Only apply non-None fields to avoid wiping existing settings unintentionally
        new_prefs_partial = preferences.model_dump(exclude_none=True)
        merged = {**existing_prefs, **new_prefs_partial}

        span.set_data("updated_fields", list(new_prefs_partial.keys()))

        # Persist merged preferences
        user = update_user(user_id, {"preferences": merged})

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


def get_inactive_users(days_inactive: int) -> List[User]:
    """Get users who have been inactive for exactly the specified number of days."""
    from datetime import timedelta

    # Calculate the time range for "exact" match (e.g., between X and X+1 days ago)
    # We want users where (now - last_active) is close to days_inactive.
    # So last_active should be between (now - days_inactive - 1) and (now - days_inactive)

    # Example: If days_inactive=1 (yesterday)
    # We want users active between 48h ago and 24h ago?
    # Or simply: last_active < (now - days) AND last_active >= (now - days - 1)

    # Use naive UTC consistently with the rest of the codebase
    now = datetime.now()
    end_date = now - timedelta(days=days_inactive)
    start_date = end_date - timedelta(days=1)

    # We use execute_query with range filters
    # src/utils/database.py supports "__gte", "__lte", "__gt", "__lt"

    # last_active >= start_date AND last_active < end_date
    # means they were last active strictly within that 24h window X days ago.

    result = execute_query(
        table="users",
        query_type="select",
        filters={"last_active__gte": start_date, "last_active__lt": end_date, "is_active": True},
    )

    if not result.data:
        return []

    return [User.model_validate(u) for u in result.data]


def set_user_sleeping(user_id: str, is_sleeping: bool) -> User:
    """Set a user's sleeping/paused status.

    Args:
        user_id: User ID
        is_sleeping: Whether the user is sleeping/paused

    Returns:
        Updated user object

    Raises:
        NotFoundError: If user not found
    """
    user = update_user(user_id, {"is_sleeping": is_sleeping})
    logger.info("User sleeping status updated", user_id=user_id, is_sleeping=is_sleeping)
    return user


def wake_user(user_id: str) -> User:
    """Wake up a sleeping user and update their last_active timestamp.

    Args:
        user_id: User ID

    Returns:
        Updated user object

    Raises:
        NotFoundError: If user not found
    """
    now = datetime.now()
    user = update_user(user_id, {"is_sleeping": False, "last_active": now})
    logger.info("User woken up", user_id=user_id)
    return user


def get_users_for_auto_sleep(inactivity_minutes: int = 15) -> List[User]:
    """Get active, non-sleeping users who have been inactive for the specified minutes.

    Args:
        inactivity_minutes: Number of minutes of inactivity before auto-sleep

    Returns:
        List of users eligible for auto-sleep
    """
    from datetime import timedelta

    # Use naive UTC consistently with the rest of the codebase
    now = datetime.now()
    threshold = now - timedelta(minutes=inactivity_minutes)

    # Get users who:
    # - Are active (is_active=True)
    # - Are NOT sleeping (is_sleeping=False)
    # - Have last_active before the threshold
    result = execute_query(
        table="users",
        query_type="select",
        filters={
            "last_active__lt": threshold,
            "is_active": True,
            "is_sleeping": False,
        },
    )

    if not result.data:
        return []

    return [User.model_validate(u) for u in result.data]
