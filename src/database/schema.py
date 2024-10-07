from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_PUBLIC_KEY
import logging
from typing import Dict, Any

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_PUBLIC_KEY)

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define schemas for all tables
USERS_SCHEMA: Dict[str, str] = {
    'id': 'uuid PRIMARY KEY DEFAULT uuid_generate_v4()',
    'created_at': 'timestamp with time zone DEFAULT now()',
    'telegram_id': 'bigint UNIQUE NOT NULL',
    'username': 'text',
    'first_name': 'text',
    'last_name': 'text',
    'bio': 'text',
    'preferences': 'jsonb',
    'updated_at': 'timestamp with time zone DEFAULT now()'
}

MATCHES_SCHEMA: Dict[str, str] = {
    'id': 'uuid PRIMARY KEY DEFAULT uuid_generate_v4()',
    'created_at': 'timestamp with time zone DEFAULT now()',
    'user1_id': 'uuid REFERENCES users(id)',
    'user2_id': 'uuid REFERENCES users(id)',
    'status': 'text CHECK (status IN (\'pending\', \'accepted\', \'rejected\'))',
    'updated_at': 'timestamp with time zone DEFAULT now()'
}

REPORTS_SCHEMA: Dict[str, str] = {
    'id': 'uuid PRIMARY KEY DEFAULT uuid_generate_v4()',
    'created_at': 'timestamp with time zone DEFAULT now()',
    'reporter_id': 'uuid REFERENCES users(id)',
    'reported_id': 'uuid REFERENCES users(id)',
    'reason': 'text',
    'status': 'text CHECK (status IN (\'pending\', \'reviewed\', \'resolved\'))',
    'reviewed_at': 'timestamp with time zone'
}

PREFERENCES_SCHEMA: Dict[str, str] = {
    'id': 'uuid PRIMARY KEY DEFAULT uuid_generate_v4()',
    'created_at': 'timestamp with time zone DEFAULT now()',
    'user_id': 'uuid REFERENCES users(id) UNIQUE',
    'age_min': 'integer CHECK (age_min >= 18)',
    'age_max': 'integer CHECK (age_max <= 100)',
    'gender_preference': 'text',
    'interests': 'jsonb',
    'location': 'point',
    'max_distance': 'integer',
    'updated_at': 'timestamp with time zone DEFAULT now()'
}

def ensure_table_schema(table_name: str, schema: Dict[str, str]) -> None:
    try:
        # Check if table exists
        result = supabase.table(table_name).select('id').limit(1).execute()
        
        if 'error' in result and 'message' in result['error'] and 'does not exist' in result['error']['message']:
            # Table doesn't exist, create it
            create_table_query = f"CREATE TABLE {table_name} ("
            create_table_query += ", ".join([f"{col} {dtype}" for col, dtype in schema.items()])
            create_table_query += ");"
            supabase.query(create_table_query).execute()
            logger.info(f"Created table: {table_name}")
        else:
            # Table exists, check and add missing columns
            existing_columns = supabase.query(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{table_name}'").execute()
            existing_columns = {col['column_name']: col['data_type'] for col in existing_columns.data}
            
            for col, dtype in schema.items():
                if col not in existing_columns:
                    alter_table_query = f"ALTER TABLE {table_name} ADD COLUMN {col} {dtype};"
                    supabase.query(alter_table_query).execute()
                    logger.info(f"Added column {col} to table {table_name}")
                elif existing_columns[col] != dtype.split()[0]:
                    alter_table_query = f"ALTER TABLE {table_name} ALTER COLUMN {col} TYPE {dtype.split()[0]};"
                    supabase.query(alter_table_query).execute()
                    logger.info(f"Modified column {col} in table {table_name}")
        
        logger.info(f"Ensured schema for table: {table_name}")
    except Exception as e:
        logger.error(f"Error ensuring schema for table {table_name}: {str(e)}")
        raise

def init_database() -> None:
    """Initialize the database by ensuring all table schemas."""
    tables = {
        'users': USERS_SCHEMA,
        'matches': MATCHES_SCHEMA,
        'reports': REPORTS_SCHEMA,
        'preferences': PREFERENCES_SCHEMA
    }
    
    for table_name, schema in tables.items():
        ensure_table_schema(table_name, schema)

    logger.info("Database initialization complete.")

if __name__ == "__main__":
    init_database()
