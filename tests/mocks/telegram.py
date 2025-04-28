"""Mock Telegram objects for testing."""

from typing import Optional
from unittest.mock import AsyncMock, MagicMock


class MockUpdate:
    """Mock Telegram Update object."""

    def __init__(self, update_id: int = 1):
        self.update_id = update_id
        self.message = None
        self.callback_query = None
        self.effective_user = None
        self.effective_chat = None


class MockUser:
    """Mock Telegram User object."""

    def __init__(self, user_id: int = 123456, username: str = "test_user"):
        self.id = user_id
        self.username = username
        self.first_name = "Test"
        self.last_name = "User"
        self.is_bot = False


class MockChat:
    """Mock Telegram Chat object."""

    def __init__(self, chat_id: int = 123456, chat_type: str = "private"):
        self.id = chat_id
        self.type = chat_type
        self.username = "test_chat"
        self.title = "Test Chat"


class MockMessage:
    """Mock Telegram Message object."""

    def __init__(
        self,
        message_id: int = 1,
        user: Optional[MockUser] = None,
        chat: Optional[MockChat] = None,
        text: str = "Test message",
    ):
        self.message_id = message_id
        self.from_user = user or MockUser()
        self.chat = chat or MockChat()
        self.text = text
        self.date = 1234567890
        self.reply_to_message = None

        # Mock async methods
        self.reply_text = AsyncMock()
        self.reply_markdown_v2 = AsyncMock()
        self.reply_html = AsyncMock()
        self.delete = AsyncMock()


class MockCallbackQuery:
    """Mock Telegram CallbackQuery object."""

    def __init__(
        self,
        query_id: str = "test_query_id",
        user: Optional[MockUser] = None,
        message: Optional[MockMessage] = None,
        data: str = "test_data",
    ):
        self.id = query_id
        self.from_user = user or MockUser()
        self.message = message or MockMessage()
        self.data = data

        # Mock async methods
        self.answer = AsyncMock()
        self.edit_message_text = AsyncMock()


class MockContext:
    """Mock Telegram Context object."""

    def __init__(self, bot=None):
        self.bot = bot or MockBot()
        self.args = []
        self.user_data = {}
        self.chat_data = {}
        self.bot_data = {}
        self.job_queue = MagicMock()

        # Add async methods
        self.job_queue.run_once = AsyncMock()
        self.job_queue.run_repeating = AsyncMock()


class MockBot:
    """Mock Telegram Bot object."""

    def __init__(self, token: str = "test_token", username: str = "test_bot"):
        self.token = token
        self.username = username

        # Mock async methods
        self.send_message = AsyncMock()
        self.send_photo = AsyncMock()
        self.send_document = AsyncMock()
        self.send_audio = AsyncMock()
        self.send_video = AsyncMock()
        self.send_voice = AsyncMock()
        self.send_sticker = AsyncMock()
        self.delete_message = AsyncMock()
        self.edit_message_text = AsyncMock()
        self.get_updates = AsyncMock()
        self.get_me = AsyncMock(return_value=MockUser(username=username, user_id=0))


class MockApplication:
    """Mock Telegram Application object."""

    def __init__(self, bot=None):
        self.bot = bot or MockBot()
        self.job_queue = MagicMock()
        self.dispatcher = MagicMock()

        # Mock async methods
        self.start_polling = AsyncMock()
        self.stop = AsyncMock()
        self.run_polling = AsyncMock()
        self.create_task = AsyncMock()

        # Mock handler registration methods
        self.add_handler = MagicMock()
        self.add_error_handler = MagicMock()


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


def create_mock_context(bot=None) -> MockContext:
    """Create a mock context with an optional bot."""
    return MockContext(bot=bot or MockBot())
