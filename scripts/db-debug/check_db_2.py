import os

from sqlalchemy import create_engine, text

url = os.environ["DATABASE_URL"].replace("postgres://", "postgresql://")
engine = create_engine(url)
with engine.connect() as conn:
    try:
        result = conn.execute(text("SELECT * FROM alembic_version"))
        print("Alembic Version:", result.fetchall())
    except Exception as e:
        print("Error checking alembic_version:", e)

    try:
        result = conn.execute(
            text(
                "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='is_sleeping'"
            )
        )
        print("is_sleeping exists:", bool(result.fetchall()))
    except Exception as e:
        print("Error checking is_sleeping:", e)
