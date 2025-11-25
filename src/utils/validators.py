# Migrated MediaValidator from src/meetsmatch/validators.py

import io
import mimetypes
from functools import lru_cache
from typing import Tuple

import magic
from PIL import Image


class MediaValidator:
    def __init__(self):
        # TODO: Consider making these configurable via src/config.py
        self.max_image_size_bytes = 5 * 1024 * 1024  # 5MB
        self.max_video_size_bytes = 20 * 1024 * 1024  # 20MB
        self.allowed_image_types = {"image/jpeg", "image/png", "image/webp", "image/gif"}
        self.allowed_video_types = {"video/mp4", "video/quicktime", "video/webm"}
        self.min_image_dimensions = (200, 200)
        self.max_image_dimensions = (4096, 4096)

    @lru_cache(maxsize=1000)
    def get_mime_type(self, file_name: str) -> str | None:
        """Get MIME type from file name."""
        return mimetypes.guess_type(file_name)[0]

    async def validate_file_type(self, file_data: bytes, file_name: str) -> Tuple[bool, str]:
        """
        Validate file type using both extension and content analysis.

        Args:
            file_data: Raw file data
            file_name: Original file name

        Returns:
            Tuple[bool, str]: (is_valid, type_or_error_message)
                If valid, the second element is 'image' or 'video'.
                If invalid, the second element is an error message.
        """
        # Check by extension
        mime_type = self.get_mime_type(file_name)
        if not mime_type:
            return False, "Unsupported file type (extension unknown)"

        # Check by content
        try:
            actual_type = magic.from_buffer(file_data, mime=True)
            # Allow some flexibility (e.g., jpeg vs jpg)
            if not actual_type.startswith(mime_type.split('/')[0]):
                 print(f"Warning: MIME type mismatch. Extension: {mime_type}, Content: {actual_type}")
                 # Decide if you want to trust content over extension
                 # For now, we'll trust the content if it's an allowed type
                 if actual_type not in self.allowed_image_types and actual_type not in self.allowed_video_types:
                    return False, f"File content type ({actual_type}) does not match extension ({mime_type}) and is not allowed."
                 mime_type = actual_type # Trust content type if allowed

        except Exception as e:
            # If magic library fails, rely on extension but log error
            print(f"Error validating file type with libmagic: {e!s}. Relying on extension.")

        # Validate against allowed types
        if mime_type in self.allowed_image_types:
            return True, "image"
        elif mime_type in self.allowed_video_types:
            return True, "video"
        else:
            return False, f"Unsupported file type: {mime_type}"

    async def validate_image(self, image_data: bytes) -> Tuple[bool, str]:
        """
        Validate image dimensions and format.

        Args:
            image_data: Raw image data

        Returns:
            Tuple[bool, str]: (is_valid, error_message)
        """
        try:
            img = Image.open(io.BytesIO(image_data))
            # Verify the image format actually loads correctly
            img.verify()
            # Reopen after verify
            img = Image.open(io.BytesIO(image_data))
            width, height = img.size

            # Check dimensions
            if width < self.min_image_dimensions[0] or height < self.min_image_dimensions[1]:
                return (
                    False,
                    f"Image too small. Minimum dimensions: {self.min_image_dimensions}",
                )

            if width > self.max_image_dimensions[0] or height > self.max_image_dimensions[1]:
                return (
                    False,
                    f"Image too large. Maximum dimensions: {self.max_image_dimensions}",
                )

            return True, "Valid image"

        except Exception as e:
            return False, f"Error validating image: {e!s}"

    async def validate_file_size(self, file_size: int, file_type: str) -> Tuple[bool, str]:
        """
        Validate file size based on type.

        Args:
            file_size: Size in bytes
            file_type: 'image' or 'video'

        Returns:
            Tuple[bool, str]: (is_valid, error_message)
        """
        if file_type == "image" and file_size > self.max_image_size_bytes:
            return False, (
                f"Image too large. Maximum size: {self.max_image_size_bytes // 1024 // 1024}MB"
            )

        if file_type == "video" and file_size > self.max_video_size_bytes:
            return False, (
                f"Video too large. Maximum size: {self.max_video_size_bytes // 1024 // 1024}MB"
            )

        return True, "Valid size"


# Global instance - TODO: Consider dependency injection
media_validator = MediaValidator()
