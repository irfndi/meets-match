from .start import start, setup_handlers
from .preferences_handler import set_preferences, handle_preference_input
from .matching_handler import handle_matching  # Ensure this import is correct

__all__ = [
    'start', 'setup_handlers',
    'set_preferences', 'handle_preference_input',
    'handle_matching'
]
