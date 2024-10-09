import pytest
from unittest.mock import patch, AsyncMock
from bot.database.cron.cleanup import clean_up_unused_media

@pytest.mark.asyncio
async def test_clean_up_unused_media():
    with patch('bot.database.cron.cleanup.supabase_client') as mock_supabase_client:
        mock_supabase_client.table.return_value.select.return_value.execute = AsyncMock(return_value={
            'data': [{
                'id': 'user1',
                'media': [{'url': 'http://example.com/media1.jpg'}],
                'profile_completed': False
            }]
        })
        
        await clean_up_unused_media()
        mock_supabase_client.table.return_value.select.assert_called_once_with("id, media, profile_completed")