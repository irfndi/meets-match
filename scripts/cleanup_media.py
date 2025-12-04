"""Media cleanup script that removes soft-deleted media files after retention period."""

from datetime import datetime, timedelta
from pathlib import Path
from typing import List

from src.config import settings
from src.utils.database import execute_query
from src.utils.logging import get_logger

logger = get_logger(__name__)


def cleanup_soft_deleted_media() -> None:
    """Permanently delete media files that were soft-deleted over 1 year ago.

    This script queries the deleted_media table for records that are:
    - Not yet purged (is_purged = False)
    - Were soft-deleted more than 1 year ago (deleted_at < 1 year ago)

    For each record, it deletes the physical file and updates the record as purged.
    """
    storage_path = Path(settings.STORAGE_PATH)
    if not storage_path.is_absolute():
        storage_path = Path.cwd() / storage_path

    if not storage_path.exists():
        logger.warning(f"Storage path {storage_path} does not exist.")
        return

    # Calculate the date threshold (1 year ago)
    one_year_ago = datetime.now() - timedelta(days=365)

    logger.info(f"Starting media cleanup for files soft-deleted before {one_year_ago}...")

    # Query the deleted_media table for eligible records
    try:
        result = execute_query(
            table="deleted_media",
            query_type="select",
            filters={
                "is_purged": False,
                "deleted_at__lt": one_year_ago,
            },
        )
    except Exception as e:
        logger.error(f"Failed to query deleted_media table: {e}")
        return

    if not result.data:
        logger.info("No soft-deleted media eligible for permanent deletion.")
        return

    deleted_count = 0
    error_count = 0
    records: List = result.data

    for record in records:
        file_path_str = record.get("file_path")
        record_id = record.get("id")

        if not file_path_str or not record_id:
            continue

        file_path = Path(file_path_str)
        if not file_path.is_absolute():
            file_path = storage_path / file_path

        try:
            # Delete the physical file if it exists
            if file_path.exists():
                file_path.unlink()
                logger.debug(f"Deleted file: {file_path}")

            # Mark the record as purged
            execute_query(
                table="deleted_media",
                query_type="update",
                filters={"id": record_id},
                data={"is_purged": True},
            )
            deleted_count += 1
        except Exception as e:
            logger.error(f"Error deleting file {file_path}: {e}")
            error_count += 1

    logger.info(f"Cleanup complete. Deleted {deleted_count} files, {error_count} errors.")


if __name__ == "__main__":
    cleanup_soft_deleted_media()
