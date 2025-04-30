"""Service layer for handling user actions like liking and disliking."""

import structlog

from src.custom_types import Env
from src.services.matching_service import record_match_action
from src.utils.errors import ActionError

logger = structlog.get_logger(__name__)


async def like_match(env: Env, user_id: str, target_id: str) -> bool:
    """Records a 'like' action from user_id towards target_id.

    Returns:
        True if it resulted in a mutual match, False otherwise.
    Raises:
        ActionError: If the action failed (e.g., DB error).
    """
    logger.debug("Recording like action", actor=user_id, target=target_id)
    try:
        # We delegate the core logic to the matching_service for now
        # as it already handles the mutual match check and DB operations.
        # In a more complex system, this might have its own distinct logic.
        mutual_match = await record_match_action(env, user_id, target_id, "like")
        logger.info("Like action processed", actor=user_id, target=target_id, mutual_match=mutual_match)
        return mutual_match
    except Exception as e:
        logger.error("Failed to record like action", actor=user_id, target=target_id, error=str(e), exc_info=True)
        # Raise a more specific ActionError instead of letting the raw exception bubble up
        raise ActionError(f"Could not record like for user {user_id} on target {target_id}") from e


async def dislike_match(env: Env, user_id: str, target_id: str) -> None:
    """Records a 'dislike' action from user_id towards target_id.

    Raises:
        ActionError: If the action failed (e.g., DB error).
    """
    logger.debug("Recording dislike action", actor=user_id, target=target_id)
    try:
        # Delegate to matching_service which handles DB and cache clearing
        await record_match_action(env, user_id, target_id, "dislike")
        logger.info("Dislike action processed", actor=user_id, target=target_id)
    except Exception as e:
        logger.error("Failed to record dislike action", actor=user_id, target=target_id, error=str(e), exc_info=True)
        raise ActionError(f"Could not record dislike for user {user_id} on target {target_id}") from e
