"""pytest configuration and fixtures."""

import asyncio
import sys
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from dateutil import parser
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.config import Settings
from src.models import Preferences, User

# pytest-dotenv will automatically load .env.test if present

# Add project root to sys.path to ensure src module is discoverable
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

# Import models and settings after sys.path modification

# Define dummy types or use MagicMock for Worker-specific bindings if not installed locally
KVNamespace = MagicMock
D1Database = MagicMock

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
def mock_settings(
    monkeypatch: pytest.MonkeyPatch, mock_db: MagicMock, mock_kv: AsyncMock, mock_r2: MagicMock
) -> MockSettings:
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
@pytest.fixture(scope="function")
def mock_db() -> MagicMock:
    """Provides a mock D1 binding configured for async operations."""
    # Base mock for the DB binding itself
    db_mock = MagicMock(name="MockD1Database")

    # Mock the prepare method to return another mock
    stmt_mock = MagicMock(name="MockD1PreparedStatement")
    db_mock.prepare.return_value = stmt_mock

    # Mock the bind method on the statement mock to return the statement mock (for chaining)
    stmt_mock.bind.return_value = stmt_mock

    # Mock the first method to return an AsyncMock initially
    result_mock = AsyncMock(name="MockD1Result")
    stmt_mock.first.return_value = result_mock

    # Configure the AsyncMock returned by first() to resolve to user data
    # Convert USER_1 Pydantic model to a dictionary suitable for DB row simulation
    # Ensure date/datetime objects are handled correctly if needed (e.g., isoformat)
    user_dict = USER_1.model_dump(mode="json")  # Use model_dump for Pydantic v2
    # Convert dates back to date objects if model_dump converts them to strings
    if "birth_date" in user_dict and isinstance(user_dict["birth_date"], str):
        user_dict["birth_date"] = date.fromisoformat(user_dict["birth_date"])
    if "created_at" in user_dict and isinstance(user_dict["created_at"], str):
        user_dict["created_at"] = datetime.fromisoformat(user_dict["created_at"].replace("Z", "+00:00"))
    if "last_login_at" in user_dict and isinstance(user_dict["last_login_at"], str):
        user_dict["last_login_at"] = datetime.fromisoformat(user_dict["last_login_at"].replace("Z", "+00:00"))

    # Set the result_mock to resolve to the user dictionary when awaited
    # We wrap it in another AsyncMock to simulate the `await stmt.bind(...).first()`
    async def mock_first_result(*args, **kwargs):
        # Add basic query check if needed (e.g., check args[0] == USER_1.id)
        # For now, just return the default user dict
        return user_dict

    stmt_mock.first = AsyncMock(side_effect=mock_first_result)

    # Mock other methods like 'run', 'all' if needed by other tests
    stmt_mock.run = AsyncMock(name="run")
    stmt_mock.all = AsyncMock(name="all", return_value=AsyncMock(results=[]))  # Example for 'all'

    return db_mock


@pytest.fixture(scope="function")
def mock_kv() -> AsyncMock:  # Return AsyncMock
    """Provides a mock KV Namespace binding using AsyncMock."""
    mock_kv_namespace = AsyncMock(name="MockKVNamespace")
    # Configure common methods
    mock_kv_namespace.get.return_value = None  # Simulate cache miss by default
    mock_kv_namespace.put = AsyncMock(name="put")
    mock_kv_namespace.delete = AsyncMock(name="delete")
    return mock_kv_namespace


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


# --- Mock Environment Bundler --- #
@dataclass
class MockEnv:
    """Bundles mock environment bindings."""

    db: MagicMock
    kv: AsyncMock
    r2: MagicMock


@pytest.fixture
def mock_env_fixture(mock_db: MagicMock, mock_kv: AsyncMock, mock_r2: MagicMock) -> MockEnv:
    """Provides a MockEnv instance containing mock bindings."""
    return MockEnv(db=mock_db, kv=mock_kv, r2=mock_r2)


# --- Mock Location Services --- #
@pytest.fixture
def mock_geocoder() -> MagicMock:
    """Provides a mock geocoder instance."""
    geocoder = MagicMock()
    # Configure the mock geocoder as needed for tests
    # e.g., geocoder.geocode.return_value = MockLocation(...)
    return geocoder


@pytest.fixture
def mock_geocoding_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Mocks geopy Nominatim environment variables."""
    # Ensure Nominatim uses a test user agent if needed
    monkeypatch.setenv("GEOPY_USER_AGENT", "meetsmatch_test_suite")


# --- Mock Telegram Objects --- #
@pytest.fixture
def mock_update() -> AsyncMock:
    """Provides a mock telegram.Update object."""
    # Use AsyncMock where awaitables are expected
    from unittest.mock import AsyncMock, MagicMock

    update = AsyncMock(name="MockUpdate")
    update.effective_user = MagicMock(id=123, full_name="Test User")
    update.message = AsyncMock(text="/test", chat_id=456)
    update.message.reply_text = AsyncMock(name="reply_text")
    # Explicitly define effective_message and its awaited methods
    update.effective_message = AsyncMock(name="MockEffectiveMessage")
    update.effective_message.reply_text = AsyncMock(name="reply_text")  # Keep this too, might be used elsewhere
    # Configure callback_query with AsyncMock methods
    update.callback_query = AsyncMock(name="MockCallbackQuery")
    update.callback_query.answer = AsyncMock(name="answer")
    update.callback_query.edit_message_text = AsyncMock(name="edit_message_text")
    # Configure other attributes as needed
    return update


# --- Mock Telegram Context --- #
@pytest.fixture
def mock_context() -> MagicMock:
    """Create a mock Telegram context."""
    from unittest.mock import MagicMock

    from telegram.ext import ContextTypes

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.user_data = {}
    context.bot_data = {
        # Add a mock environment
        "env": MagicMock()
    }
    context.args = []
    context.application = MagicMock()
    return context


# --- Mock User Fixture --- #
@pytest.fixture(scope="function")
def mock_user() -> User:
    """Provides a default mock User object for tests."""
    # Return a copy to prevent tests from modifying the original constant
    return User(
        id="user1",
        telegram_id=101,
        full_name="Alice Smith",
        birth_date=date(1995, 5, 10),
        # Use string literal to match the User model's Literal type hint
        gender="female",
        preferences=Preferences(
            min_age=18,
            max_age=100,
            gender_preference="male",
            max_distance=50,
        ),
        interests=["hiking", "reading"],
        photos=["photo1_alice.jpg"],
        created_at=TEST_DATE,
        last_login_at=TEST_DATE,
        is_active=True,
        latitude=0.0,
        longitude=0.0,
    )


# --- Mock Environment Fixture --- #
@pytest.fixture
def mock_env(mock_db: AsyncMock, mock_kv: AsyncMock, mock_r2: MagicMock) -> MagicMock:
    """Provides a mocked environment object."""
    env = MagicMock(spec=MockEnv)  # Keep spec for structure hinting if useful
    env.settings = MagicMock(spec=Settings)
    env.settings.kv_namespace_id = "test_kv_id"
    env.settings.d1_database_id = "test_d1_id"

    # Assign KV and DB directly as expected by middleware/services
    env.KV = mock_kv
    env.DB = mock_db
    env.R2 = mock_r2  # Assuming R2 might be accessed directly too

    return env


# Configure asyncio for pytest
@pytest.fixture(scope="session")
def event_loop_policy() -> asyncio.AbstractEventLoopPolicy:
    """Configure event loop policy for pytest-asyncio."""
    import asyncio

    return asyncio.get_event_loop_policy()


# Mock Telegram application
@pytest.fixture
def mock_application() -> MagicMock:
    """Create a mock Telegram application."""
    from unittest.mock import MagicMock

    return MagicMock(name="MockApplication")


# Mock Telegram bot
@pytest.fixture
def mock_bot() -> MagicMock:
    """Create a mock Telegram bot."""
    from unittest.mock import MagicMock

    return MagicMock(name="MockBot")
