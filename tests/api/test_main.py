from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI

from src.api import main
from src.utils.errors import DatabaseError


@pytest.mark.asyncio
async def test_lifespan_logs_database_error_details():
    app = FastAPI()
    db_error = DatabaseError("db init failed", details={"url": "postgresql://user:***@localhost:5432/db"})

    with (
        patch.object(main, "init_database", side_effect=db_error),
        patch.object(main, "logger") as mock_logger,
        patch.object(main, "bot_app") as mock_bot_app,
    ):
        mock_bot_app.start = AsyncMock()
        mock_bot_app.stop = AsyncMock()

        with pytest.raises(DatabaseError):
            async with main.lifespan(app):
                pass

    mock_logger.error.assert_called_once()
    args, kwargs = mock_logger.error.call_args
    assert args[0] == "Failed to initialize database"
    assert kwargs["error"] == str(db_error)
    assert kwargs["details"] == db_error.details
