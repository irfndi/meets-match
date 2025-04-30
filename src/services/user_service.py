"""User service for the MeetMatch bot."""

# TODO: Cloudflare Migration (D1/KV/R2)
# This service likely contains logic interacting with the database (Supabase/PostgreSQL)
# for user CRUD, caching (Redis), and potentially file storage (S3 for photos).
# - All database CRUD operations must be rewritten to use Cloudflare D1 (via bindings).
# - All caching logic needs to be updated to use Cloudflare KV (via bindings).
# - Any photo/file storage logic must be updated to use Cloudflare R2 (via bindings).
# Review all methods for persistence, caching, and file storage logic.

import json
from datetime import datetime
from typing import Dict, List, Optional, Union

from ..config import Settings
from ..models.user import Location, Preferences, User
from ..utils.errors import NotFoundError, ValidationError
from ..utils.logging import get_logger

logger = get_logger(__name__)

# Cache keys (KV uses these directly)
USER_CACHE_KEY = "user:{user_id}"
USER_LOCATION_CACHE_KEY = "user:location:{user_id}"


async def get_user(env: Settings, user_id: str) -> User:
    """Get a user by ID.

    Args:
        env: Cloudflare environment object with bindings (DB, KV, R2).
        user_id: User ID

    Returns:
        User object

    Raises:
        NotFoundError: If user not found or DB error occurs.
    """
    cache_key = USER_CACHE_KEY.format(user_id=user_id)
    try:
        # Check KV cache first
        cached_data_json = await env.KV.get(cache_key)
        if cached_data_json:
            logger.debug("User retrieved from KV cache", user_id=user_id)
            # Deserialize from JSON string stored in KV
            user_data = json.loads(cached_data_json)
            return User.model_validate(user_data)
    except Exception as e:
        # Log cache read errors but proceed to DB
        logger.error("KV cache get error", user_id=user_id, error=str(e), exc_info=True)

    # Query D1 database
    try:
        # TODO: Verify 'users' table name and columns match D1 schema
        stmt = env.DB.prepare("SELECT * FROM users WHERE id = ?")
        result = await stmt.bind(user_id).first()
    except Exception as e:
        logger.error("D1 database query error for get_user", user_id=user_id, error=str(e), exc_info=True)
        # Propagate as NotFoundError for simplicity, or use a specific DBError
        raise NotFoundError(f"Database error fetching user: {user_id}") from e

    if not result:
        logger.warning("User not found in D1", user_id=user_id)
        raise NotFoundError(f"User not found: {user_id}")

    # Convert D1 result (Dict-like) to User model
    # FIXME: D1 result conversion might need adjustment based on actual data types/structure returned
    # Pydantic should handle basic dict->model conversion if column names match
    try:
        user = User.model_validate(result)
    except Exception as e:
        logger.error("Failed to validate user data from D1", user_id=user_id, data=result, error=str(e), exc_info=True)
        raise ValidationError(f"Invalid user data received from database for user: {user_id}") from e

    # Cache user in KV (serialize model to JSON string)
    try:
        await env.KV.put(cache_key, user.model_dump_json(), expiration_ttl=3600)  # 1 hour
    except Exception as e:
        # Log cache write errors but don't fail the request
        logger.error("KV cache put error", user_id=user_id, error=str(e), exc_info=True)

    logger.debug("User retrieved from D1 database", user_id=user_id)
    return user


async def create_user(env: Settings, user: User) -> User:
    """Create a new user.

    Args:
        env: Cloudflare environment object with bindings.
        user: User object

    Returns:
        Created user object

    Raises:
        ValidationError: If user already exists or DB insert fails.
    """
    # Check if user already exists using the refactored async get_user
    try:
        existing_user = await get_user(env, user.id)
        if existing_user:
            logger.warning("User already exists", user_id=user.id)
            # No need for 'from e' here as we're not re-raising from an exception
            raise ValidationError(
                f"User already exists: {user.id}",
                details={"user_id": user.id},
            )
    except NotFoundError:
        # User doesn't exist, continue with creation
        pass
    except Exception as e:
        # Handle potential errors from get_user itself (like DB connection issues)
        logger.error("Error checking existing user during creation", user_id=user.id, error=str(e), exc_info=True)
        raise ValidationError(f"Error checking user existence: {user.id}") from e

    # Set timestamps
    now = datetime.now()
    user.created_at = now
    user.updated_at = now
    user.last_active = now

    # Insert into D1 database
    try:
        # TODO: Verify 'users' table name and columns match D1 schema & user model
        # Assuming User model fields match D1 columns
        # Use model_dump to get dict, convert datetime to ISO format string if needed by D1
        user_data = user.model_dump(mode="json")  # mode='json' helps serialize datetime etc.

        # Validate keys against the User model's fields before using in f-string
        allowed_columns = set(User.model_fields.keys())
        if not set(user_data.keys()).issubset(allowed_columns):
            invalid_keys = set(user_data.keys()) - allowed_columns
            logger.error("Invalid keys detected for create_user", invalid_keys=invalid_keys, user_id=user.id)
            raise ValidationError(f"Attempted to insert invalid columns: {invalid_keys}")

        # Dynamically build column names and placeholders for insert
        columns = ", ".join(user_data.keys())
        placeholders = ", ".join(["?" for _ in user_data])
        values = list(user_data.values())

        stmt = env.DB.prepare(f"INSERT INTO users ({columns}) VALUES ({placeholders})")
        # D1 expects parameters in the order matching placeholders
        await stmt.bind(*values).run()

    except Exception as e:
        logger.error("D1 database insert error for create_user", user_id=user.id, error=str(e), exc_info=True)
        raise ValidationError(f"Database error creating user: {user.id}") from e

    # Cache user in KV
    cache_key = USER_CACHE_KEY.format(user_id=user.id)
    try:
        await env.KV.put(cache_key, user.model_dump_json(), expiration_ttl=3600)  # 1 hour
    except Exception as e:
        # Log cache write errors but don't fail the request (user is already created)
        logger.error("KV cache put error after creating user", user_id=user.id, error=str(e), exc_info=True)

    logger.info("User created", user_id=user.id)
    return user


async def update_user(
    env: Settings, user_id: str, data: Dict[str, Union[str, int, float, bool, List[str], Dict, None]]
) -> User:
    """Update a user.

    Args:
        env: Cloudflare environment object with bindings.
        user_id: User ID
        data: User data to update (keys should match User model fields/D1 columns)

    Returns:
        Updated user object

    Raises:
        NotFoundError: If user not found.
        ValidationError: If update data is invalid or DB update fails.
    """
    # Check if user exists first (uses the refactored async get_user)
    try:
        await get_user(env, user_id)
    except NotFoundError as e:
        logger.warning("Attempted to update non-existent user", user_id=user_id)
        raise e  # Re-raise the NotFoundError
    except Exception as e:
        logger.error("Error checking user existence during update", user_id=user_id, error=str(e), exc_info=True)
        raise ValidationError(f"Error checking user before update: {user_id}") from e

    # Update timestamps
    data["updated_at"] = datetime.now()

    # Prepare data for D1 update
    # Filter out None values if D1 doesn't handle them well in SET clause?
    # Or ensure your D1 schema allows NULLs where appropriate.
    update_fields = {k: v for k, v in data.items() if v is not None}  # Example: ignore None values

    # Validate keys against the User model's fields before using in f-string
    allowed_columns = set(User.model_fields.keys())
    if not set(update_fields.keys()).issubset(allowed_columns):
        invalid_keys = set(update_fields.keys()) - allowed_columns
        logger.error("Invalid keys detected for update_user", invalid_keys=invalid_keys, user_id=user_id)
        raise ValidationError(f"Attempted to update invalid columns: {invalid_keys}")

    set_clause = ", ".join([f"{key} = ?" for key in update_fields.keys()])
    values = list(update_fields.values())

    if not values:  # Nothing to update
        logger.warning("Update user called with no valid data", user_id=user_id, data=data)
        # Return current user data without DB call
        return await get_user(env, user_id)

    # Update user in D1 database
    try:
        # TODO: Verify 'users' table name
        stmt = env.DB.prepare(f"UPDATE users SET {set_clause} WHERE id = ?")
        # Bind values for SET clause first, then the user_id for WHERE clause
        await stmt.bind(*values, user_id).run()
    except Exception as e:
        logger.error(
            "D1 database update error for update_user", user_id=user_id, data=update_fields, error=str(e), exc_info=True
        )
        raise ValidationError(f"Database error updating user: {user_id}") from e

    # Invalidate or update cache after successful DB update
    cache_key = USER_CACHE_KEY.format(user_id=user_id)
    location_cache_key = USER_LOCATION_CACHE_KEY.format(user_id=user_id)
    try:
        # Simple approach: Delete cache entries to force refresh on next get
        await env.KV.delete(cache_key)
        if "location" in update_fields:
            await env.KV.delete(location_cache_key)
        # Alternative: Put the updated data (requires fetching it again or careful construction)
        # updated_user = await get_user(env, user_id) # Fetch fresh data
        # await env.KV.put(cache_key, updated_user.model_dump_json(), expiration_ttl=3600)
        # if "location" in update_fields and updated_user.location:
        #     await env.KV.put(location_cache_key, updated_user.location.model_dump_json(), expiration_ttl=86400)

    except Exception as e:
        # Log cache errors but don't fail the request
        logger.error("KV cache delete/put error after updating user", user_id=user_id, error=str(e), exc_info=True)

    logger.info("User updated in D1", user_id=user_id)

    # Return the updated user data by fetching it again
    # This ensures we return the actual state from the DB/cache
    try:
        return await get_user(env, user_id)
    except Exception as e:
        logger.error("Failed to fetch user after update", user_id=user_id, error=str(e), exc_info=True)
        # This is problematic, the update succeeded but we can't return the user
        # Raise a specific error or handle appropriately
        raise ValidationError(f"Update succeeded but failed to retrieve updated user: {user_id}") from e


async def update_user_location(env: Settings, user_id: str, location: Location) -> User:
    """Update a user's location.

    Args:
        env: Cloudflare environment object with bindings.
        user_id: User ID
        location: Location object

    Returns:
        Updated user object (result from update_user call).

    Raises:
        NotFoundError: If user not found (propagated from update_user).
        ValidationError: If update fails (propagated from update_user).
    """
    # Update location timestamp
    location.last_updated = datetime.now()

    # Call the refactored update_user, which handles DB and cache
    # Use model_dump(mode='json') for better serialization of nested objects/datetime
    try:
        user = await update_user(env, user_id, {"location": location.model_dump(mode="json")})
    except (NotFoundError, ValidationError) as e:
        # Propagate known errors from update_user
        logger.error("Error propagated from update_user during location update", user_id=user_id, error=str(e))
        raise e
    except Exception as e:
        # Catch unexpected errors during the update process
        logger.error("Unexpected error updating user location", user_id=user_id, error=str(e), exc_info=True)
        raise ValidationError(f"Failed to update user location for user: {user_id}") from e

    # Location cache (USER_LOCATION_CACHE_KEY) is invalidated within update_user
    # No need for explicit cache set here

    logger.info("User location updated via update_user", user_id=user_id, location=location.model_dump())
    return user


async def update_user_preferences(env: Settings, user_id: str, preferences: Preferences) -> User:
    """Update a user's preferences.

    Args:
        env: Cloudflare environment object with bindings.
        user_id: User ID
        preferences: Preferences object

    Returns:
        Updated user object (result from update_user call).

    Raises:
        NotFoundError: If user not found (propagated from update_user).
        ValidationError: If update fails (propagated from update_user).
    """
    # Call the refactored update_user, which handles DB and cache
    try:
        # Use model_dump(mode='json') for better serialization
        user = await update_user(env, user_id, {"preferences": preferences.model_dump(mode="json")})
    except (NotFoundError, ValidationError) as e:
        # Propagate known errors from update_user
        logger.error("Error propagated from update_user during preferences update", user_id=user_id, error=str(e))
        raise e
    except Exception as e:
        # Catch unexpected errors during the update process
        logger.error("Unexpected error updating user preferences", user_id=user_id, error=str(e), exc_info=True)
        raise ValidationError(f"Failed to update user preferences for user: {user_id}") from e

    # User cache is invalidated within update_user
    # No need for explicit cache set here

    logger.info("User preferences updated via update_user", user_id=user_id, preferences=preferences.model_dump())
    return user


async def delete_user(env: Settings, user_id: str) -> None:
    """Delete a user.

    Args:
        env: Cloudflare environment object with bindings.
        user_id: User ID

    Raises:
        NotFoundError: If user not found.
        ValidationError: If database deletion fails.
    """
    # Check if user exists first
    try:
        await get_user(env, user_id)
    except NotFoundError as e:
        logger.warning("Attempted to delete non-existent user", user_id=user_id)
        raise e  # Re-raise the NotFoundError
    except Exception as e:
        logger.error("Error checking user existence during delete", user_id=user_id, error=str(e), exc_info=True)
        raise ValidationError(f"Error checking user before delete: {user_id}") from e

    # Delete from D1 database
    try:
        # TODO: Verify 'users' table name
        stmt = env.DB.prepare("DELETE FROM users WHERE id = ?")
        result = await stmt.bind(user_id).run()
        # Check if any rows were actually affected (result.meta might have info)
        # D1 run() result doesn't directly confirm deletion success like old way
        # If run() completes without error, assume success for now.
        # Add more robust checking if D1 provides specifics on affected rows later.
        if result is None:  # Basic check if D1 API changes
            logger.warning("D1 delete operation returned unexpected result", user_id=user_id)
            # Decide if this should be an error

    except Exception as e:
        logger.error("D1 database delete error for delete_user", user_id=user_id, error=str(e), exc_info=True)
        raise ValidationError(f"Database error deleting user: {user_id}") from e

    # Delete cache entries from KV
    cache_key = USER_CACHE_KEY.format(user_id=user_id)
    location_cache_key = USER_LOCATION_CACHE_KEY.format(user_id=user_id)
    try:
        await env.KV.delete(cache_key)
        await env.KV.delete(location_cache_key)
    except Exception as e:
        # Log cache errors but don't fail the request (user is already deleted from DB)
        logger.error("KV cache delete error after deleting user", user_id=user_id, error=str(e), exc_info=True)

    logger.info("User deleted from D1 and KV cache invalidated", user_id=user_id)


async def get_user_location(env: Settings, user_id: str) -> Optional[Location]:
    """Get a user's location.

    Checks KV cache first, then falls back to fetching the full user object via get_user.

    Args:
        env: Cloudflare environment object with bindings.
        user_id: User ID

    Returns:
        Location object or None if not set or user not found.

    Raises:
        NotFoundError: If user not found when fetching the full object.
    """
    location_cache_key = USER_LOCATION_CACHE_KEY.format(user_id=user_id)

    # Check KV cache first
    try:
        cached_data = await env.KV.get(location_cache_key, type="json")
        if cached_data:
            logger.debug("User location retrieved from KV cache", user_id=user_id)
            return Location.model_validate(cached_data)
    except Exception as e:
        logger.error("KV cache get error for user location", user_id=user_id, error=str(e), exc_info=True)
        # Fall through to fetching the user if cache read fails

    # If not cached or cache read failed, get the full user object
    try:
        user = await get_user(env, user_id)  # Calls the refactored get_user
    except NotFoundError:
        # If get_user raises NotFoundError, the user doesn't exist
        return None  # Or re-raise depending on desired behavior
    except Exception as e:
        # Handle other potential errors from get_user
        logger.error("Error fetching user object in get_user_location", user_id=user_id, error=str(e), exc_info=True)
        # Depending on requirements, might want to raise an error here
        return None

    # If user exists and has location, cache it and return
    if user and user.location:
        try:
            await env.KV.put(location_cache_key, user.location.model_dump_json(), expiration_ttl=86400)  # 24 hours
        except Exception as e:
            logger.error("KV cache put error for user location", user_id=user_id, error=str(e), exc_info=True)
            # Continue without cache, but log the error
        return user.location

    # User exists but has no location
    return None


async def update_last_active(env: Settings, user_id: str) -> None:
    """Update a user's last active timestamp.

    Calls the main update_user function to ensure cache invalidation.

    Args:
        env: Cloudflare environment object with bindings.
        user_id: User ID

    Raises:
        NotFoundError: If user not found (propagated from update_user).
        ValidationError: If update fails (propagated from update_user).
    """
    now = datetime.now()
    try:
        # Call update_user to handle DB update and cache invalidation
        await update_user(env, user_id, {"last_active": now.isoformat()})
    except Exception as e:
        logger.error("D1 database error updating user last_active", user_id=user_id, error=str(e), exc_info=True)
        # Propagate error consistent with update_user (NotFoundError, ValidationError)
        # Assuming update_user handles logging, just re-raise or wrap
        raise ValidationError(f"Failed to update last active time for user: {user_id}") from e

    logger.debug("User last active updated via update_user call", user_id=user_id, timestamp=now)


# TODO: Review remaining functions in this file (if any) for Cloudflare D1/KV/R2 usage.
# E.g., functions related to profile photos (R2), matching logic, etc.
# Also remove the old execute_query and cache util imports once fully refactored.
