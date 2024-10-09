import json
from bot.config import supabase_client, db_logger  # Ensure this is the correct import
from bot.database.db_operations import create_users_table  # Import the new function

POLICY_CONFIG_FILE = 'policies.json'

async def initialize_database():
    await create_users_table()  # Ensure the users table exists

def load_policy_config():
    with open(POLICY_CONFIG_FILE, 'r') as file:
        return json.load(file)

async def fetch_existing_policies():
    """Fetch existing policies from the Supabase database."""
    response = await supabase_client.rpc("get_all_policies").execute()
    if response.error:
        db_logger.error(f"Error fetching existing policies: {response.error.message}")
        return []
    return response.data

async def compare_and_update_policies():
    await initialize_database()  # Ensure the database is initialized
    existing_policies = await fetch_existing_policies()
    desired_policies = load_policy_config()

    existing_policy_names = {policy['name'] for policy in existing_policies}

    for policy in desired_policies:
        if policy['name'] in existing_policy_names:
            existing_policy = next(p for p in existing_policies if p['name'] == policy['name'])
            if existing_policy['definition'] != policy['definition']:
                await create_or_update_policy(policy)
        else:
            await create_or_update_policy(policy)

async def create_or_update_policy(policy):
    try:
        existing_policy = await supabase_client.rpc("get_policy", {"name": policy["name"]}).execute()
        
        if existing_policy.data:
            query = f"ALTER POLICY {policy['name']} ON {policy['table']} {policy['definition']};"
        else:
            query = f"CREATE POLICY {policy['name']} ON {policy['table']} {policy['definition']};"
        
        await supabase_client.rpc("execute_sql", {"query": query}).execute()
        db_logger.info(f"Policy {policy['name']} has been set up.")
    except Exception as e:
        db_logger.error(f"Error setting up policy {policy['name']}: {str(e)}")

async def verify_and_setup_policies():
    await compare_and_update_policies()