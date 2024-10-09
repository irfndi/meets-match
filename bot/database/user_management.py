from bot.database.db_operations import create_users_table  # Import the new function
from bot.config import supabase_client  # Ensure this is the correct import

async def initialize_database():
    await create_users_table()  # Create the users table if it doesn't exist

async def create_user(username: str, age: int, gender: str, interests: list):
    await initialize_database()  # Ensure the database is initialized
    existing_user_response = await supabase_client.table('users').select("*").eq("username", username).execute()
    
    if existing_user_response.data:
        raise Exception(f"User with username '{username}' already exists.")

    response = await supabase_client.table('users').insert({
        'username': username,
        'age': age,
        'gender': gender,
        'interests': interests
    }).execute()
    
    if response.error:
        raise Exception(f"Error creating user: {response.error.message}")
    return response.data

async def get_user(user_id):
    """Retrieve a user profile from the database."""
    response = await supabase_client.table('users').select("*").eq("id", user_id).execute()
    if response.error:
        raise Exception(f"Error retrieving user: {response.error.message}")
    return response.data

async def update_user(user_id, updates):
    """Update an existing user profile in the database."""
    response = await supabase_client.table('users').update(updates).eq("id", user_id).execute()
    if response.error:
        raise Exception(f"Error updating user: {response.error.message}")
    return response.data

async def delete_user(user_id):
    """Delete a user profile from the database."""
    response = await supabase_client.table('users').delete().eq("id", user_id).execute()
    if response.error:
        raise Exception(f"Error deleting user: {response.error.message}")
    return response.data