import os
from dotenv import load_dotenv
from typing import Optional

# Load environment variables from .env file
load_dotenv()

# Telegram configuration
TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
if not TELEGRAM_BOT_TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN is not set in the environment variables")

# Supabase configuration
SUPABASE_URL: Optional[str] = os.getenv("SUPABASE_URL")
SUPABASE_PUBLIC_KEY: Optional[str] = os.getenv("SUPABASE_PUBLIC_KEY")
SUPABASE_SERVICE_ROLE_KEY: Optional[str] = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Validate Supabase configuration
if not all([SUPABASE_URL, SUPABASE_PUBLIC_KEY, SUPABASE_SERVICE_ROLE_KEY]):
    print("Warning: One or more Supabase environment variables are not set")

# Additional configuration options
DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")