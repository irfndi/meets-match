"""Mock application for testing."""

from unittest.mock import MagicMock

# Application-specific imports
from tests.mocks.telegram import MockApplication, MockBot


class BotApplication:
    """Mock BotApplication class for testing."""

    def __init__(self):
        """Initialize the mock application."""
        self.application = MockApplication()
        self.bot = MockBot()
        self.initialized = False

        # Don't mock the methods directly - we want to test the actual implementation
        # Just make sure the methods we call are properly mocked

    async def setup(self):
        """Mock setup method."""
        self.initialized = True
        await self._register_handlers()
        return self.application

    async def run(self):
        """Mock run method."""
        if not self.initialized:
            await self.setup()

        # Start the application
        await self.application.start_polling()
        await self.application.run_polling()

        return True

    async def _register_handlers(self):
        """Mock register handlers method."""
        # Add handlers to the application
        for _i in range(5):  # Add 5 mock handlers
            self.application.add_handler(MagicMock())

        # Add error handler
        self.application.add_error_handler(self.error_handler)

        return True

    async def error_handler(self, update, context, error):
        """Mock error handler method."""
        # Log the error
        print(f"Error: {error}")

        return True
