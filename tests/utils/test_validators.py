from unittest.mock import MagicMock, patch

import pytest

from src.utils.validators import MediaValidator


@pytest.fixture
def validator():
    return MediaValidator()


@pytest.mark.asyncio
async def test_get_mime_type(validator):
    assert validator.get_mime_type("test.jpg") == "image/jpeg"
    assert validator.get_mime_type("test.png") == "image/png"
    assert validator.get_mime_type("test.txt") == "text/plain"
    assert validator.get_mime_type("unknown") is None


@pytest.mark.asyncio
async def test_validate_file_type_extension_only(validator):
    """Test file type validation with valid extension and matching content."""
    with patch("src.utils.validators.magic") as mock_magic:
        mock_magic.from_buffer.return_value = "image/jpeg"

        is_valid, file_type = await validator.validate_file_type(b"fake_jpeg_data", "test.jpg")

        assert is_valid is True
        assert file_type == "image"
        mock_magic.from_buffer.assert_called_once()


@pytest.mark.asyncio
async def test_validate_file_type_unsupported_extension(validator):
    # Test with unknown extension
    is_valid, message = await validator.validate_file_type(b"", "test.unknown_ext")
    assert is_valid is False
    assert "Unsupported file type (extension unknown)" in message


@pytest.mark.asyncio
async def test_validate_file_type_content_mismatch(validator):
    # Test with valid extension but invalid content
    is_valid, message = await validator.validate_file_type(b"", "test.txt")
    assert is_valid is False
    assert "does not match extension" in message


# To properly test validate_file_type and validate_image, we need valid image bytes
# or mock the magic/PIL libraries.


@pytest.mark.asyncio
async def test_validate_file_type_magic_match(validator):
    with patch("src.utils.validators.magic") as mock_magic:
        mock_magic.from_buffer.return_value = "image/jpeg"

        is_valid, file_type = await validator.validate_file_type(b"fake_jpeg_data", "test.jpg")

        assert is_valid is True
        assert file_type == "image"


@pytest.mark.asyncio
async def test_validate_file_type_magic_mismatch_but_allowed(validator):
    # Extension says jpg, content says png. Both allowed.
    with patch("src.utils.validators.magic") as mock_magic:
        mock_magic.from_buffer.return_value = "image/png"

        is_valid, file_type = await validator.validate_file_type(b"fake_png_data", "test.jpg")

        # The code allows it if actual type is allowed
        assert is_valid is True
        assert file_type == "image"


@pytest.mark.asyncio
async def test_validate_file_type_magic_mismatch_not_allowed(validator):
    # Extension says jpg, content says text/plain.
    with patch("src.utils.validators.magic") as mock_magic:
        mock_magic.from_buffer.return_value = "text/plain"

        is_valid, message = await validator.validate_file_type(b"fake_text_data", "test.jpg")

        assert is_valid is False
        assert "does not match extension" in message


@pytest.mark.asyncio
async def test_validate_image_valid(validator):
    with patch("src.utils.validators.Image") as mock_image:
        mock_img_instance = MagicMock()
        mock_img_instance.size = (500, 500)
        mock_image.open.return_value = mock_img_instance

        is_valid, _ = await validator.validate_image(b"fake_image_data")
        assert is_valid is True


@pytest.mark.asyncio
async def test_validate_image_too_small(validator):
    with patch("src.utils.validators.Image") as mock_image:
        mock_img_instance = MagicMock()
        mock_img_instance.size = (100, 100)  # Min is 200x200
        mock_image.open.return_value = mock_img_instance

        is_valid, message = await validator.validate_image(b"fake_image_data")
        assert is_valid is False
        assert "Image too small" in message


@pytest.mark.asyncio
async def test_validate_image_too_large(validator):
    with patch("src.utils.validators.Image") as mock_image:
        mock_img_instance = MagicMock()
        mock_img_instance.size = (5000, 5000)  # Max is 4096
        mock_image.open.return_value = mock_img_instance

        is_valid, message = await validator.validate_image(b"fake_image_data")
        assert is_valid is False
        assert "Image too large" in message
