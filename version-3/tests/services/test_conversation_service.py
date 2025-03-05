import pytest

from tests.test_helpers import create_convo_with_messages


@pytest.mark.asyncio
async def test_message_ordering(mock_application):
    from tests.mocks.services import get_messages

    convo = await create_convo_with_messages(5)
    messages = await get_messages(convo.id)

    timestamps = [m.created_at for m in messages]
    assert timestamps == sorted(timestamps)
