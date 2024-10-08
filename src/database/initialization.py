from .db_operations import setup_database, verify_database_connection
from loguru import logger
from config import supabase_client

async def setup():
    try:
        db_setup_success = await setup_database(supabase_client)
        if not db_setup_success:
            raise Exception("Database setup failed")
        logger.info("Database setup completed successfully")
    except Exception as e:
        raise Exception(f"Failed to set up database: {str(e)}")

if __name__ == "__main__":
    import asyncio
    asyncio.run(setup())
