"""Tests for the media utility module with soft delete functionality."""

import importlib
import sys
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def restore_real_modules():
    """Ensure we are testing the real modules, not the mocks from conftest."""
    modules_to_restore = [
        "src.utils.media",
        "src.utils.database",
        "src.utils.logging",
        "src.config",
    ]

    saved_modules = {}
    for mod_name in modules_to_restore:
        saved_modules[mod_name] = sys.modules.get(mod_name)
        if mod_name in sys.modules:
            del sys.modules[mod_name]

    try:
        import src.config

        importlib.reload(src.config)

        import src.utils.logging

        importlib.reload(src.utils.logging)

        import src.utils.database

        importlib.reload(src.utils.database)

        import src.utils.media

        importlib.reload(src.utils.media)
    except ImportError:
        # Ignore ImportError during test setup; some modules may not be present in all test environments.
        pass

    yield

    for mod_name, saved_mod in saved_modules.items():
        if saved_mod:
            sys.modules[mod_name] = saved_mod
        else:
            if mod_name in sys.modules:
                del sys.modules[mod_name]


@pytest.fixture
def media_module(restore_real_modules):
    import src.utils.media

    return src.utils.media


@pytest.fixture
def temp_storage_path(tmp_path):
    """Create a temporary storage path for testing."""
    return tmp_path / "media"


@pytest.fixture
def mock_settings(temp_storage_path):
    """Mock settings with temporary storage path."""
    mock = MagicMock()
    mock.STORAGE_PATH = str(temp_storage_path)
    return mock


class TestSaveMedia:
    """Tests for save_media function."""

    def test_save_media_creates_user_directory(self, media_module, mock_settings, temp_storage_path):
        """Test that save_media creates user directory if it doesn't exist."""
        with patch.object(media_module, "settings", mock_settings):
            temp_storage_path.mkdir(parents=True, exist_ok=True)
            content = b"test image content"
            user_id = "test_user_123"

            # Mock PIL Image to avoid actual image processing
            with patch("src.utils.media.Image") as mock_image:
                mock_image.open.side_effect = Exception("Not a valid image")
                result = media_module.save_media(content, user_id, "bin")

            assert result.startswith(f"{user_id}/")
            user_dir = temp_storage_path / user_id
            assert user_dir.exists()

    def test_save_media_returns_relative_path(self, media_module, mock_settings, temp_storage_path):
        """Test that save_media returns the correct relative path format."""
        with patch.object(media_module, "settings", mock_settings):
            temp_storage_path.mkdir(parents=True, exist_ok=True)
            content = b"test content"
            user_id = "user_456"

            with patch("src.utils.media.Image") as mock_image:
                mock_image.open.side_effect = Exception("Not a valid image")
                result = media_module.save_media(content, user_id, "mp4")

            assert "/" in result
            parts = result.split("/")
            assert parts[0] == user_id
            assert parts[1].endswith(".mp4")


class TestDeleteMedia:
    """Tests for delete_media function with soft delete tracking."""

    def test_delete_media_removes_file(self, media_module, mock_settings, temp_storage_path):
        """Test that delete_media removes the file from storage."""
        with patch.object(media_module, "settings", mock_settings):
            temp_storage_path.mkdir(parents=True, exist_ok=True)
            user_dir = temp_storage_path / "user_123"
            user_dir.mkdir(parents=True, exist_ok=True)
            test_file = user_dir / "test.jpg"
            test_file.write_bytes(b"test content")

            with patch.object(media_module, "_record_deleted_media") as mock_record:
                result = media_module.delete_media("user_123/test.jpg", user_id="user_123")

            assert result is True
            assert not test_file.exists()
            mock_record.assert_called_once_with("user_123", "user_123/test.jpg", "replaced")

    def test_delete_media_records_deletion(self, media_module, mock_settings, temp_storage_path):
        """Test that delete_media records the deletion in the database."""
        with patch.object(media_module, "settings", mock_settings):
            temp_storage_path.mkdir(parents=True, exist_ok=True)
            user_dir = temp_storage_path / "user_789"
            user_dir.mkdir(parents=True, exist_ok=True)
            test_file = user_dir / "photo.jpg"
            test_file.write_bytes(b"photo content")

            with patch.object(media_module, "_record_deleted_media") as mock_record:
                result = media_module.delete_media("user_789/photo.jpg", user_id="user_789", reason="user_deleted")

            assert result is True
            mock_record.assert_called_once_with("user_789", "user_789/photo.jpg", "user_deleted")

    def test_delete_media_extracts_user_id_from_path(self, media_module, mock_settings, temp_storage_path):
        """Test that delete_media can extract user_id from file path if not provided."""
        with patch.object(media_module, "settings", mock_settings):
            temp_storage_path.mkdir(parents=True, exist_ok=True)
            user_dir = temp_storage_path / "user_auto"
            user_dir.mkdir(parents=True, exist_ok=True)
            test_file = user_dir / "auto.jpg"
            test_file.write_bytes(b"auto content")

            with patch.object(media_module, "_record_deleted_media") as mock_record:
                result = media_module.delete_media("user_auto/auto.jpg")

            assert result is True
            mock_record.assert_called_once_with("user_auto", "user_auto/auto.jpg", "replaced")

    def test_delete_media_handles_nonexistent_file(self, media_module, mock_settings, temp_storage_path):
        """Test that delete_media handles non-existent files gracefully."""
        with patch.object(media_module, "settings", mock_settings):
            temp_storage_path.mkdir(parents=True, exist_ok=True)

            with patch.object(media_module, "_record_deleted_media") as mock_record:
                result = media_module.delete_media("user_none/nonexistent.jpg", user_id="user_none")

            assert result is True
            mock_record.assert_called_once()


class TestRecordDeletedMedia:
    """Tests for _record_deleted_media function."""

    def test_record_deleted_media_inserts_record(self, media_module):
        """Test that _record_deleted_media creates a database record."""
        with patch("src.utils.database.execute_query") as mock_query:
            mock_result = MagicMock()
            mock_result.data = [{"id": "test-id"}]
            mock_query.return_value = mock_result

            media_module._record_deleted_media("user_123", "user_123/photo.jpg", "replaced")

            mock_query.assert_called_once()
            call_args = mock_query.call_args
            assert call_args.kwargs["table"] == "deleted_media"
            assert call_args.kwargs["query_type"] == "insert"
            assert call_args.kwargs["data"]["user_id"] == "user_123"
            assert call_args.kwargs["data"]["file_path"] == "user_123/photo.jpg"
            assert call_args.kwargs["data"]["reason"] == "replaced"
            assert call_args.kwargs["data"]["is_purged"] is False

    def test_record_deleted_media_handles_error_gracefully(self, media_module):
        """Test that _record_deleted_media doesn't raise on database error."""
        with patch("src.utils.database.execute_query") as mock_query:
            mock_query.side_effect = Exception("Database error")

            # Should not raise
            media_module._record_deleted_media("user_123", "user_123/photo.jpg", "replaced")


class TestGetDeletedMediaByUser:
    """Tests for get_deleted_media_by_user function."""

    def test_get_deleted_media_returns_records(self, media_module):
        """Test that get_deleted_media_by_user returns user's deleted media."""
        with patch("src.utils.database.execute_query") as mock_query:
            mock_result = MagicMock()
            mock_result.data = [
                {"id": "1", "user_id": "user_123", "file_path": "user_123/photo1.jpg", "deleted_at": datetime.now()},
                {"id": "2", "user_id": "user_123", "file_path": "user_123/photo2.jpg", "deleted_at": datetime.now()},
            ]
            mock_query.return_value = mock_result

            result = media_module.get_deleted_media_by_user("user_123")

            assert len(result) == 2
            mock_query.assert_called_once()
            call_args = mock_query.call_args
            assert call_args.kwargs["filters"]["user_id"] == "user_123"
            assert call_args.kwargs["filters"]["is_purged"] is False

    def test_get_deleted_media_with_purged(self, media_module):
        """Test that get_deleted_media_by_user can include purged records."""
        with patch("src.utils.database.execute_query") as mock_query:
            mock_result = MagicMock()
            mock_result.data = [
                {"id": "1", "user_id": "user_123", "file_path": "user_123/old.jpg", "is_purged": True},
            ]
            mock_query.return_value = mock_result

            result = media_module.get_deleted_media_by_user("user_123", include_purged=True)

            assert len(result) == 1
            call_args = mock_query.call_args
            assert "is_purged" not in call_args.kwargs["filters"]

    def test_get_deleted_media_empty_result(self, media_module):
        """Test that get_deleted_media_by_user returns empty list when no records."""
        with patch("src.utils.database.execute_query") as mock_query:
            mock_result = MagicMock()
            mock_result.data = []
            mock_query.return_value = mock_result

            result = media_module.get_deleted_media_by_user("user_no_media")

            assert result == []


class TestGetRecoverableMedia:
    """Tests for get_recoverable_media function."""

    def test_get_recoverable_media_filters_by_date(self, media_module):
        """Test that get_recoverable_media only returns files within 365-day window."""
        with patch("src.utils.database.execute_query") as mock_query:
            mock_result = MagicMock()
            mock_result.data = [
                {"id": "1", "user_id": "user_123", "file_path": "user_123/recent.jpg"},
            ]
            mock_query.return_value = mock_result

            result = media_module.get_recoverable_media("user_123")

            assert len(result) == 1
            call_args = mock_query.call_args
            assert call_args.kwargs["filters"]["user_id"] == "user_123"
            assert call_args.kwargs["filters"]["is_purged"] is False
            assert "deleted_at__gte" in call_args.kwargs["filters"]


class TestPurgeExpiredMediaRecords:
    """Tests for purge_expired_media_records function."""

    def test_purge_marks_old_records(self, media_module):
        """Test that purge_expired_media_records marks old records as purged."""
        with patch("src.utils.database.execute_query") as mock_query:
            # First call returns records to purge
            mock_select_result = MagicMock()
            mock_select_result.data = [
                {"id": "old-1", "user_id": "user_123", "file_path": "user_123/old1.jpg"},
                {"id": "old-2", "user_id": "user_456", "file_path": "user_456/old2.jpg"},
            ]
            # Update calls return empty
            mock_update_result = MagicMock()
            mock_update_result.data = [{}]

            mock_query.side_effect = [mock_select_result, mock_update_result, mock_update_result]

            result = media_module.purge_expired_media_records()

            assert result == 2

    def test_purge_no_records_to_purge(self, media_module):
        """Test that purge_expired_media_records handles no records case."""
        with patch("src.utils.database.execute_query") as mock_query:
            mock_result = MagicMock()
            mock_result.data = []
            mock_query.return_value = mock_result

            result = media_module.purge_expired_media_records()

            assert result == 0


class TestRetentionDays:
    """Tests for retention period constant."""

    def test_retention_days_is_365(self, media_module):
        """Test that RETENTION_DAYS is set to 365."""
        assert media_module.RETENTION_DAYS == 365
