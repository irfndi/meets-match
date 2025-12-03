import sys

import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT


def setup_local_db():
    print("Setting up local database...")

    # Connect to default 'postgres' database with current user
    # Assuming 'irfandi' is the superuser based on previous check
    try:
        conn = psycopg2.connect(dbname="postgres", user="irfandi", host="localhost")
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cur = conn.cursor()
    except Exception as e:
        print(f"Failed to connect to postgres: {e}")
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
