import io
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional

from PIL import Image

from src.config import get_settings
from src.utils.logging import get_logger

settings = get_settings()
logger = get_logger(__name__)

# Retention period in days - files are kept for 365 days before permanent deletion
RETENTION_DAYS = 365


def get_storage_path() -> Path:
    """Get the absolute path to the storage directory."""
    path = Path(settings.STORAGE_PATH)
    if not path.is_absolute():
        path = Path.cwd() / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_media(file_content: bytes, user_id: str, file_ext: str = "jpg") -> str:
    """Save media to local storage and return the relative path.

    Args:
        file_content: The binary content of the file.
        user_id: The ID of the user uploading the file.
        file_ext: The file extension.

    Returns:
        The relative path to the saved file.
    """
    storage_path = get_storage_path()
    user_dir = storage_path / user_id
    user_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{uuid.uuid4()}.{file_ext}"
    file_path = user_dir / filename

    # Compress image if it's an image
    if file_ext.lower() in ["jpg", "jpeg", "png"]:
        try:
            image: Image.Image = Image.open(io.BytesIO(file_content))
            # Convert to RGB if needed (e.g. for PNG with transparency)
            if image.mode in ("RGBA", "P"):
                image = image.convert("RGB")

            # Save with compression
            image.save(file_path, "JPEG", quality=70, optimize=True)
            # If we converted/saved as JPEG, ensure extension matches
            if file_ext.lower() != "jpg":
                file_path = file_path.with_suffix(".jpg")
                filename = file_path.name
        except Exception:
            # Fallback to simple write if compression fails
            with open(file_path, "wb") as f:
                f.write(file_content)
    else:
        # Just write for non-images
        with open(file_path, "wb") as f:
            f.write(file_content)

    return f"{user_id}/{filename}"


def delete_media(file_path: str, user_id: Optional[str] = None, reason: str = "replaced") -> bool:
    """Soft delete media - records deletion in database and removes file from storage.

    The deletion record is kept for 365 days to allow recovery/auditing.

    Args:
        file_path: Relative path to the file.
        user_id: The ID of the user who owned the file. If not provided, extracted from path.
        reason: Reason for deletion (e.g., 'replaced', 'user_deleted', 'profile_edit').

    Returns:
        True if deleted successfully, False on error.
    """
    try:
        # Extract user_id from path if not provided
        if user_id is None:
            # Path format is "user_id/filename"
            parts = file_path.split("/")
            if len(parts) >= 1:
                user_id = parts[0]

        # Record the deletion in the database for 365-day retention
        if user_id:
            _record_deleted_media(user_id, file_path, reason)

        # Delete the actual file
        full_path = get_storage_path() / file_path
        if full_path.exists():
            full_path.unlink()
            logger.info("Media file deleted", file_path=file_path, user_id=user_id, reason=reason)
        return True
    except Exception as e:
        logger.error("Error deleting media", file_path=file_path, error=str(e))
        return False


def _record_deleted_media(user_id: str, file_path: str, reason: str) -> None:
    """Record a deleted media file in the database.

    Args:
        user_id: The ID of the user who owned the file.
        file_path: Relative path to the file.
        reason: Reason for deletion.
    """
    try:
        from src.utils.database import execute_query

        record_id = str(uuid.uuid4())
        execute_query(
            table="deleted_media",
            query_type="insert",
            data={
                "id": record_id,
                "user_id": user_id,
                "file_path": file_path,
                "reason": reason,
                "is_purged": False,
            },
        )
        logger.debug("Recorded deleted media", user_id=user_id, file_path=file_path, reason=reason)
    except Exception as e:
        # Log but don't fail the deletion - the tracking is for auditing, not critical
        logger.warning("Failed to record deleted media", user_id=user_id, file_path=file_path, error=str(e))


def get_deleted_media_by_user(user_id: str, include_purged: bool = False) -> List[dict]:
    """Get list of deleted media files for a user.

    Args:
        user_id: The ID of the user.
        include_purged: Whether to include permanently purged files in the result.

    Returns:
        List of deleted media records with file_path, deleted_at, and reason.
    """
    try:
        from src.utils.database import execute_query

        filters: dict = {"user_id": user_id}
        if not include_purged:
            filters["is_purged"] = False

        result = execute_query(
            table="deleted_media",
            query_type="select",
            filters=filters,
            order_by="deleted_at desc",
        )
        return result.data if result.data else []
    except Exception as e:
        logger.error("Error fetching deleted media", user_id=user_id, error=str(e))
        return []


def get_recoverable_media(user_id: str) -> List[dict]:
    """Get list of media files that can still be recovered (within 365-day window).

    Args:
        user_id: The ID of the user.

    Returns:
        List of recoverable media records.
    """
    try:
        from src.utils.database import execute_query

        cutoff_date = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=RETENTION_DAYS)

        result = execute_query(
            table="deleted_media",
            query_type="select",
            filters={
                "user_id": user_id,
                "is_purged": False,
                "deleted_at__gte": cutoff_date,
            },
            order_by="deleted_at desc",
        )
        return result.data if result.data else []
    except Exception as e:
        logger.error("Error fetching recoverable media", user_id=user_id, error=str(e))
        return []


def purge_expired_media_records() -> int:
    """Permanently mark media records older than 365 days as purged.

    This function is meant to be called periodically (e.g., by a scheduled job)
    to clean up old deletion records after the retention period.

    Returns:
        Number of records purged.
    """
    try:
        from src.utils.database import execute_query

        cutoff_date = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=RETENTION_DAYS)

        # Get count of records to be purged first
        result = execute_query(
            table="deleted_media",
            query_type="select",
            filters={
                "is_purged": False,
                "deleted_at__lt": cutoff_date,
            },
        )

        if not result.data:
            return 0

        purged_count = len(result.data)

        # Bulk update all matching records
        try:
            execute_query(
                table="deleted_media",
                query_type="update",
                filters={
                    "is_purged": False,
                    "deleted_at__lt": cutoff_date,
                },
                data={"is_purged": True},
            )
            logger.info("Purged expired media records", count=purged_count)
            return purged_count
        except Exception as e:
            logger.warning("Failed to bulk purge records", error=str(e))
            return 0
    except Exception as e:
        logger.error("Error purging expired media records", error=str(e))
        return 0
