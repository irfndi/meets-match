"""Conversation service for the MeetMatch bot."""

import uuid
from datetime import datetime
from typing import List, Optional

from src.models.conversation import Conversation, ConversationStatus, Message, MessageType
from src.models.match import MatchStatus
from src.services.matching_service import get_match
from src.utils.cache import delete_cache, get_cache, get_cache_model, set_cache
from src.utils.database import execute_query
from src.utils.errors import NotFoundError, ValidationError
from src.utils.logging import get_logger

logger = get_logger(__name__)

# Cache keys
CONVERSATION_CACHE_KEY = "conversation:{conversation_id}"
USER_CONVERSATIONS_CACHE_KEY = "user_conversations:{user_id}"
MATCH_CONVERSATION_CACHE_KEY = "match_conversation:{match_id}"


def create_conversation(match_id: str) -> Conversation:
    """Create a new conversation for a match.

    Args:
        match_id: Match ID

    Returns:
        Created conversation

    Raises:
        NotFoundError: If match not found
        ValidationError: If conversation creation fails
    """
    # Get match
    match = get_match(match_id)

    # Check if match is in matched status
    if match.status != MatchStatus.MATCHED:
        logger.warning(
            "Cannot create conversation for non-matched match",
            match_id=match_id,
            status=match.status,
        )
        raise ValidationError(
            "Cannot create conversation for non-matched match",
            details={"match_id": match_id, "status": match.status},
        )

    # Check if conversation already exists
    try:
        existing_conversation = get_conversation_by_match(match_id)
        if existing_conversation:
            logger.warning(
                "Conversation already exists for match",
                match_id=match_id,
                conversation_id=existing_conversation.id,
            )
            return existing_conversation
    except NotFoundError:
        # Conversation doesn't exist, continue with creation
        pass

    # Create conversation
    conversation_id = str(uuid.uuid4())
    conversation = Conversation(
        id=conversation_id,
        match_id=match_id,
        user1_id=match.user1_id,
        user2_id=match.user2_id,
        status=ConversationStatus.ACTIVE,
    )

    # Insert into database
    result = execute_query(
        table="conversations",
        query_type="insert",
        data=conversation.model_dump(exclude={"messages"}),
    )

    if not result.data or len(result.data) == 0:
        logger.error(
            "Failed to create conversation",
            match_id=match_id,
        )
        raise ValidationError(
            "Failed to create conversation",
            details={"match_id": match_id},
        )

    # Create system message
    system_message = create_message(
        conversation_id=conversation_id,
        sender_id="system",
        message_type=MessageType.SYSTEM,
        content="You've been matched! Say hello and start a conversation.",
    )

    # Add message to conversation
    conversation.add_message(system_message)

    # Cache conversation
    cache_key = CONVERSATION_CACHE_KEY.format(conversation_id=conversation_id)
    set_cache(cache_key, conversation, expiration=86400)  # 24 hours

    # Cache match conversation mapping
    match_conversation_key = MATCH_CONVERSATION_CACHE_KEY.format(match_id=match_id)
    set_cache(match_conversation_key, conversation_id, expiration=86400)  # 24 hours

    # Clear user conversations cache
    clear_user_conversations_cache(match.user1_id)
    clear_user_conversations_cache(match.user2_id)

    logger.info(
        "Conversation created",
        conversation_id=conversation_id,
        match_id=match_id,
    )
    return conversation


def get_conversation(conversation_id: str) -> Conversation:
    """Get a conversation by ID.

    Args:
        conversation_id: Conversation ID

    Returns:
        Conversation object

    Raises:
        NotFoundError: If conversation not found
    """
    # Check cache
    cache_key = CONVERSATION_CACHE_KEY.format(conversation_id=conversation_id)
    cached_conversation = get_cache_model(cache_key, Conversation)
    if cached_conversation:
        logger.debug("Conversation retrieved from cache", conversation_id=conversation_id)
        return cached_conversation

    # Query database
    result = execute_query(
        table="conversations",
        query_type="select",
        filters={"id": conversation_id},
    )

    if not result.data or len(result.data) == 0:
        logger.warning("Conversation not found", conversation_id=conversation_id)
        raise NotFoundError(f"Conversation not found: {conversation_id}")

    # Convert to Conversation model
    conversation = Conversation.model_validate(result.data[0])

    # Get messages
    messages_result = execute_query(
        table="messages",
        query_type="select",
        filters={"conversation_id": conversation_id},
    )

    if messages_result.data:
        # Convert to Message models and sort by created_at
        messages = [Message.model_validate(msg_data) for msg_data in messages_result.data]
        messages.sort(key=lambda msg: msg.created_at)
        conversation.messages = messages

    # Cache conversation
    set_cache(cache_key, conversation, expiration=86400)  # 24 hours

    logger.debug("Conversation retrieved from database", conversation_id=conversation_id)
    return conversation


def get_conversation_by_match(match_id: str) -> Conversation:
    """Get a conversation by match ID.

    Args:
        match_id: Match ID

    Returns:
        Conversation object

    Raises:
        NotFoundError: If conversation not found
    """
    # Check cache
    match_conversation_key = MATCH_CONVERSATION_CACHE_KEY.format(match_id=match_id)
    cached_conversation_id = get_cache(match_conversation_key)
    if cached_conversation_id:
        try:
            return get_conversation(cached_conversation_id)
        except NotFoundError:
            # Conversation not found, clear cache and continue
            delete_cache(match_conversation_key)

    # Query database
    result = execute_query(
        table="conversations",
        query_type="select",
        filters={"match_id": match_id},
    )

    if not result.data or len(result.data) == 0:
        logger.warning("Conversation not found for match", match_id=match_id)
        raise NotFoundError(f"Conversation not found for match: {match_id}")

    # Convert to Conversation model
    conversation = Conversation.model_validate(result.data[0])

    # Get messages
    messages_result = execute_query(
        table="messages",
        query_type="select",
        filters={"conversation_id": conversation.id},
    )

    if messages_result.data:
        # Convert to Message models and sort by created_at
        messages = [Message.model_validate(msg_data) for msg_data in messages_result.data]
        messages.sort(key=lambda msg: msg.created_at)
        conversation.messages = messages

    # Cache conversation
    cache_key = CONVERSATION_CACHE_KEY.format(conversation_id=conversation.id)
    set_cache(cache_key, conversation, expiration=86400)  # 24 hours

    # Cache match conversation mapping
    set_cache(match_conversation_key, conversation.id, expiration=86400)  # 24 hours

    logger.debug("Conversation retrieved for match", match_id=match_id)
    return conversation


def get_user_conversations(user_id: str, status: Optional[ConversationStatus] = None) -> List[Conversation]:
    """Get conversations for a user.

    Args:
        user_id: User ID
        status: Optional conversation status filter

    Returns:
        List of conversations

    Raises:
        NotFoundError: If user not found
    """
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
        table="conversations",
        query_type="select",
        filters=filters,
    )

    if not result.data:
        logger.debug("No conversations found", user_id=user_id)
        return []

    # Convert to Conversation models
    conversations = []
    for conv_data in result.data:
        conversation = Conversation.model_validate(conv_data)

        # Get messages
        messages_result = execute_query(
            table="messages",
            query_type="select",
            filters={"conversation_id": conversation.id},
        )

        if messages_result.data:
            # Convert to Message models and sort by created_at
            messages = [Message.model_validate(msg_data) for msg_data in messages_result.data]
            messages.sort(key=lambda msg: msg.created_at)
            conversation.messages = messages

        conversations.append(conversation)

    # Sort by last_message_at (newest first)
    conversations.sort(
        key=lambda conv: conv.last_message_at or conv.created_at,
        reverse=True,
    )

    logger.debug(
        "User conversations retrieved",
        user_id=user_id,
        count=len(conversations),
    )
    return conversations


def update_conversation_status(conversation_id: str, status: ConversationStatus) -> Conversation:
    """Update a conversation's status.

    Args:
        conversation_id: Conversation ID
        status: New status

    Returns:
        Updated conversation

    Raises:
        NotFoundError: If conversation not found
    """
    # Get conversation
    conversation = get_conversation(conversation_id)

    # Update status
    conversation.status = status
    conversation.updated_at = datetime.now()

    # Update in database
    result = execute_query(
        table="conversations",
        query_type="update",
        filters={"id": conversation_id},
        data={"status": status, "updated_at": conversation.updated_at},
    )

    if not result.data or len(result.data) == 0:
        logger.error(
            "Failed to update conversation status",
            conversation_id=conversation_id,
            status=status,
        )
        raise ValidationError(
            "Failed to update conversation status",
            details={"conversation_id": conversation_id, "status": status},
        )

    # Update cache
    cache_key = CONVERSATION_CACHE_KEY.format(conversation_id=conversation_id)
    set_cache(cache_key, conversation, expiration=86400)  # 24 hours

    # Clear user conversations cache
    clear_user_conversations_cache(conversation.user1_id)
    clear_user_conversations_cache(conversation.user2_id)

    logger.info(
        "Conversation status updated",
        conversation_id=conversation_id,
        status=status,
    )
    return conversation


def create_message(
    conversation_id: str,
    sender_id: str,
    message_type: MessageType,
    content: str,
    media_url: Optional[str] = None,
) -> Message:
    """Create a new message in a conversation.

    Args:
        conversation_id: Conversation ID
        sender_id: Sender user ID
        message_type: Message type
        content: Message content
        media_url: Optional media URL

    Returns:
        Created message

    Raises:
        NotFoundError: If conversation not found
        ValidationError: If message creation fails
    """
    # Get conversation
    conversation = get_conversation(conversation_id)

    # Check if sender is part of the conversation
    if sender_id != "system" and sender_id != conversation.user1_id and sender_id != conversation.user2_id:
        logger.warning(
            "Sender not part of conversation",
            conversation_id=conversation_id,
            sender_id=sender_id,
        )
        raise ValidationError(
            "Sender not part of conversation",
            details={"conversation_id": conversation_id, "sender_id": sender_id},
        )

    # Create message
    message_id = str(uuid.uuid4())
    message = Message(
        id=message_id,
        conversation_id=conversation_id,
        sender_id=sender_id,
        message_type=message_type,
        content=content,
        media_url=media_url,
    )

    # Insert into database
    result = execute_query(
        table="messages",
        query_type="insert",
        data=message.model_dump(),
    )

    if not result.data or len(result.data) == 0:
        logger.error(
            "Failed to create message",
            conversation_id=conversation_id,
            sender_id=sender_id,
        )
        raise ValidationError(
            "Failed to create message",
            details={"conversation_id": conversation_id, "sender_id": sender_id},
        )

    # Update conversation
    conversation.add_message(message)

    # Update conversation in database
    execute_query(
        table="conversations",
        query_type="update",
        filters={"id": conversation_id},
        data={
            "last_message_id": message.id,
            "last_message_at": message.created_at,
            "updated_at": conversation.updated_at,
        },
    )

    # Update cache
    cache_key = CONVERSATION_CACHE_KEY.format(conversation_id=conversation_id)
    set_cache(cache_key, conversation, expiration=86400)  # 24 hours

    # Clear user conversations cache
    clear_user_conversations_cache(conversation.user1_id)
    clear_user_conversations_cache(conversation.user2_id)

    logger.info(
        "Message created",
        message_id=message_id,
        conversation_id=conversation_id,
        sender_id=sender_id,
        message_type=message_type,
    )
    return message


def mark_messages_as_read(conversation_id: str, user_id: str) -> int:
    """Mark all messages in a conversation as read for a user.

    Args:
        conversation_id: Conversation ID
        user_id: User ID

    Returns:
        Number of messages marked as read

    Raises:
        NotFoundError: If conversation not found
    """
    # Get conversation
    conversation = get_conversation(conversation_id)

    # Check if user is part of the conversation
    if user_id != conversation.user1_id and user_id != conversation.user2_id:
        logger.warning(
            "User not part of conversation",
            conversation_id=conversation_id,
            user_id=user_id,
        )
        raise ValidationError(
            "User not part of conversation",
            details={"conversation_id": conversation_id, "user_id": user_id},
        )

    # Mark messages as read
    unread_count = conversation.get_unread_count(user_id)
    if unread_count > 0:
        conversation.mark_all_as_read(user_id)

        # Update messages in database
        now = datetime.now()
        for message in conversation.messages:
            if message.sender_id != user_id and message.is_read and not message.read_at:
                execute_query(
                    table="messages",
                    query_type="update",
                    filters={"id": message.id},
                    data={"is_read": True, "read_at": now, "updated_at": now},
                )

        # Update cache
        cache_key = CONVERSATION_CACHE_KEY.format(conversation_id=conversation_id)
        set_cache(cache_key, conversation, expiration=86400)  # 24 hours

        logger.info(
            "Messages marked as read",
            conversation_id=conversation_id,
            user_id=user_id,
            count=unread_count,
        )

    return unread_count


def get_unread_count(user_id: str) -> int:
    """Get the total number of unread messages for a user.

    Args:
        user_id: User ID

    Returns:
        Total number of unread messages
    """
    # Get user conversations
    conversations = get_user_conversations(user_id, status=ConversationStatus.ACTIVE)

    # Count unread messages
    total_unread = sum(conversation.get_unread_count(user_id) for conversation in conversations)

    logger.debug(
        "Unread message count",
        user_id=user_id,
        count=total_unread,
    )
    return total_unread


def clear_user_conversations_cache(user_id: str) -> None:
    """Clear user conversations cache for a user.

    Args:
        user_id: User ID
    """
    from src.utils.cache import delete_cache

    cache_key = USER_CONVERSATIONS_CACHE_KEY.format(user_id=user_id)
    delete_cache(cache_key)
    logger.debug("User conversations cache cleared", user_id=user_id)
