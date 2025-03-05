from tests.mocks.models import Conversation, Message


async def create_convo_with_messages(num_messages: int):
    convo = Conversation()
    for i in range(num_messages):
        await Message.create(conversation_id=convo.id, content=f"Message {i}", sender_id=f"user{i%2}")
    return convo
