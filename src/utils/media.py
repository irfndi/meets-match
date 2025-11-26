import io
import uuid
from pathlib import Path

from PIL import Image

from src.config import get_settings

settings = get_settings()


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
            image = Image.open(io.BytesIO(file_content))
            # Convert to RGB if needed (e.g. for PNG with transparency)
            if image.mode in ("RGBA", "P"):
                image = image.convert("RGB")

            # Save with compression
            image.save(file_path, "JPEG", quality=85, optimize=True)
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


def delete_media(file_path: str) -> bool:
    """Delete media from local storage.

    Args:
        file_path: Relative path to the file.

    Returns:
        True if deleted or didn't exist, False on error.
    """
    try:
        full_path = get_storage_path() / file_path
        if full_path.exists():
            full_path.unlink()
        return True
    except Exception:
        return False
