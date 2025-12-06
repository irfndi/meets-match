"""Mock Telegram objects for testing."""

from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import AsyncMock, MagicMock


class MockUpdate:
    """Mock Telegram Update object."""

    # Minimal subset of Update.ALL_TYPES to satisfy BotApplication init in tests
    ALL_TYPES: Tuple[str, ...] = ("message", "edited_message", "callback_query")

    def __init__(self, update_id: int = 1) -> None:
        self.update_id: int = update_id
        self.message: Optional["MockMessage"] = None
        self.callback_query: Optional["MockCallbackQuery"] = None
        self.effective_user: Optional["MockUser"] = None
        self.effective_chat: Optional["MockChat"] = None


class MockUser:
    """Mock Telegram User object."""

    def __init__(self, user_id: int = 123456, username: str = "test_user") -> None:
        self.id: int = user_id
        self.username: str = username
        self.first_name: str = "Test"
        self.last_name: str = "User"
        self.is_bot: bool = False


class MockChat:
    """Mock Telegram Chat object."""

    def __init__(self, chat_id: int = 123456, chat_type: str = "private") -> None:
        self.id: int = chat_id
        self.type: str = chat_type
        self.username: str = "test_chat"
        self.title: str = "Test Chat"


class MockMessage:
    """Mock Telegram Message object."""

    def __init__(
        self,
        message_id: int = 1,
        user: Optional[MockUser] = None,
        chat: Optional[MockChat] = None,
        text: str = "Test message",
    ) -> None:
        self.message_id: int = message_id
        self.from_user: MockUser = user or MockUser()
        self.chat: MockChat = chat or MockChat()
        self.text: str = text
        self.date: int = 1234567890
        self.reply_to_message: Optional["MockMessage"] = None

        # Mock async methods
        self.reply_text: AsyncMock = AsyncMock()
        self.reply_markdown_v2: AsyncMock = AsyncMock()
        self.reply_html: AsyncMock = AsyncMock()
        self.delete: AsyncMock = AsyncMock()


class MockCallbackQuery:
    """Mock Telegram CallbackQuery object."""

    def __init__(
        self,
        query_id: str = "test_query_id",
        user: Optional[MockUser] = None,
        message: Optional[MockMessage] = None,
        data: str = "test_data",
    ) -> None:
        self.id: str = query_id
        self.from_user: MockUser = user or MockUser()
        self.message: MockMessage = message or MockMessage()
        self.data: str = data

        # Mock async methods
        self.answer: AsyncMock = AsyncMock()
        self.edit_message_text: AsyncMock = AsyncMock()


class MockContext:
    """Mock Telegram Context object."""

    def __init__(self, bot: Optional["MockBot"] = None) -> None:
        self.bot: "MockBot" = bot or MockBot()
        self.args: List[str] = []
        self.user_data: Dict[str, Any] = {}
        self.chat_data: Dict[str, Any] = {}
        self.bot_data: Dict[str, Any] = {}
        self.job_queue: MagicMock = MagicMock()

        # Add async methods
        self.job_queue.run_once = AsyncMock()
        self.job_queue.run_repeating = AsyncMock()


class MockBot:
    """Mock Telegram Bot object."""

    def __init__(self, token: str = "test_token", username: str = "test_bot") -> None:
        self.token: str = token
        self.username: str = username

        # Mock async methods
        self.send_message: AsyncMock = AsyncMock()
        self.send_photo: AsyncMock = AsyncMock()
        self.send_document: AsyncMock = AsyncMock()
        self.send_audio: AsyncMock = AsyncMock()
        self.send_video: AsyncMock = AsyncMock()
        self.send_voice: AsyncMock = AsyncMock()
        self.send_sticker: AsyncMock = AsyncMock()
        self.delete_message: AsyncMock = AsyncMock()
        self.edit_message_text: AsyncMock = AsyncMock()
        self.get_updates: AsyncMock = AsyncMock()
        self.get_me: AsyncMock = AsyncMock(return_value=MockUser(username=username, user_id=0))


class MockApplication:
    """Mock Telegram Application object."""

    def __init__(self, bot: Optional[MockBot] = None) -> None:
        self.bot: MockBot = bot or MockBot()
        self.job_queue: MagicMock = MagicMock()
        self.dispatcher: MagicMock = MagicMock()

        # Mock async methods
        self.start_polling: AsyncMock = AsyncMock()
        self.stop: AsyncMock = AsyncMock()
        self.run_polling: AsyncMock = AsyncMock()
        self.create_task: AsyncMock = AsyncMock()

        # Mock handler registration methods
        self.add_handler: MagicMock = MagicMock()
        self.add_error_handler: MagicMock = MagicMock()


def create_mock_update(
    update_id: int = 1,
    message_text: str = "Test message",
    user_id: int = 123456,
    chat_id: int = 123456,
    chat_type: str = "private",
    callback_data: Optional[str] = None,
) -> MockUpdate:
    """Create a mock update with optional message or callback query."""
    user = MockUser(user_id=user_id)
    chat = MockChat(chat_id=chat_id, chat_type=chat_type)
    message = MockMessage(user=user, chat=chat, text=message_text)

    update = MockUpdate(update_id=update_id)
    update.effective_user = user
    update.effective_chat = chat

    if callback_data:
        update.callback_query = MockCallbackQuery(user=user, message=message, data=callback_data)
    else:
        update.message = message

    return update


def create_mock_context(bot: Optional[MockBot] = None) -> MockContext:
    """Create a mock context with an optional bot."""
    return MockContext(bot=bot or MockBot())
