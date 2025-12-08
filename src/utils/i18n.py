# Migrated from src/meetsmatch/i18n.py
# TODO: Ensure localedir path is correct relative to the new location
# TODO: Integrate this i18n instance properly into the bot application context/handlers

import gettext
import os
from functools import lru_cache
from typing import Any, Dict

SUPPORTED_LANGUAGES = {
    "en": "English",
    "id": "Bahasa Indonesia",
    "es": "Español",
    "ru": "Русский",
    "zh": "中文",
}


class I18n:
    """Internationalization support for the bot."""

    def __init__(self) -> None:
        """Initialize the I18n provider and load translations."""
        self.translations: Dict[str, Any] = {}
        self._load_translations()

    def _load_translations(self) -> None:
        """
        Load all available translations from the locale directory.

        It attempts to load .mo files for each supported language.
        If a translation file is missing, it falls back to NullTranslations
        (returning the original key).
        """
        # FIXME: Verify this path after moving the file
        localedir = os.path.join(os.path.dirname(__file__), "..", "..", "locales")
        # Original path relative to src/meetsmatch/:
        # localedir = os.path.join(os.path.dirname(__file__), "locales")

        for lang in SUPPORTED_LANGUAGES:
            try:
                translation = gettext.translation("base", localedir, languages=[lang])
                self.translations[lang] = translation
            except FileNotFoundError:
                # Fallback to English if translation not found
                print(f"Warning: Translation not found for language '{lang}' in {localedir}")
                self.translations[lang] = gettext.NullTranslations()

    # B019: lru_cache on method can cause memory leaks, but I18n is a singleton
    @lru_cache(maxsize=1024)  # noqa: B019
    def get_text(self, key: str, lang: str = "en") -> str:
        """
        Get translated text for a given key and language.

        Uses caching to improve performance for frequently accessed strings.

        Args:
            key (str): The message key (usually English text) to translate.
            lang (str): The target language code (e.g., 'en', 'es').

        Returns:
            str: The translated text, or the original text if translation not found.
        """
        if lang not in self.translations:
            lang = "en"
        return str(self.translations[lang].gettext(key))

    def get_supported_languages(self) -> dict:
        """
        Get dictionary of supported languages.

        Returns:
            dict: A mapping of language codes to language names.
        """
        return SUPPORTED_LANGUAGES.copy()


# Global instance - TODO: Consider dependency injection instead
# This might need to be initialized within the application context
i18n = I18n()
