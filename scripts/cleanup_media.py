import os
import time
from pathlib import Path

from src.config import settings


def cleanup_old_media():
    """Delete media files older than 1 year."""
    storage_path = Path(settings.STORAGE_PATH)
    if not storage_path.is_absolute():
        storage_path = Path.cwd() / storage_path

    if not storage_path.exists():
        print(f"Storage path {storage_path} does not exist.")
        return

    # 1 year in seconds = 365 * 24 * 60 * 60
    one_year_ago = time.time() - (365 * 24 * 60 * 60)

    print(f"Starting media cleanup at {storage_path}...")
    deleted_count = 0

    for root, _dirs, files in os.walk(storage_path):
        for file in files:
            file_path = Path(root) / file
            try:
                # Check modification time
                if file_path.stat().st_mtime < one_year_ago:
                    file_path.unlink()
                    deleted_count += 1
                    print(f"Deleted old file: {file_path}")
            except Exception as e:
                print(f"Error checking/deleting file {file_path}: {e}")

    print(f"Cleanup complete. Deleted {deleted_count} files.")


if __name__ == "__main__":
    cleanup_old_media()
