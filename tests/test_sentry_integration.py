import importlib
import sys
from unittest.mock import patch

import pytest

# We need to make sure we are patching the right thing
# Since conftest.py mocks src.config, we need to handle that context


def test_sentry_initialization():
    """Test that Sentry is initialized with correct integrations."""

    # We need to patch sentry_sdk before importing/reloading src.api.main
    with (
        patch("sentry_sdk.init") as mock_init,
        patch("sentry_sdk.integrations.sqlalchemy.SqlalchemyIntegration") as MockSqlAlchemy,
        patch("sentry_sdk.integrations.redis.RedisIntegration") as MockRedis,
        patch("sentry_sdk.integrations.asyncio.AsyncioIntegration") as MockAsyncio,
        patch("sentry_sdk.integrations.fastapi.FastApiIntegration") as MockFastApi,
    ):
        # We need to patch the settings object that src.api.main will use
        # Since src.api.main does 'from src.config import settings'
        # We should patch 'src.config.settings'

        with patch("src.config.settings") as mock_settings:
            mock_settings.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0"
            mock_settings.ENVIRONMENT = "test"

            # We need to ensure src.api.main is imported/reloaded
            # If it's already in sys.modules, reload it
            if "src.api.main" in sys.modules:
                import src.api.main

                importlib.reload(src.api.main)
            else:
                import src.api.main

            # Verify init was called
            assert mock_init.called

            # Get call args
            call_args = mock_init.call_args[1]
            assert call_args["dsn"] == "https://examplePublicKey@o0.ingest.sentry.io/0"
            assert call_args["environment"] == "test"

            # Verify integrations were passed
            # Since we mocked the classes, the list will contain instances of the mocks
            integrations = call_args["integrations"]
            assert len(integrations) == 4

            # Check if instances of our mocks are in the list
            # When we call MockSqlAlchemy(), it returns a mock instance (MockSqlAlchemy.return_value)
            # So the list should contain these return values
            assert MockFastApi.return_value in integrations
            assert MockSqlAlchemy.return_value in integrations
            assert MockRedis.return_value in integrations
            assert MockAsyncio.return_value in integrations

            # FastAPI integration should be configured to use URL-based transactions
            MockFastApi.assert_called_once_with(transaction_style="url")
    sys.modules.pop("src.api.main", None)


def test_sentry_not_initialized_without_dsn():
    """Ensure Sentry is skipped when DSN is not provided."""

    # Ensure clean import
    sys.modules.pop("src.api.main", None)

    with patch("sentry_sdk.init") as mock_init, patch("src.config.settings") as mock_settings:
        mock_settings.SENTRY_DSN = None
        mock_settings.ENVIRONMENT = "test"
        mock_settings.APP_NAME = "Test App"

        importlib.import_module("src.api.main")

        mock_init.assert_not_called()
    sys.modules.pop("src.api.main", None)


@pytest.mark.parametrize(
    ("environment", "expected_rate"),
    [("development", 1.0), ("production", 0.1)],
)
def test_sentry_sample_rates(environment, expected_rate):
    """Verify traces/profile sample rates respect environment defaults."""

    # Ensure clean import
    sys.modules.pop("src.api.main", None)

    with (
        patch("sentry_sdk.init") as mock_init,
        patch("sentry_sdk.integrations.sqlalchemy.SqlalchemyIntegration") as MockSqlAlchemy,
        patch("sentry_sdk.integrations.redis.RedisIntegration") as MockRedis,
        patch("sentry_sdk.integrations.asyncio.AsyncioIntegration") as MockAsyncio,
        patch("sentry_sdk.integrations.fastapi.FastApiIntegration") as MockFastApi,
        patch("src.config.settings") as mock_settings,
    ):
        mock_settings.SENTRY_DSN = "https://examplePublicKey@o0.ingest.sentry.io/0"
        mock_settings.ENVIRONMENT = environment
        mock_settings.APP_NAME = "Test App"

        importlib.import_module("src.api.main")

        assert mock_init.called
        call_args = mock_init.call_args.kwargs
        assert call_args["traces_sample_rate"] == expected_rate
        assert call_args["profiles_sample_rate"] == expected_rate

        # Ensure integrations still included
        integrations = call_args["integrations"]
        assert MockFastApi.return_value in integrations
        assert MockSqlAlchemy.return_value in integrations
        assert MockRedis.return_value in integrations
        assert MockAsyncio.return_value in integrations
    sys.modules.pop("src.api.main", None)
