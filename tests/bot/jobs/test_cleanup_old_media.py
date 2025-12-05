"""Tests for cleanup old media job."""

from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from opentelemetry.trace import StatusCode

from src.bot.jobs import cleanup_old_media_job


@pytest.mark.asyncio
async def test_cleanup_old_media_job_no_storage_path():
    """Test cleanup job when storage path doesn't exist."""
    context = MagicMock()

    with patch("src.utils.media.get_storage_path") as mock_get_path:
        mock_path = MagicMock(spec=Path)
        mock_path.exists.return_value = False
        mock_get_path.return_value = mock_path

        # Should return early without error
        await cleanup_old_media_job(context)

        mock_path.exists.assert_called_once()


@pytest.mark.asyncio
async def test_cleanup_old_media_job_deletes_old_files():
    """Test cleanup job deletes files older than 1 year."""
    context = MagicMock()

    # Create mock storage path and files
    mock_storage_path = MagicMock(spec=Path)
    mock_storage_path.exists.return_value = True

    # Create a mock user directory
    mock_user_dir = MagicMock(spec=Path)
    mock_user_dir.is_dir.return_value = True

    # Create old file (> 1 year old)
    old_file = MagicMock(spec=Path)
    old_file.is_file.return_value = True
    old_mtime = (datetime.now(timezone.utc) - timedelta(days=400)).timestamp()
    old_file.stat.return_value.st_mtime = old_mtime

    # Create new file (< 1 year old)
    new_file = MagicMock(spec=Path)
    new_file.is_file.return_value = True
    new_mtime = (datetime.now(timezone.utc) - timedelta(days=100)).timestamp()
    new_file.stat.return_value.st_mtime = new_mtime

    mock_user_dir.iterdir.return_value = [old_file, new_file]
    mock_storage_path.iterdir.return_value = [mock_user_dir]

    with patch("src.utils.media.get_storage_path") as mock_get_path:
        mock_get_path.return_value = mock_storage_path

        await cleanup_old_media_job(context)

        # Verify old file was deleted
        old_file.unlink.assert_called_once()
        # Verify new file was NOT deleted
        new_file.unlink.assert_not_called()


@pytest.mark.asyncio
async def test_cleanup_old_media_job_skips_directories():
    """Test cleanup job skips directories when iterating files."""
    context = MagicMock()

    mock_storage_path = MagicMock(spec=Path)
    mock_storage_path.exists.return_value = True

    mock_user_dir = MagicMock(spec=Path)
    mock_user_dir.is_dir.return_value = True

    # Create a subdirectory within user dir (not a file)
    sub_dir = MagicMock(spec=Path)
    sub_dir.is_file.return_value = False

    mock_user_dir.iterdir.return_value = [sub_dir]
    mock_storage_path.iterdir.return_value = [mock_user_dir]

    with patch("src.utils.media.get_storage_path") as mock_get_path:
        mock_get_path.return_value = mock_storage_path

        await cleanup_old_media_job(context)

        # Verify no unlink was called on the subdirectory
        sub_dir.unlink.assert_not_called()


@pytest.mark.asyncio
async def test_cleanup_old_media_job_handles_file_delete_error():
    """Test cleanup job handles file deletion errors gracefully."""
    context = MagicMock()

    mock_storage_path = MagicMock(spec=Path)
    mock_storage_path.exists.return_value = True

    mock_user_dir = MagicMock(spec=Path)
    mock_user_dir.is_dir.return_value = True

    # Create old file that fails to delete
    old_file = MagicMock(spec=Path)
    old_file.is_file.return_value = True
    old_mtime = (datetime.now(timezone.utc) - timedelta(days=400)).timestamp()
    old_file.stat.return_value.st_mtime = old_mtime
    old_file.unlink.side_effect = PermissionError("Cannot delete file")

    mock_user_dir.iterdir.return_value = [old_file]
    mock_storage_path.iterdir.return_value = [mock_user_dir]

    with patch("src.utils.media.get_storage_path") as mock_get_path:
        mock_get_path.return_value = mock_storage_path

        # Should not raise an exception
        await cleanup_old_media_job(context)

        # Verify unlink was attempted
        old_file.unlink.assert_called_once()


@pytest.mark.asyncio
async def test_cleanup_old_media_job_captures_file_error_in_otel():
    """Test that cleanup_old_media_job captures file deletion errors in OpenTelemetry."""
    context = MagicMock()

    mock_storage_path = MagicMock(spec=Path)
    mock_storage_path.exists.return_value = True

    mock_user_dir = MagicMock(spec=Path)
    mock_user_dir.is_dir.return_value = True

    # Create old file that fails to delete
    old_file = MagicMock(spec=Path)
    old_file.is_file.return_value = True
    old_mtime = (datetime.now(timezone.utc) - timedelta(days=400)).timestamp()
    old_file.stat.return_value.st_mtime = old_mtime
    file_error = PermissionError("Cannot delete file")
    old_file.unlink.side_effect = file_error

    mock_user_dir.iterdir.return_value = [old_file]
    mock_storage_path.iterdir.return_value = [mock_user_dir]

    with (
        patch("src.utils.media.get_storage_path") as mock_get_path,
        patch("src.bot.jobs.tracer") as mock_tracer,
    ):
        mock_get_path.return_value = mock_storage_path

        mock_parent_span = MagicMock()
        mock_child_span = MagicMock()
        # First call returns parent span, second call returns child span for file deletion
        mock_tracer.start_as_current_span.return_value.__enter__.side_effect = [mock_parent_span, mock_child_span]

        await cleanup_old_media_job(context)

        # Verify OpenTelemetry recorded the exception on child span
        mock_child_span.record_exception.assert_called_once_with(file_error)
        # Verify set_status was called with ERROR status
        mock_child_span.set_status.assert_called_once()
        status_arg = mock_child_span.set_status.call_args[0][0]
        assert status_arg.status_code == StatusCode.ERROR


@pytest.mark.asyncio
async def test_cleanup_old_media_job_captures_general_error_in_otel():
    """Test that cleanup_old_media_job captures general errors in OpenTelemetry."""
    context = MagicMock()

    general_error = Exception("Storage path error")

    with (
        patch("src.utils.media.get_storage_path") as mock_get_path,
        patch("src.bot.jobs.tracer") as mock_tracer,
    ):
        mock_get_path.side_effect = general_error

        mock_span = MagicMock()
        mock_tracer.start_as_current_span.return_value.__enter__.return_value = mock_span

        await cleanup_old_media_job(context)

        # Verify OpenTelemetry recorded the exception
        mock_span.record_exception.assert_called_once_with(general_error)
