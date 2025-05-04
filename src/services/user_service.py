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
        await get_user(env, user.id)
        # If get_user succeeds, the user ALREADY exists.
        logger.warning("Attempted to create user that already exists", user_id=user.id)  # Log before raising
        raise ValidationError(f"User already exists: {user.id}")
    except NotFoundError:
        # This is the expected case for a new user. Proceed.
        logger.debug("User does not exist, proceeding with creation", user_id=user.id)  # Explicitly log proceeding

    # Proceed with insertion into D1
    now = datetime.now()
    user.created_at = now

    # Convert user model to dictionary suitable for D1 insert
    # TODO: Ensure this conversion handles all required D1 columns correctly
    user_data = user.model_dump(mode="json", exclude={"age"})  # Exclude computed fields like age

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

    # Filter out keys not in the Pydantic model *before* dynamic SQL generation
    allowed_columns = set(User.model_fields.keys())
    model_update_fields = {k: v for k, v in update_fields.items() if k in allowed_columns}

    # Explicitly check for fields provided in the input data that are NOT in the model
    invalid_fields = set(data.keys()) - allowed_columns - {"updated_at"}  # Exclude manually handled updated_at
    if invalid_fields:
        logger.error("Invalid fields provided for user update", user_id=user_id, invalid_fields=list(invalid_fields))
        raise ValidationError(f"Invalid update fields: {list(invalid_fields)}")

    # Construct the SET part of the SQL query dynamically using only valid model fields
    set_clause = ", ".join([f"{key} = ?" for key in model_update_fields])
    values = list(model_update_fields.values())

    # Add the manually set updated_at for the DB query, if the column exists in DB
    # This assumes 'updated_at' exists in the 'users' table in D1.
    # If not, this part needs adjustment based on actual DB schema.
    if "updated_at" in data:
        # Ensure 'updated_at' column exists in DB schema
        # We add it separately as it's not in the Pydantic model's allowed_columns for validation purposes
        if set_clause:
            set_clause += ", "
        set_clause += "updated_at = ?"
        values.append(data["updated_at"])

    if not set_clause:
        logger.warning("No valid fields provided for user update", user_id=user_id)
        # Return the current user state without attempting DB update if no fields are changing
        # Or raise an error, depending on desired behavior
        return await get_user(env, user_id)

    # Log the prepared statement and values for debugging
    logger.debug(
        "Preparing D1 update statement",
        user_id=user_id,
        set_clause=set_clause,
        values_count=len(values),
        keys=list(model_update_fields.keys()) + (["updated_at"] if "updated_at" in data else []),
    )

    # Execute D1 update
    try:
        stmt = env.DB.prepare(f"UPDATE users SET {set_clause} WHERE id = ?")
        await stmt.bind(*values, user_id).run()
        logger.info("User updated successfully in D1", user_id=user_id, updated_keys=list(model_update_fields.keys()))
    except Exception as e:
        logger.error("D1 update error", user_id=user_id, error=str(e), exc_info=True)
        raise ValidationError(f"Database error updating user: {user_id}") from e

    # Invalidate KV cache
    cache_key = USER_CACHE_KEY.format(user_id=user_id)
    try:
        await env.KV.delete(cache_key)
        logger.info("KV cache invalidated for user", user_id=user_id)
    except Exception as e:
        logger.error("KV cache delete error after update", user_id=user_id, error=str(e), exc_info=True)

    # Refetch the user to return the updated state (also warms the cache)
    try:
        updated_user = await get_user(env, user_id)
        return updated_user
    except NotFoundError:
        logger.error("User not found immediately after update", user_id=user_id)
        raise ValidationError(f"Failed to refetch user after update: {user_id}") from None
    except Exception as e:
        logger.error("Error refetching user after update", user_id=user_id, error=str(e), exc_info=True)
        raise ValidationError(f"Error refetching user after update: {user_id}") from e


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
        await update_user(env, user_id, {"last_login_at": now.isoformat()})
    except Exception as e:
        logger.error("D1 database error updating user last_active", user_id=user_id, error=str(e), exc_info=True)
        # Propagate error consistent with update_user (NotFoundError, ValidationError)
        # Assuming update_user handles logging, just re-raise or wrap
        raise ValidationError(f"Failed to update last active time for user: {user_id}") from e

    logger.debug("User last active updated via update_user call", user_id=user_id, timestamp=now)


# --- Profile Photo URL ---
async def get_user_profile_photo_url(env: Settings, user_id: str) -> str | None:
    """Get the public URL for a user's profile photo.

    Args:
        env: Cloudflare environment object with bindings (DB, KV, R2, R2_PUBLIC_URL).
        user_id: User ID.

    Returns:
        The public URL of the profile photo, or None if the user has no photo
        or the public URL is not configured.

    Raises:
        NotFoundError: If the user is not found.
        ValidationError: If R2_PUBLIC_URL is not set in the environment.
    """
    logger.debug("Attempting to get profile photo URL", user_id=user_id)
    try:
        user = await get_user(env, user_id)  # Reuse get_user to handle cache/DB fetch and NotFoundError

        if not user.profile_photo_key:
            logger.debug("User has no profile photo key", user_id=user_id)
            return None

        if not env.R2_PUBLIC_URL:
            logger.error("R2_PUBLIC_URL environment variable is not set.", user_id=user_id)
            # Or raise a specific configuration error
            raise ValidationError("R2 public URL is not configured.")

        # Construct the full public URL
        # Ensure no double slashes between base URL and key
        base_url = env.R2_PUBLIC_URL.rstrip("/")
        photo_key = user.profile_photo_key.lstrip("/")
        photo_url = f"{base_url}/{photo_key}"

        logger.info("Profile photo URL retrieved", user_id=user_id, url=photo_url)
        return photo_url

    except NotFoundError:
        # Let NotFoundError from get_user propagate
        logger.warning("User not found when getting profile photo URL", user_id=user_id)
        raise
    except ValidationError:
        # Let ValidationError from missing R2_PUBLIC_URL propagate
        raise
    except Exception as e:
        logger.error("Unexpected error getting profile photo URL", user_id=user_id, error=str(e), exc_info=True)
        # Wrap unexpected errors
        raise ValidationError(f"Failed to get profile photo URL for user {user_id}") from e


# --- User Location ---
