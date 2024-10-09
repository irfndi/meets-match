from .db_operations import setup_database, verify_database_connection
from loguru import logger
from bot.config import supabase, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from bot.database.policy_manager import verify_and_setup_policies

async def initialize_database():
    # Other initialization logic...
    await verify_and_setup_policies()

if __name__ == "__main__":
    import asyncio
    asyncio.run(initialize_database())
