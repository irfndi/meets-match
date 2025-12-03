import sqlalchemy
from sqlalchemy import create_engine, text
import os

try:
    url = os.environ["DATABASE_URL"].replace("postgres://", "postgresql://")
    engine = create_engine(url)
    with engine.connect() as conn:
        try:
            result = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_name='deleted_media'"))
            exists = bool(result.fetchall())
            print("deleted_media exists:", exists)
        except Exception as e:
            print("Error checking deleted_media:", e)
except Exception as e:
    print("Critical Error:", e)
