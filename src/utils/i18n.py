# Migrated from src/meetsmatch/i18n.py
# TODO: Ensure localedir path is correct relative to the new location
# TODO: Integrate this i18n instance properly into the bot application context/handlers

import gettext
from functools import lru_cache

from src.config import get_settings

# Global dictionary to hold translations, loaded once.
_translations = {}


def load_translations(locale_dir: str | None = None) -> None:
    """Loads translations for supported languages."""
    global _translations
    settings = get_settings()
    locale_dir = locale_dir or settings.LOCALE_DIR
    supported_langs = settings.SUPPORTED_LANGUAGES

    # Ensure English always exists, even if just NullTranslations
    _translations["en"] = gettext.NullTranslations()

    for lang in supported_langs:
        if lang == "en":
            continue
        try:
            translation = gettext.translation(
                "messages",  # Domain name used in pybabel extract/compile
                localedir=locale_dir,
                languages=[lang],
                fallback=True,  # Fallback to parent language (e.g., pt_BR -> pt -> en)
            )
            _translations[lang] = translation
        except FileNotFoundError:
            print(f"Warning: Translation file for language '{lang}' not found in {locale_dir}. Falling back.")
            # Use NullTranslations if specific language file is missing
            if lang not in _translations:
                _translations[lang] = gettext.NullTranslations()


# Load translations when the module is imported (will now call get_settings)
# Need to ensure settings are available or mocked appropriately at import time if this runs globally.
# Consider moving this call to application startup if it causes issues.
# load_translations()


@lru_cache(maxsize=1024)  # Cache at the module level
def get_text(key: str, lang: str = "en") -> str:
    """
    Get translated text for a given key and language using module-level cache.

    Args:
        key (str): The message key to translate
        lang (str): The language code (e.g., 'en', 'es')

    Returns:
        str: The translated text, or the key itself if translation not found
    """
    global _translations
    # Fallback logic: specific lang -> base lang (e.g., pt_BR -> pt) -> default 'en'
    effective_lang = lang
    if effective_lang not in _translations:
        # Try base language if applicable (e.g., 'pt_BR' -> 'pt')
        base_lang = effective_lang.split("_")[0]
        if base_lang != effective_lang and base_lang in _translations:
            effective_lang = base_lang
        else:
            effective_lang = "en"  # Default fallback

    # Use gettext to handle potential KeyErrors gracefully (returns the key)
    return _translations[effective_lang].gettext(key)


# --- Remove or deprecate the Translator class if no longer needed ---
# class Translator:
#     def __init__(self, locale_dir: str | None = None) -> None:
#         self.locale_dir = locale_dir or settings.LOCALE_DIR
#         self.supported_langs = settings.SUPPORTED_LANGUAGES
#         self.translations = {}
#         self._load_translations()

#     def _load_translations(self) -> None:
#         # Ensure English always exists
#         self.translations["en"] = gettext.NullTranslations()

#         for lang in self.supported_langs:
#             if lang == "en":
#                 continue
#             try:
#                 translation = gettext.translation(
#                     "messages",
#                     localedir=self.locale_dir,
#                     languages=[lang],
#                     fallback=True,
#                 )
#                 self.translations[lang] = translation
#             except FileNotFoundError:
#                 print(f"Warning: Translation file for '{lang}' not found in {self.locale_dir}.")
#                 self.translations[lang] = gettext.NullTranslations()

#     @lru_cache(maxsize=1024) # B019: This caused the warning
#     def get_text(self, key: str, lang: str = "en") -> str:
#         """
#         Get translated text for a given key and language.
#         Args:
#             key (str): The message key to translate
#             lang (str): The language code (e.g., 'en', 'es')
#         Returns:
#             str: The translated text, or the original text if translation not found
#         """
#         if lang not in self.translations:
#             lang = "en"
#         return self.translations[lang].gettext(key)
