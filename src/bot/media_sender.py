from typing import Any, Callable, List, Union, cast

from telegram import InputMediaPhoto, InputMediaVideo, Message

from src.utils.cache import get_cache, set_cache
from src.utils.media import get_storage_path


async def send_media_group_safe(send_function: Callable[..., Any], photos: List[str], **kwargs: Any) -> List[Message]:
    """
    Send a media group safely, using cached file_ids if available,
    and caching new file_ids after sending.

    Args:
        send_function: The function to call to send media (e.g. message.reply_media_group)
        photos: List of relative file paths to media
        **kwargs: Additional arguments for send_function

    Returns:
        List of sent messages
    """
    media_group: List[Union[InputMediaPhoto, InputMediaVideo]] = []
    opened_files = []
    media_files_map = {}
    storage_path = get_storage_path()

    try:
        for photo_path in photos:
            # Check cache first
            cache_key = f"media:file_id:{photo_path}"
            cached_file_id = get_cache(cache_key)

            full_path = storage_path / photo_path

            if cached_file_id:
                # Use cached file_id
                if full_path.suffix.lower() in [".jpg", ".jpeg", ".png"]:
                    media_group.append(InputMediaPhoto(media=cached_file_id))
                elif full_path.suffix.lower() in [".mp4", ".mov", ".avi"]:
                    media_group.append(InputMediaVideo(media=cached_file_id))
            elif full_path.exists():
                # Use file object
                f = open(full_path, "rb")
                opened_files.append(f)

                # Track which media item corresponds to which path for caching later
                media_files_map[len(media_group)] = photo_path

                if full_path.suffix.lower() in [".jpg", ".jpeg", ".png"]:
                    media_group.append(InputMediaPhoto(media=f))
                elif full_path.suffix.lower() in [".mp4", ".mov", ".avi"]:
                    media_group.append(InputMediaVideo(media=f))

        if media_group:
            sent_messages = cast(List[Message], await send_function(media=media_group, **kwargs))

            # Cache file_ids for uploaded files
            if sent_messages:
                for i, msg in enumerate(sent_messages):
                    if i in media_files_map:
                        photo_path = media_files_map[i]
                        file_id = None

                        # Extract file_id
                        if msg.photo:
                            file_id = msg.photo[-1].file_id
                        elif msg.video:
                            file_id = msg.video.file_id

                        if file_id:
                            cache_key = f"media:file_id:{photo_path}"
                            # Cache for 30 days (file_ids are persistent but good to refresh occasionally)
                            set_cache(cache_key, file_id, expiration=30 * 24 * 3600)

            return sent_messages

    finally:
        for f in opened_files:
            f.close()

    return []
