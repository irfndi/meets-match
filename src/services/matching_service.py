"""Matching service for the MeetMatch bot."""

# TODO: Cloudflare Migration (D1/KV)
# This service likely contains logic interacting with the database (Supabase/PostgreSQL)
# to fetch user data for matching and potentially caching results (Redis).
# All database read operations must be rewritten to use the Cloudflare D1 client API (via bindings).
# All caching logic needs to be updated to use Cloudflare KV (via bindings).
# Review all methods for persistence and caching logic.

import uuid
from typing import List, Optional

from geopy.distance import geodesic

from src.config import settings
from src.models.match import Match, MatchAction, MatchScore, MatchStatus, UserMatch
from src.models.user import User
from src.services.user_service import get_user
from src.utils.cache import get_cache, set_cache
from src.utils.database import execute_query
from src.utils.errors import MatchingError, NotFoundError
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Cache keys
POTENTIAL_MATCHES_CACHE_KEY = "potential_matches:{user_id}"
USER_MATCHES_CACHE_KEY = "user_matches:{user_id}"
MATCH_CACHE_KEY = "match:{match_id}"


def calculate_match_score(user1: User, user2: User) -> MatchScore:
    """Calculate match score between two users.

    Args:
        user1: First user
        user2: Second user

    Returns:
        Match score

    Raises:
        MatchingError: If match score calculation fails
    """
    try:
        # Calculate location score (0-1)
        location_score = 0.0
        if user1.location and user2.location:
            # Calculate distance in kilometers
            user1_coords = (user1.location.latitude, user1.location.longitude)
            user2_coords = (user2.location.latitude, user2.location.longitude)
            distance = geodesic(user1_coords, user2_coords).kilometers

            # Get max distance from preferences (default to 50km)
            max_distance = 50
            if user1.preferences.max_distance:
                max_distance = user1.preferences.max_distance

            # Score decreases linearly with distance
            if distance <= max_distance:
                location_score = 1.0 - (distance / max_distance)
            else:
                location_score = 0.0

        # Calculate interests score (0-1)
        interests_score = 0.0
        if user1.interests and user2.interests:
            # Find common interests
            common_interests = set(user1.interests).intersection(set(user2.interests))
            total_interests = set(user1.interests).union(set(user2.interests))

            # Jaccard similarity
            if total_interests:
                interests_score = len(common_interests) / len(total_interests)

        # Calculate preferences score (0-1)
        preferences_score = 0.0
        preference_checks = 0
        preference_matches = 0

        # Check age preferences
        if user1.preferences.min_age and user1.preferences.max_age and user2.age:
            preference_checks += 1
            if user1.preferences.min_age <= user2.age <= user1.preferences.max_age:
                preference_matches += 1

        # Check gender preferences
        if user1.preferences.gender_preference and user2.gender:
            preference_checks += 1
            if user2.gender in user1.preferences.gender_preference:
                preference_matches += 1

        # Check relationship type preferences
        if user1.preferences.relationship_type and user2.preferences.relationship_type:
            preference_checks += 1
            # Check if there's any overlap in relationship type preferences
            common_rel_types = set(user1.preferences.relationship_type).intersection(
                set(user2.preferences.relationship_type)
            )
            if common_rel_types:
                preference_matches += 1

        # Calculate preferences score
        if preference_checks > 0:
            preferences_score = preference_matches / preference_checks

        # Calculate total score with weights from settings
        total_score = (
            settings.LOCATION_WEIGHT * location_score
            + settings.INTERESTS_WEIGHT * interests_score
            + settings.PREFERENCES_WEIGHT * preferences_score
        )

        # Normalize to 0-1 range
        total_score = max(0.0, min(1.0, total_score))

        return MatchScore(
            total=total_score,
            location=location_score,
            interests=interests_score,
            preferences=preferences_score,
        )

    except Exception as e:
        logger.error(
            "Failed to calculate match score",
            error=str(e),
            user1_id=user1.id,
            user2_id=user2.id,
        )
        raise MatchingError(
            "Failed to calculate match score",
            details={
                "error": str(e),
                "user1_id": user1.id,
                "user2_id": user2.id,
            },
        ) from e


def is_potential_match(user1: User, user2: User) -> bool:
    """Check if two users are potential matches.

    Args:
        user1: First user
        user2: Second user

    Returns:
        True if users are potential matches, False otherwise
    """
    # Skip if either user is not active or profile not complete
    if not user1.is_active or not user2.is_active:
        return False
    if not user1.is_profile_complete or not user2.is_profile_complete:
        return False

    # Skip if either user doesn't have required fields
    if not user1.age or not user2.age:
        return False
    if not user1.gender or not user2.gender:
        return False
    if not user1.location or not user2.location:
        return False

    # Check age preferences
    if user1.preferences.min_age and user1.preferences.max_age:
        if user2.age < user1.preferences.min_age or user2.age > user1.preferences.max_age:
            return False

    if user2.preferences.min_age and user2.preferences.max_age:
        if user1.age < user2.preferences.min_age or user1.age > user2.preferences.max_age:
            return False

    # Check gender preferences
    if user1.preferences.gender_preference and user2.gender not in user1.preferences.gender_preference:
        return False

    if user2.preferences.gender_preference and user1.gender not in user2.preferences.gender_preference:
        return False

    # Check distance preferences
    if user1.location and user2.location:
        user1_coords = (user1.location.latitude, user1.location.longitude)
        user2_coords = (user2.location.latitude, user2.location.longitude)
        distance = geodesic(user1_coords, user2_coords).kilometers

        if user1.preferences.max_distance and distance > user1.preferences.max_distance:
            return False

        if user2.preferences.max_distance and distance > user2.preferences.max_distance:
            return False

    # Check relationship type preferences
    if user1.preferences.relationship_type and user2.preferences.relationship_type:
        # Check if there's any overlap in relationship type preferences
        common_rel_types = set(user1.preferences.relationship_type).intersection(
            set(user2.preferences.relationship_type)
        )
        if not common_rel_types:
            return False

    return True


def get_potential_matches(user_id: str, limit: int = 10) -> List[User]:
    """Get potential matches for a user.

    Args:
        user_id: User ID
        limit: Maximum number of matches to return

    Returns:
        List of potential matches

    Raises:
        NotFoundError: If user not found
        MatchingError: If matching fails
    """
    # Get user
    user = get_user(user_id)

    # Check if user is eligible for matching
    if not user.is_match_eligible():
        logger.debug("0 match found (user not eligible)", user_id=user_id)
        return []

    # Check cache
    cache_key = POTENTIAL_MATCHES_CACHE_KEY.format(user_id=user_id)
    # Extend TTL to keep the match list fresh while the user is active
    cached_ids = get_cache(cache_key, extend_ttl=3600)
    if cached_ids:
        # Get users from cache
        potential_match_ids = cached_ids.split(",")
        potential_matches = []
        for match_id in potential_match_ids[:limit]:
            try:
                potential_matches.append(get_user(match_id))
            except NotFoundError:
                continue

        if potential_matches:
            logger.debug(
                "Potential matches retrieved from cache",
                user_id=user_id,
                count=len(potential_matches),
            )
            return potential_matches

    # Get existing matches
    existing_matches = get_user_matches(user_id)

    # Filter out old rejections (recycle after 30 days)
    # If a match was rejected more than 30 days ago, we allow it to be matched again
    from datetime import datetime, timedelta

    recycle_threshold = datetime.utcnow() - timedelta(days=30)

    existing_match_ids = set()
    for match in existing_matches:
        # specific logic: if rejected and old enough, don't add to exclusion list
        if match.status == MatchStatus.REJECTED and match.updated_at < recycle_threshold:
            continue

        # Add to exclusion list
        existing_match_ids.add(match.user1_id if match.user2_id == user_id else match.user2_id)

    # Prepare database filters
    filters = {
        "is_active": True,
        "is_profile_complete": True,
        "last_active__gte": recycle_threshold,  # Only active users in last 30 days
    }

    # 1. Age Range Filter
    if user.preferences.min_age:
        filters["age__gte"] = user.preferences.min_age
    if user.preferences.max_age:
        filters["age__lte"] = user.preferences.max_age

    # 2. Gender Filter
    if user.preferences.gender_preference:
        filters["gender__in"] = user.preferences.gender_preference

    # 3. Location Bounding Box Filter
    # 1 degree of latitude is ~111km
    # 1 degree of longitude varies (approx 111km * cos(lat))
    if user.location and user.preferences.max_distance:
        max_dist_km = user.preferences.max_distance
        lat = user.location.latitude
        lon = user.location.longitude

        # Crude approximation for bounding box (safe side: larger box than needed)
        # 1 degree lat ~= 111km
        lat_delta = max_dist_km / 111.0

        # 1 degree lon ~= 111km * cos(lat)
        import math

        # Avoid division by zero at poles, and ensure positive
        cos_lat = max(0.1, math.cos(math.radians(lat)))
        lon_delta = max_dist_km / (111.0 * cos_lat)

        filters["location_latitude__gte"] = lat - lat_delta
        filters["location_latitude__lte"] = lat + lat_delta
        filters["location_longitude__gte"] = lon - lon_delta
        filters["location_longitude__lte"] = lon + lon_delta

    # Query database for potential matches
    result = execute_query(
        table="users",
        query_type="select",
        filters=filters,
        limit=limit * 5,  # Fetch more candidates than needed for scoring
    )

    if not result.data:
        logger.warning("No potential matches found", user_id=user_id)
        return []

    # Filter potential matches
    potential_matches = []
    for user_data in result.data:
        potential_user = User.model_validate(user_data)

        # Skip self
        if potential_user.id == user_id:
            continue

        # Skip existing matches
        if potential_user.id in existing_match_ids:
            continue

        # Check if potential match
        if is_potential_match(user, potential_user):
            potential_matches.append(potential_user)

    # Sort by match score
    scored_matches = [
        (potential_user, calculate_match_score(user, potential_user).total) for potential_user in potential_matches
    ]
    scored_matches.sort(key=lambda x: x[1], reverse=True)

    # Get top matches
    top_matches = [match[0] for match in scored_matches[:limit]]

    # Cache potential match IDs
    potential_match_ids = [match.id for match in top_matches]
    set_cache(cache_key, ",".join(potential_match_ids), expiration=3600)  # 1 hour

    logger.info(
        "Potential matches retrieved",
        user_id=user_id,
        count=len(top_matches),
    )
    return top_matches


def create_match(user1_id: str, user2_id: str) -> Match:
    """Create a new match between two users.

    Args:
        user1_id: First user ID
        user2_id: Second user ID

    Returns:
        Created match

    Raises:
        NotFoundError: If user not found
        MatchingError: If match creation fails
    """
    # Get users
    user1 = get_user(user1_id)
    user2 = get_user(user2_id)

    # Calculate match score
    score = calculate_match_score(user1, user2)

    # Create match
    match_id = str(uuid.uuid4())
    match = Match(
        id=match_id,
        user1_id=user1_id,
        user2_id=user2_id,
        status=MatchStatus.PENDING,
        score=score,
    )

    # Insert into database
    result = execute_query(
        table="matches",
        query_type="insert",
        data=match.model_dump(),
    )

    if not result.data or len(result.data) == 0:
        logger.error(
            "Failed to create match",
            user1_id=user1_id,
            user2_id=user2_id,
        )
        raise MatchingError(
            "Failed to create match",
            details={"user1_id": user1_id, "user2_id": user2_id},
        )

    # Cache match
    cache_key = MATCH_CACHE_KEY.format(match_id=match_id)
    set_cache(cache_key, match, expiration=86400)  # 24 hours

    # Clear potential matches cache
    clear_potential_matches_cache(user1_id)
    clear_potential_matches_cache(user2_id)

    logger.info(
        "Match created",
        match_id=match_id,
        user1_id=user1_id,
        user2_id=user2_id,
        score=score.total,
    )
    return match


def get_match(match_id: str) -> Match:
    """Get a match by ID.

    Args:
        match_id: Match ID

    Returns:
        Match object

    Raises:
        NotFoundError: If match not found
    """
    # Check cache
    cache_key = MATCH_CACHE_KEY.format(match_id=match_id)
    cached_match = get_cache(cache_key)
    if cached_match:
        match = Match.model_validate_json(cached_match)
        logger.debug("Match retrieved from cache", match_id=match_id)
        return match

    # Query database
    result = execute_query(
        table="matches",
        query_type="select",
        filters={"id": match_id},
    )

    if not result.data or len(result.data) == 0:
        logger.warning("Match not found", match_id=match_id)
        raise NotFoundError(f"Match not found: {match_id}")

    # Convert to Match model
    match = Match.model_validate(result.data[0])

    # Cache match
    set_cache(cache_key, match, expiration=86400)  # 24 hours

    logger.debug("Match retrieved from database", match_id=match_id)
    return match


def update_match(match_id: str, user_id: str, action: MatchAction) -> Match:
    """Update a match with a user action.

    Args:
        match_id: Match ID
        user_id: User ID
        action: Match action

    Returns:
        Updated match

    Raises:
        NotFoundError: If match not found
        MatchingError: If match update fails
    """
    # Get match
    match = get_match(match_id)

    # Check if user is part of the match
    if user_id != match.user1_id and user_id != match.user2_id:
        logger.warning(
            "User not part of match",
            match_id=match_id,
            user_id=user_id,
        )
        raise MatchingError(
            "User not part of match",
            details={"match_id": match_id, "user_id": user_id},
        )

    # Update match action
    if user_id == match.user1_id:
        match.user1_action = action
    else:
        match.user2_action = action

    # Update match status
    match.update_status()

    # Update in database
    result = execute_query(
        table="matches",
        query_type="update",
        filters={"id": match_id},
        data=match.model_dump(),
    )

    if not result.data or len(result.data) == 0:
        logger.error(
            "Failed to update match",
            match_id=match_id,
            user_id=user_id,
            action=action,
        )
        raise MatchingError(
            "Failed to update match",
            details={"match_id": match_id, "user_id": user_id, "action": action},
        )

    # Update cache
    cache_key = MATCH_CACHE_KEY.format(match_id=match_id)
    set_cache(cache_key, match, expiration=86400)  # 24 hours

    # Clear user matches cache
    clear_user_matches_cache(match.user1_id)
    clear_user_matches_cache(match.user2_id)

    logger.info(
        "Match updated",
        match_id=match_id,
        user_id=user_id,
        action=action,
        status=match.status,
    )
    return match


def get_user_matches(
    user_id: str,
    status: Optional[MatchStatus] = None,
    limit: int = 10,
    offset: int = 0,
) -> List[Match]:
    """Get matches for a user.

    Args:
        user_id: User ID
        status: Optional match status filter
        limit: Max number of matches to return
        offset: Number of matches to skip

    Returns:
        List of matches

    Raises:
        NotFoundError: If user not found
    """
    # Check if user exists
    get_user(user_id)

    # Query database
    filters = {
        "$or": [
            {"user1_id": user_id},
            {"user2_id": user_id},
        ]
    }

    if status:
        filters["status"] = status

    result = execute_query(
        table="matches",
        query_type="select",
        filters=filters,
        limit=limit,
        offset=offset,
        order_by="updated_at desc",
    )

    if not result.data:
        logger.debug("No matches found", user_id=user_id)
        return []

    # Convert to Match models
    matches = [Match.model_validate(match_data) for match_data in result.data]

    logger.debug(
        "User matches retrieved",
        user_id=user_id,
        count=len(matches),
    )
    return matches


def get_user_match_view(match: Match, user_id: str) -> UserMatch:
    """Get a user-friendly view of a match.

    Args:
        match: Match object
        user_id: User ID to create view for

    Returns:
        UserMatch view

    Raises:
        NotFoundError: If user not found
        MatchingError: If match view creation fails
    """
    # Determine the other user ID
    other_user_id = match.user2_id if match.user1_id == user_id else match.user1_id

    # Get other user
    other_user = get_user(other_user_id)

    # Get current user
    current_user = get_user(user_id)

    # Find common interests
    common_interests = list(set(current_user.interests).intersection(set(other_user.interests)))

    # Create user match view
    return UserMatch(
        match_id=match.id,
        user_id=other_user_id,
        username=other_user.username,
        first_name=other_user.first_name,
        age=other_user.age,
        bio=other_user.bio,
        photo_url=other_user.photos[0] if other_user.photos else None,
        common_interests=common_interests,
        match_score=match.score.total,
        status=match.status,
        created_at=match.created_at,
        matched_at=match.matched_at,
    )


def get_user_match_views(
    user_id: str,
    status: Optional[MatchStatus] = None,
    limit: int = 10,
    offset: int = 0,
) -> List[UserMatch]:
    """Get user-friendly views of matches for a user.

    Args:
        user_id: User ID
        status: Optional match status filter
        limit: Max number of matches to return
        offset: Number of matches to skip

    Returns:
        List of UserMatch views

    Raises:
        NotFoundError: If user not found
    """
    # Get matches
    matches = get_user_matches(user_id, status, limit, offset)

    # Create views
    views = []
    for match in matches:
        try:
            views.append(get_user_match_view(match, user_id))
        except (NotFoundError, MatchingError) as e:
            logger.warning(
                "Failed to create match view",
                match_id=match.id,
                user_id=user_id,
                error=str(e),
            )
            continue

    return views


def clear_potential_matches_cache(user_id: str) -> None:
    """Clear potential matches cache for a user.

    Args:
        user_id: User ID
    """
    from src.utils.cache import delete_cache

    cache_key = POTENTIAL_MATCHES_CACHE_KEY.format(user_id=user_id)
    delete_cache(cache_key)
    logger.debug("Potential matches cache cleared", user_id=user_id)


def clear_user_matches_cache(user_id: str) -> None:
    """Clear user matches cache for a user.

    Args:
        user_id: User ID
    """
    from src.utils.cache import delete_cache

    cache_key = USER_MATCHES_CACHE_KEY.format(user_id=user_id)
    delete_cache(cache_key)
    logger.debug("User matches cache cleared", user_id=user_id)


def get_match_by_id(match_id: str) -> Match:
    """Get a match by ID (alias for get_match).

    Args:
        match_id: Match ID

    Returns:
        Match object

    Raises:
        NotFoundError: If match not found
    """
    return get_match(match_id)


def like_match(match_id: str, user_id: Optional[str] = None) -> bool:
    """Like a match.

    Args:
        match_id: Match ID
        user_id: User ID (optional, will be determined from match)

    Returns:
        True if mutual match, False otherwise
    """
    match = get_match(match_id)

    if user_id:
        updated_match = update_match(match_id, user_id, MatchAction.LIKE)
    else:
        updated_match = update_match(match_id, match.user1_id, MatchAction.LIKE)

    return updated_match.status == MatchStatus.MATCHED


def dislike_match(match_id: str, user_id: Optional[str] = None) -> None:
    """Dislike a match.

    Args:
        match_id: Match ID
        user_id: User ID (optional, will be determined from match)
    """
    match = get_match(match_id)

    if user_id:
        update_match(match_id, user_id, MatchAction.DISLIKE)
    else:
        update_match(match_id, match.user1_id, MatchAction.DISLIKE)


def get_active_matches(
    user_id: str,
    limit: int = 10,
    offset: int = 0,
) -> List[Match]:
    """Get active matches for a user.

    Args:
        user_id: User ID
        limit: Max number of matches to return
        offset: Number of matches to skip

    Returns:
        List of active matches
    """
    return get_user_matches(user_id, status=MatchStatus.MATCHED, limit=limit, offset=offset)
