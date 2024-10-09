import pytest
from unittest.mock import AsyncMock, patch
from bot.main import main  # Import the main function to start the bot

@pytest.mark.asyncio
async def test_e2e_profile_creation(monkeypatch):
    # Mock the Application class
    mock_application = AsyncMock()
    monkeypatch.setattr('telegram.ext.Application.builder', lambda: mock_application)
    monkeypatch.setattr(mock_application, 'token', lambda x: mock_application)
    monkeypatch.setattr(mock_application, 'build', AsyncMock(return_value=mock_application))
    
    # Call the main function
    await main()
    mock_application.start.assert_called_once()
    mock_application.run_polling.assert_called_once()

# Add more E2E tests for different flows