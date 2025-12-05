import importlib
import sys
from typing import Any, cast
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def test_api_error_triggers_sentry_capture():
    """Raising endpoint should be captured by Sentry middleware."""

    mock_config = importlib.import_module("tests.mocks.config")
    original_src_config = sys.modules.get("src.config")
    sys.modules["src.config"] = mock_config
    settings = cast(Any, mock_config.settings)

    original_dsn = getattr(settings, "SENTRY_DSN", None)
    original_env = getattr(settings, "ENVIRONMENT", None)
    original_app_name = getattr(settings, "APP_NAME", None)
    settings.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0"
    settings.ENVIRONMENT = "test"
    settings.APP_NAME = "Test App"

    # Fresh import so Sentry init sees updated settings
    sys.modules.pop("src.api.main", None)
    import src.api.main as main

    # Add a failing route for the test
    @main.app.get("/boom")
    async def boom():
        raise RuntimeError("boom")

    # Prevent real startup side effects
    main.init_database = lambda: None  # type: ignore[assignment]
    main.bot_app.start = AsyncMock()  # type: ignore[assignment]
    main.bot_app.stop = AsyncMock()  # type: ignore[assignment]

    with (
        patch("sentry_sdk.capture_event") as mock_capture_event,
        TestClient(main.app, raise_server_exceptions=False) as client,
    ):
        response = client.get("/boom")

    assert response.status_code == 500
    # Sentry middleware should capture the raised exception
    assert mock_capture_event.called

    # Restore mutated settings/module state
    settings.SENTRY_DSN = original_dsn
    if original_env is not None:
        settings.ENVIRONMENT = cast(str, original_env)
    if original_app_name is not None:
        settings.APP_NAME = cast(str, original_app_name)
    if original_src_config is not None:
        sys.modules["src.config"] = original_src_config
    else:
        sys.modules.pop("src.config", None)
    sys.modules.pop("src.api.main", None)
