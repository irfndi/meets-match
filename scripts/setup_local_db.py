import getpass
import os
import sys

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT


def setup_local_db() -> None:
    """Set up local PostgreSQL database for MeetsMatch."""
    print("Setting up local database...")

    # Connect to default 'postgres' database with current user
    # Use environment variable or current system user
    db_user = os.environ.get("PGUSER", getpass.getuser())
    try:
        conn = psycopg2.connect(dbname="postgres", user=db_user, host="localhost")
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
    except Exception as e:
        print(f"Failed to connect to postgres as '{db_user}': {e}")
        print("Hint: Set PGUSER environment variable to specify a different user.")
        sys.exit(1)

    # 1. Create User 'meetsmatch'
    try:
        cur.execute("SELECT 1 FROM pg_roles WHERE rolname='meetsmatch'")
        if not cur.fetchone():
            print("Creating user 'meetsmatch'...")
            cur.execute("CREATE USER meetsmatch WITH PASSWORD 'password';")
        else:
            print("User 'meetsmatch' already exists.")
    except Exception as e:
        print(f"Error checking/creating user: {e}")

    # 2. Create Database 'meetsmatch'
    try:
        cur.execute("SELECT 1 FROM pg_database WHERE datname='meetsmatch'")
        if not cur.fetchone():
            print("Creating database 'meetsmatch'...")
            cur.execute("CREATE DATABASE meetsmatch OWNER meetsmatch;")
        else:
            print("Database 'meetsmatch' already exists.")
    except Exception as e:
        print(f"Error checking/creating database: {e}")

    cur.close()
    conn.close()
    print("Database setup complete!")


if __name__ == "__main__":
    setup_local_db()
