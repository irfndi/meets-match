import pytest
from unittest.mock import AsyncMock, MagicMock
from bot.handlers.profile_update import start_profile_creation, handle_profile_input

@pytest.mark.asyncio
async def test_start_profile_creation():
    update = AsyncMock()
    context = MagicMock()
    context.user_data = {}

    await start_profile_creation(update, context)

    assert context.user_data['profile_creation_step'] == 'name'
    update.message.reply_text.assert_called_once_with("Let's create your profile! What's your name?")

@pytest.mark.asyncio
async def test_handle_profile_input_name():
    update = AsyncMock()
    update.message.text = "John Doe"
    context = MagicMock()
    context.user_data = {'profile_creation_step': 'name'}

    await handle_profile_input(update, context)

    assert context.user_data['name'] == "John Doe"
    assert context.user_data['profile_creation_step'] == 'age'
    update.message.reply_text.assert_called_once_with("Great! Now, what's your age?")

@pytest.mark.asyncio
async def test_handle_profile_input_age():
    update = AsyncMock()
    update.message.text = "25"
    context = MagicMock()
    context.user_data = {'profile_creation_step': 'age', 'name': 'John Doe'}

    await handle_profile_input(update, context)

    assert context.user_data['age'] == "25"
    assert context.user_data['profile_creation_step'] == 'bio'
    update.message.reply_text.assert_called_once_with("Awesome! Finally, tell me a bit about yourself (your bio):")

@pytest.mark.asyncio
async def test_handle_profile_input_bio():
    update = AsyncMock()
    update.message.text = "I love coding and hiking!"
    context = MagicMock()
    context.user_data = {'profile_creation_step': 'bio', 'name': 'John Doe', 'age': '25'}

    await handle_profile_input(update, context)

    assert context.user_data['bio'] == "I love coding and hiking!"
    assert 'profile_creation_step' not in context.user_data
    update.message.reply_text.assert_called_once_with("Your profile has been created successfully!")

@pytest.mark.asyncio
async def test_handle_profile_input_invalid_step():
    update = AsyncMock()
    update.message.text = "Invalid input"
    context = MagicMock()
    context.user_data = {}

    await handle_profile_input(update, context)

    update.message.reply_text.assert_called_once_with("I'm not sure what you mean. Use /create_profile to start creating your profile.")