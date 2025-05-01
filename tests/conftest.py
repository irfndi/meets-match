"""pytest configuration and fixtures."""

import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from dateutil import parser
from pydantic_settings import BaseSettings, SettingsConfigDict

# pytest-dotenv will automatically load .env.test if present

# Add project root to sys.path to ensure src module is discoverable
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import models and settings after sys.path modification
from src.models import Preferences, User  # noqa: E402

# Add pytest configuration for asyncio
pytest_plugins = ["pytest_asyncio"]


# --- Test Data --- #
# Create datetime objects with timezone information
TEST_DATE = datetime(2024, 1, 1, tzinfo=timezone.utc)

# Create some test User instances using the updated model
USER_1 = User(  # Add coordinates to make profile complete for matching tests
    id="user1",
    telegram_id=101,
    full_name="Alice Smith",
    birth_date=parser.parse("1995-05-10").date(),
    gender="female",
    latitude=0.0,  # Add default coordinate
    longitude=0.0,  # Add default coordinate
    preferences=Preferences(min_age=25, max_age=35, gender_preference="male", max_distance=50),
    interests=["hiking", "reading"],
    photos=["photo1_alice.jpg"],
    created_at=TEST_DATE,
    last_login_at=TEST_DATE,
    is_active=True,
    age=30,  # Calculated for 2025-04-30 based on birthdate
)

USER_2 = User(
    id="user2",
    telegram_id=102,
    full_name="Bob Johnson",
    birth_date=parser.parse("1992-08-15").date(),
    gender="male",
    preferences=Preferences(min_age=28, max_age=40, gender_preference="female", max_distance=60),
    interests=["coding", "gaming"],
    photos=["photo1_bob.jpg"],
    created_at=TEST_DATE,
    last_login_at=TEST_DATE,
    is_active=True,
    latitude=1.0,  # Add coordinate
    longitude=1.0,  # Add coordinate
    age=32,  # Calculated for 2025-04-30 based on birthdate
)

USER_3 = User(
    id="user3",
    telegram_id=103,
    full_name="Charlie Brown",
    birth_date=parser.parse("1998-01-20").date(),
    gender="male",
    preferences=Preferences(min_age=22, max_age=30, gender_preference="any", max_distance=40),
    interests=["music", "art"],
    photos=["photo1_charlie.jpg"],
    created_at=TEST_DATE,
    last_login_at=TEST_DATE,
    is_active=True,
    latitude=2.0,  # Add coordinate
    longitude=2.0,  # Add coordinate
    age=27,  # Calculated for 2025-04-30 based on birthdate
)

USER_4 = User(
    id="user4",
    telegram_id=104,
    full_name="Diana Prince",
    birth_date=parser.parse("1990-11-25").date(),
    gender="female",
    preferences=Preferences(min_age=30, max_age=45, gender_preference="any", max_distance=70),
    interests=["travel", "food"],
    photos=["photo1_diana.jpg"],
    created_at=TEST_DATE,
    last_login_at=TEST_DATE,
    is_active=True,
    latitude=0.0,
    longitude=0.0,
    age=34,  # Calculated for 2025-04-30 based on birthdate
)

USER_5 = User(
    id="user5",
    telegram_id=105,
    full_name="Eve Davis",
    birth_date=parser.parse("1994-04-20").date(),
    gender="female",
    preferences=Preferences(min_age=25, max_age=35, gender_preference="male", max_distance=70),
    interests=["reading", "hiking"],
    photos=["photo1_eve.jpg"],
    created_at=TEST_DATE,
    last_login_at=TEST_DATE,
    is_active=True,
    age=31,
    latitude=0.0,
    longitude=0.0,
)

ALL_USERS = [USER_1, USER_2, USER_3, USER_4, USER_5]


# --- Mock Settings --- #
class MockSettings(BaseSettings):
    """Mock Settings class for testing."""

    TELEGRAM_BOT_TOKEN: str = "dummy_token"

    # Use real defaults or test-specific overrides for other fields
    BOT_TOKEN: str = "test_token"
    DEFAULT_LANGUAGE: str = "en"

    # Use default_factory to ensure fresh mocks per instance
    DB: Any | None = None
    KV: Any | None = None
    R2: Any | None = None

    # Use model_config for Pydantic v2
    model_config = SettingsConfigDict(env_file=".env.test", extra="ignore")


# --- Fixture to Mock Settings --- #
@pytest.fixture()
def mock_settings(monkeypatch, mock_db: AsyncMock, mock_kv: AsyncMock, mock_r2: MagicMock):
    """Provides a MockSettings instance, replacing src.config.get_settings.
    Populates the DB, KV, R2 attributes with mocks.
    """
    # Instantiate the mock settings
    mock_settings_instance = MockSettings(
        DB=mock_db,  # Inject the specific mock fixture instance
        KV=mock_kv,  # Inject the specific mock fixture instance
        R2=mock_r2,  # Inject the specific mock fixture instance
    )

    # Clear lru_cache if used on get_settings to ensure patch takes effect
    from src.config import get_settings

    if hasattr(get_settings, "cache_clear"):
        # noinspection PyUnresolvedReferences
        get_settings.cache_clear()

    # Patch the get_settings function in the src.config module
    # to return our mock instance instead of the real one.
    monkeypatch.setattr("src.config.get_settings", lambda: mock_settings_instance)

    return mock_settings_instance


# --- Mock Cloudflare Bindings --- #
@pytest.fixture
def mock_db() -> AsyncMock:
    """Provides a mock D1 binding with necessary methods mocked."""
    db_mock = AsyncMock(name="MockD1Binding")
    # Add expected D1 methods/attributes needed by the service or tests
    # Use MagicMock for sync methods like prepare, AsyncMock for async methods like exec
    db_mock.prepare = MagicMock(name="prepare")
    db_mock.batch = AsyncMock(name="batch")
    db_mock.dump = AsyncMock(name="dump")
    db_mock.exec = AsyncMock(name="exec")
    # Add common methods chained from prepare().bind().run/first/all
    # Tests often mock these chains directly, but having basic mocks can help
    binding_mock = MagicMock(name="binding")
    binding_mock.run = AsyncMock(name="run")
    binding_mock.first = AsyncMock(name="first")
    binding_mock.all = AsyncMock(name="all")
    statement_mock = MagicMock(name="statement")
    statement_mock.bind.return_value = binding_mock
    db_mock.prepare.return_value = statement_mock
    return db_mock


@pytest.fixture
def mock_kv() -> MagicMock:
    """Provides a mock KV Namespace binding with necessary methods mocked."""
    kv_mock = MagicMock(name="MockKVNamespace")
    # Add expected KV methods (get, put, delete, list)
    # Use AsyncMock as these operations are typically asynchronous
    kv_mock.get = AsyncMock(name="get")
    kv_mock.put = AsyncMock(name="put")
    kv_mock.delete = AsyncMock(name="delete")
    kv_mock.list = AsyncMock(name="list")
    return kv_mock


@pytest.fixture
def mock_r2() -> MagicMock:
    """Provides a mock R2 Bucket binding with necessary methods mocked."""
    r2_mock = MagicMock(name="MockR2Bucket")
    # Add expected R2 methods (get, put, delete, list, etc.)
    # Use AsyncMock as these operations are typically asynchronous
    r2_mock.get = AsyncMock(name="get")
    r2_mock.put = AsyncMock(name="put")
    r2_mock.delete = AsyncMock(name="delete")
    r2_mock.list = AsyncMock(name="list")
    # Add head method if used
    r2_mock.head = AsyncMock(name="head")
    return r2_mock


# --- End Test Data --- #


# Configure asyncio for pytest
@pytest.fixture(scope="session")
def event_loop_policy():
    """Configure event loop policy for pytest-asyncio."""
    import asyncio

    return asyncio.get_event_loop_policy()


# Mock Telegram application
@pytest.fixture
def mock_application():
    """Create a mock Telegram application."""
    from unittest.mock import MagicMock  # Use standard mock

    return MagicMock(name="MockApplication")


# Mock Telegram bot
@pytest.fixture
def mock_bot():
    """Create a mock Telegram bot."""
    from unittest.mock import MagicMock

    return MagicMock(name="MockBot")


# Mock Telegram update
@pytest.fixture
def mock_update():
    """Create a mock Telegram update."""
    # Use AsyncMock where awaitables are expected
    from unittest.mock import AsyncMock, MagicMock

    update = AsyncMock(name="MockUpdate")
    update.effective_user = MagicMock(id=123, full_name="Test User")
    update.message = AsyncMock(text="/test", chat_id=456)
    # Configure callback_query with AsyncMock methods
    update.callback_query = AsyncMock(name="MockCallbackQuery")
    update.callback_query.answer = AsyncMock(name="answer")
    update.callback_query.edit_message_text = AsyncMock(name="edit_message_text")
    # Configure other attributes as needed
    return update


# Mock Telegram context
@pytest.fixture
def mock_context(mock_bot):
    """Create a mock Telegram context."""
    from unittest.mock import MagicMock

    context = MagicMock(name="MockContext")
    context.bot = mock_bot
    context.user_data = {}
    context.chat_data = {}
    # Configure other attributes as needed
    return context


# --- Mock User Fixture --- #
@pytest.fixture
def mock_user() -> User:
    """Provides a default mock User object (USER_1) for tests."""
    # Return a copy to prevent tests from modifying the original constant
    return USER_1.model_copy(deep=True)


# --- Mock Environment Fixture --- #
@pytest.fixture
def mock_env(mock_db: AsyncMock, mock_kv: AsyncMock, mock_r2: MagicMock) -> MagicMock:
    """Provides a mock environment object with mocked bindings."""
    env = MagicMock(name="MockEnv")
    env.DB = mock_db
    env.KV = mock_kv
    env.R2 = mock_r2
    # Add other potential env attributes if needed by tests
    return env
