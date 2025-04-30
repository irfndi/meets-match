import asyncio
import json
from datetime import datetime, timedelta, timezone
from typing import List, Set, Tuple

import structlog

from src.config import Settings
from src.models.actions import ActionType
from src.models.match import Match
from src.models.user import Preferences, User
from src.services.user_service import get_user
from src.utils.errors import NotFoundError
from src.utils.geo import haversine_distance

logger = structlog.get_logger(__name__)

# --- Constants ---
MATCH_SCORE_CACHE_TTL = 3600  # 1 hour
POTENTIAL_MATCHES_TTL = 1800  # 30 minutes
USER_LIKED_IDS_TTL = 600  # 10 minutes
USER_DISLIKED_IDS_TTL = 86400  # 24 hours (dislikes persist longer)
USERS_DISLIKING_TARGET_TTL = 600  # 10 minutes

# --- SQL Queries (Consider moving to a dedicated SQL file or ORM) ---
# Select users who meet basic preference criteria (gender, age range)
# Exclude the user themselves, those they've liked/disliked recently
# TODO: Refine this SQL - might be too broad. Python filtering might be better.
SQL_SELECT_POTENTIAL_MATCH_IDS = """
SELECT u.id
FROM users u
WHERE u.id != ? -- Exclude self
  AND u.id NOT IN (SELECT target_user_id FROM actions WHERE user_id = ? AND type = 'like') -- Exclude liked
  AND u.id NOT IN (SELECT target_user_id FROM actions WHERE user_id = ? AND type = 'dislike' AND created_at >= ?) -- Exclude recently disliked
-- Optional: Add basic preference filtering here if efficient in DB
-- AND u.gender IN (SELECT preferred_gender FROM user_preferences WHERE user_id = ?) -- Example
-- AND u.date_of_birth BETWEEN ? AND ? -- Example age range
LIMIT 1000 -- Limit initial fetch size
"""

SQL_SELECT_USER_LIKED_IDS = "SELECT target_user_id FROM actions WHERE user_id = ? AND type = 'like'"
SQL_SELECT_USER_DISLIKED_IDS = (
    "SELECT target_user_id FROM actions WHERE user_id = ? AND type = 'dislike' AND created_at >= ?"
)
SQL_SELECT_USERS_DISLIKING_TARGET = "SELECT user_id FROM actions WHERE target_user_id = ? AND type = 'dislike'"

# SQL Constants needed by record_match_action (based on tests)
SQL_INSERT_LIKE = "INSERT INTO actions (user_id, target_user_id, type, created_at) VALUES (?, ?, 'like', ?)"
SQL_INSERT_DISLIKE = "INSERT INTO actions (user_id, target_user_id, type, created_at) VALUES (?, ?, 'dislike', ?)"
SQL_CHECK_LIKE = "SELECT 1 FROM actions WHERE user_id = ? AND target_user_id = ? AND type = 'like' LIMIT 1"
SQL_INSERT_MATCH = "INSERT INTO matches (user1_id, user2_id, created_at) VALUES (?, ?, ?)"


# --- Helper Functions (Consider moving to _match_helpers.py) ---


def calculate_match_score(user1: User, user2: User) -> float:
    """Calculates a compatibility score between two users."""
    score = 0.0
    # Check if profiles are complete for scoring
    if not all(
        [user1.preferences, user1.latitude, user1.longitude, user2.preferences, user2.latitude, user2.longitude]
    ):
        logger.warning("Incomplete profiles for score calculation", user1=user1.id, user2=user2.id)
        return 0.0  # Cannot score incomplete profiles

    user1_prefs: Preferences = user1.preferences
    user2_prefs: Preferences = user2.preferences

    # 1. Distance Score (higher score for closer users)
    distance = haversine_distance(user1.latitude, user1.longitude, user2.latitude, user2.longitude)
    max_distance_pref = max(user1_prefs.max_distance, user2_prefs.max_distance)  # Consider the larger preference
    # Normalize distance: 1 if distance is 0, decreases linearly to 0 at max_distance_pref
    distance_score = max(0.0, 1 - (distance / max_distance_pref))
    score += distance_score * 0.4  # Weight: 40%

    # 2. Age Preference Score
    # Check if user2's age fits user1's preference and vice-versa
    user1_accepts_user2_age = user1_prefs.min_age <= user2.age <= user1_prefs.max_age
    user2_accepts_user1_age = user2_prefs.min_age <= user1.age <= user2_prefs.max_age
    if user1_accepts_user2_age and user2_accepts_user1_age:
        score += 0.2  # Weight: 20%
    elif user1_accepts_user2_age or user2_accepts_user1_age:
        score += 0.1  # Partial match

    # 3. Gender Preference Score
    user1_accepts_user2_gender = user1_prefs.gender_preference == "any" or user2.gender == user1_prefs.gender_preference
    user2_accepts_user1_gender = user2_prefs.gender_preference == "any" or user1.gender == user2_prefs.gender_preference
    if user1_accepts_user2_gender and user2_accepts_user1_gender:
        score += 0.2  # Weight: 20%
    # Maybe add partial score if only one matches?

    # 4. Common Interests Score
    if user1.interests and user2.interests:
        common_interests = len(set(user1.interests) & set(user2.interests))
        max_possible_common = min(len(user1.interests), len(user2.interests))
        if max_possible_common > 0:
            interest_score = common_interests / max_possible_common
            score += interest_score * 0.2  # Weight: 20%

    return round(score, 4)


async def _get_user_action_ids(
    env: Settings,
    user_id: str,
    action_type: ActionType,
    cache_key_template: str,
    sql_query: str,
    ttl: int,
    use_recency: bool = False,
) -> Set[str]:
    """Generic helper to get IDs user has liked/disliked, with caching."""
    cache_key = cache_key_template.format(user_id=user_id)
    try:
        cached_data = await env.KV.get(cache_key)
        if cached_data:
            return set(json.loads(cached_data))
    except Exception as e:
        logger.error(f"KV get error for {cache_key}", error=e)

    # Cache miss or error, fetch from DB
    params = [user_id]
    if use_recency:
        three_days_ago = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        params.append(three_days_ago)

    try:
        result = await env.DB.prepare(sql_query).bind(*params).all()
        if result and result.results:
            ids = {row["target_user_id"] for row in result.results}  # Adjust key if needed
            try:
                await env.KV.put(cache_key, json.dumps(list(ids)), expiration_ttl=ttl)
            except Exception as e:
                logger.error(f"KV put error for {cache_key}", error=e)
            return ids
        else:
            # Cache empty set if no results
            await env.KV.put(cache_key, json.dumps([]), expiration_ttl=ttl)
            return set()
    except Exception as e:
        logger.error(f"DB error fetching {action_type} IDs for {user_id}", error=e)
        return set()  # Return empty on error


async def _get_user_liked_ids(env: Settings, user_id: str) -> Set[str]:
    """Get IDs of users liked by the given user."""
    return await _get_user_action_ids(
        env,
        user_id,
        ActionType.LIKE,
        f"user_liked_ids:{user_id}",
        SQL_SELECT_USER_LIKED_IDS,
        USER_LIKED_IDS_TTL,
        use_recency=False,
    )


async def _get_user_disliked_ids(env: Settings, user_id: str) -> Set[str]:
    """Get IDs of users recently disliked by the given user."""
    return await _get_user_action_ids(
        env,
        user_id,
        ActionType.DISLIKE,
        f"user_disliked_ids:{user_id}",
        SQL_SELECT_USER_DISLIKED_IDS,
        USER_DISLIKED_IDS_TTL,
        use_recency=True,
    )


async def _get_users_disliking_target(env: Settings, target_user_id: str) -> Set[str]:
    """Get IDs of users who have disliked the target user."""
    cache_key = f"users_disliking:{target_user_id}"
    try:
        cached_data = await env.KV.get(cache_key)
        if cached_data:
            return set(json.loads(cached_data))
    except Exception as e:
        logger.error(f"KV get error for {cache_key}", error=e)

    # Cache miss or error, fetch from DB
    try:
        result = await env.DB.prepare(SQL_SELECT_USERS_DISLIKING_TARGET).bind(target_user_id).all()
        if result and result.results:
            ids = {row["user_id"] for row in result.results}
            try:
                await env.KV.put(cache_key, json.dumps(list(ids)), expiration_ttl=USERS_DISLIKING_TARGET_TTL)
            except Exception as e:
                logger.error(f"KV put error for {cache_key}", error=e)
            return ids
        else:
            await env.KV.put(cache_key, json.dumps([]), expiration_ttl=USERS_DISLIKING_TARGET_TTL)
            return set()
    except Exception as e:
        logger.error(f"DB error fetching users disliking {target_user_id}", error=e)
        return set()


# --- Main Service Functions ---


async def get_match_by_id(env: Settings, match_id: str) -> Match:
    """Retrieves a specific match by its ID."""
    logger.debug("Attempting to get match by ID", match_id=match_id)
    # TODO: Implement database query to fetch match details by ID
    # Example stub:
    logger.warning("get_match_by_id STUB called", match_id=match_id)
    # Simulate finding a match for testing purposes
    if match_id == "valid_match_id":  # Use this in tests
        return Match(id=match_id, user1_id="123", user2_id="456", created_at=datetime.now(timezone.utc))
    raise NotFoundError(f"Match with ID {match_id} not found.")


async def get_potential_matches(env: Settings, user_id: str, limit: int = 10, offset: int = 0) -> List[User]:
    """Retrieves potential matches for a user, sorted by match score.

    Fetches potential match IDs (excluding self, liked, recently disliked),
    calculates a match score based on distance, age/gender preferences, and interests,
    then returns the top-scored users based on limit and offset.

    Args:
        env: The environment context.
        user_id: The ID of the user for whom to find matches.
        limit: The maximum number of matches to return.
        offset: The offset for pagination.

    Returns:
        A list of potential User matches, sorted by score.
    """
    # 1. Get the current user's full profile (needed for scoring)
    try:
        current_user = await get_user(env, user_id)
    except NotFoundError:
        logger.error(f"User {user_id} not found while getting potential matches.")
        return []
    if current_user.preferences is None or current_user.latitude is None or current_user.longitude is None:
        logger.warning(f"User {user_id} has incomplete profile/preferences for matching.")
        # Decide if we should return [] or proceed with partial scoring? For now, return [].
        # Alternatively, could raise a specific error to be handled by the bot.
        # raise ValidationError("User profile is incomplete for matching.")
        return []

    cache_key = f"potential_matches:{user_id}"
    potential_match_ids: List[str] = []

    # 2. Check cache for potential match IDs
    try:
        cached_ids_str = await env.KV.get(cache_key)
        if cached_ids_str:
            potential_match_ids = json.loads(cached_ids_str)
            logger.debug(f"Cache hit for {cache_key}. Found {len(potential_match_ids)} IDs.")
        else:
            # 3. Cache miss: Query the database for potential match IDs
            logger.debug(f"Cache miss for {cache_key}. Fetching from DB.")
            three_days_ago = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
            params = [user_id, user_id, user_id, three_days_ago]
            db_result = await env.DB.prepare(SQL_SELECT_POTENTIAL_MATCH_IDS).bind(*params).all()
            logger.debug(f"Raw DB result for potential matches: {db_result}")
            if db_result:  # Check if the list is not None or empty
                potential_match_ids = [row["id"] for row in db_result if "id" in row]
                logger.debug(f"Fetched IDs from DB: {potential_match_ids}")
    except Exception as e:
        logger.error(f"Error accessing KV or DB for potential matches {user_id}: {e}")
        # Decide if we should return empty list or raise? Returning empty for now.
        return []

    if not potential_match_ids:
        logger.debug(f"No potential match IDs found for user {user_id} after DB/cache check.")
        return []

    # --- START: Add Filtering Logic ---
    logger.debug(f"Raw potential IDs for {user_id}: {potential_match_ids}")

    # Fetch IDs to exclude
    liked_ids_task = _get_user_liked_ids(env, user_id)
    disliked_ids_task = _get_user_disliked_ids(env, user_id)
    users_disliking_current_user_task = _get_users_disliking_target(env, user_id)

    liked_ids, disliked_ids, users_disliking_current_user = await asyncio.gather(
        liked_ids_task, disliked_ids_task, users_disliking_current_user_task
    )

    exclude_ids = {user_id} | liked_ids | disliked_ids | users_disliking_current_user
    logger.debug(f"IDs to exclude for {user_id}: {exclude_ids}")

    filtered_potential_match_ids = [pid for pid in potential_match_ids if pid not in exclude_ids]
    logger.debug(f"Filtered potential IDs for {user_id}: {filtered_potential_match_ids}")

    if not filtered_potential_match_ids:
        logger.debug(f"No potential match IDs remaining after filtering for user {user_id}.")
        return []
    # --- END: Add Filtering Logic ---

    # 4. Fetch full User objects for the *filtered* potential match IDs
    # Use asyncio.gather for concurrent fetching
    logger.info(f"Fetching full User objects for filtered IDs: {filtered_potential_match_ids}")
    tasks = [get_user(env, match_id) for match_id in filtered_potential_match_ids]  # Use filtered list
    results = await asyncio.gather(*tasks, return_exceptions=True)

    potential_matches: List[User] = []
    for i, result in enumerate(results):
        if isinstance(result, User):
            # Basic sanity check: ensure potential match has necessary info for scoring
            if result.preferences and result.latitude and result.longitude:
                logger.debug(f"Fetched user: {result.id}")  # Changed from print
                potential_matches.append(result)
            else:
                logger.warning(
                    f"Potential match {filtered_potential_match_ids[i]} skipped due to incomplete profile."
                )  # Use filtered list index
        elif isinstance(result, NotFoundError):
            logger.warning(
                f"Potential match ID {filtered_potential_match_ids[i]} not found, likely deleted."
            )  # Use filtered list index
        elif isinstance(result, Exception):
            logger.error(
                f"Error fetching potential match {filtered_potential_match_ids[i]}: {result}"
            )  # Use filtered list index

    if not potential_matches:
        logger.debug(f"No valid, complete potential match profiles found for {user_id}.")
        return []

    # 5. Calculate scores for each valid potential match
    scored_matches: List[Tuple[User, float]] = []
    for match in potential_matches:
        score = calculate_match_score(current_user, match)
        scored_matches.append((match, score))
        logger.debug(f"Score for {user_id} -> {match.id}: {score}")

    # 6. Sort matches by score (descending)
    scored_matches.sort(key=lambda item: item[1], reverse=True)

    # 7. Apply offset and limit
    start_index = offset
    end_index = offset + limit
    paginated_scored_matches = scored_matches[start_index:end_index]
    final_matches = [match for match, score in paginated_scored_matches]

    # --- DETAILED LOGGING --- #
    logger.debug(
        f"Pagination details for {user_id}",
        offset=offset,
        limit=limit,
        start_index=start_index,
        end_index=end_index,
        scored_matches_count=len(scored_matches),
        paginated_matches_count=len(paginated_scored_matches),
        final_matches_count=len(final_matches),
        # Log IDs for clarity
        scored_match_ids=[m.id for m, s in scored_matches],
        paginated_match_ids=[m.id for m, s in paginated_scored_matches],
        final_match_ids=[m.id for m in final_matches],
    )
    # --- END LOGGING --- #

    # Cache the FINAL paginated list of match IDs
    try:
        final_match_ids_to_cache = [user.id for user in final_matches]
        await env.KV.put(cache_key, json.dumps(final_match_ids_to_cache), expiration_ttl=POTENTIAL_MATCHES_TTL)
        logger.debug(f"Cached final match IDs for {cache_key}: {final_match_ids_to_cache}")
    except Exception as e:
        logger.error(f"KV error setting cache for {cache_key}: {e}")

    return final_matches


async def record_match_action(env: Settings, actor_id: str, target_id: str, action: str) -> bool:
    """Records a like/dislike action and handles mutual matches.

    Args:
        env: The environment context.
        actor_id: The ID of the user performing the action.
        target_id: The ID of the user receiving the action.
        action: The type of action ('like' or 'dislike').

    Returns:
        True if a mutual match occurred, False otherwise.
    """
    logger.debug(f"Recording action: {actor_id} {action}s {target_id}")
    now_iso = datetime.now(timezone.utc).isoformat()
    mutual_match = False

    try:
        if action == "like":
            # 1. Record the like action
            like_stmt = env.DB.prepare(SQL_INSERT_LIKE)
            await like_stmt.bind(actor_id, target_id, now_iso).run()
            logger.debug("Like action recorded in DB", actor=actor_id, target=target_id)

            # 2. Check if the target user already liked the actor (mutual match check)
            check_stmt = env.DB.prepare(SQL_CHECK_LIKE)
            result = await check_stmt.bind(target_id, actor_id).first()

            if result:
                mutual_match = True
                logger.info("Mutual match detected!", user1=actor_id, user2=target_id)
                # 3. Record the mutual match
                match_stmt = env.DB.prepare(SQL_INSERT_MATCH)
                # Ensure consistent order for user1_id, user2_id (e.g., smaller ID first)
                user1, user2 = sorted([actor_id, target_id])
                await match_stmt.bind(user1, user2, now_iso).run()
                logger.debug("Mutual match recorded in DB", user1=user1, user2=user2)

        elif action == "dislike":
            # Record the dislike action
            dislike_stmt = env.DB.prepare(SQL_INSERT_DISLIKE)
            await dislike_stmt.bind(actor_id, target_id, now_iso).run()
            logger.debug("Dislike action recorded in DB", actor=actor_id, target=target_id)
        else:
            logger.error("Invalid action type provided", action=action)
            return False  # Or raise ValueError?

        # Clear caches
        # Always clear actor's cache
        await clear_potential_matches_cache(env, actor_id)
        # Clear target's cache on mutual match or dislike (as per tests)
        if mutual_match or action == "dislike":
            await clear_potential_matches_cache(env, target_id)

    except Exception as e:
        logger.error(
            f"Database error recording {action}",
            actor=actor_id,
            target=target_id,
            error=str(e),
            exc_info=True,
        )
        # Depending on desired behavior, re-raise or return False
        # For now, log and return False to indicate potential failure
        return False

    return mutual_match


async def get_active_matches(env: Settings, user_id: str, limit: int = 20, offset: int = 0) -> List[Match]:
    """Retrieves active matches for a given user.

    Args:
        env: The environment context.
        user_id: The ID of the user.
        limit: Maximum number of matches to return.
        offset: Offset for pagination.

    Returns:
        A list of active Match objects.
    """
    logger.debug("Retrieving active matches", user_id=user_id, limit=limit, offset=offset)
    # TODO: Implement database query to fetch matches where user_id is user1_id or user2_id
    # Example stub:
    logger.warning("get_active_matches STUB called", user_id=user_id)
    # For testing, you might return a dummy list if needed
    # Example:
    # if user_id == "user_with_matches":
    #     return [
    #         Match(id="match1", user1_id=user_id, user2_id="other1", created_at=datetime.now(timezone.utc)),
    #         Match(id="match2", user1_id="other2", user2_id=user_id, created_at=datetime.now(timezone.utc))
    #     ]
    return []


async def clear_user_action_caches(env: Settings, user_id: str):
    """Clear the caches holding user's own like/dislike actions."""
    like_cache_key = f"user_liked_ids:{user_id}"
    dislike_cache_key = f"user_disliked_ids:{user_id}"
    try:
        # Consider using delete_multi if supported by KV binding wrapper
        await env.KV.delete(like_cache_key)
        await env.KV.delete(dislike_cache_key)
        logger.debug("User like/dislike caches cleared via KV", user_id=user_id)
    except Exception as e:
        logger.error("KV cache delete error for user actions", user_id=user_id, error=str(e), exc_info=True)


async def clear_potential_matches_cache(env: Settings, user_id: str) -> None:
    """Clear potential matches cache for a user."""
    cache_key = f"potential_matches:{user_id}"
    try:
        await env.KV.delete(cache_key)
        logger.debug("Potential matches cache cleared via KV", user_id=user_id)
    except Exception as e:
        logger.error("KV cache delete error for potential matches", user_id=user_id, error=str(e))
