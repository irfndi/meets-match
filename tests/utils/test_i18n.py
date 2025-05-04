# tests/utils/test_i18n.py
import gettext
from unittest.mock import MagicMock, patch

import pytest

# Import the functions/module to test
from src.utils import i18n


@pytest.fixture(autouse=True)
def reset_translations():
    """Ensure translations are reset before each test."""
    # Store original state if necessary, or ensure clean slate
    original_translations = i18n._translations.copy()
    i18n._translations = {}
    yield
    # Restore original state
    i18n._translations = original_translations


@patch("src.utils.i18n.get_settings")
@patch("src.utils.i18n.gettext.translation")
def test_load_translations_success(mock_gettext_translation, mock_get_settings):
    """Test load_translations successfully loads translations."""
    # --- Arrange ---
    # Mock the return value of get_settings()
    mock_settings_instance = MagicMock()
    mock_settings_instance.LOCALE_DIR = "/fake/locale"
    mock_settings_instance.SUPPORTED_LANGUAGES = ["en", "es", "fr"]
    mock_get_settings.return_value = mock_settings_instance

    # Mock gettext.translation
    mock_es_trans = MagicMock(spec=gettext.NullTranslations)
    mock_fr_trans = MagicMock(spec=gettext.NullTranslations)

    def translation_side_effect(domain, localedir, languages, fallback):
        lang = languages[0]
        if lang == "es":
            return mock_es_trans
        elif lang == "fr":
            return mock_fr_trans
        else:
            raise FileNotFoundError  # Simulate file not found for unexpected languages

    mock_gettext_translation.side_effect = translation_side_effect

    # Ensure clean state for the test
    i18n._translations = {}

    # --- Act ---
    # Explicitly call load_translations for the test
    i18n.load_translations(locale_dir="/fake/locale")  # Pass mocked dir explicitly

    # --- Assert ---
    # Check that gettext.translation was called for 'es' and 'fr'
    assert mock_gettext_translation.call_count == 2
    mock_gettext_translation.assert_any_call("messages", localedir="/fake/locale", languages=["es"], fallback=True)
    mock_gettext_translation.assert_any_call("messages", localedir="/fake/locale", languages=["fr"], fallback=True)

    # Check the internal _translations dictionary
    assert "en" in i18n._translations
    assert isinstance(i18n._translations["en"], gettext.NullTranslations)  # English default
    assert "es" in i18n._translations
    assert i18n._translations["es"] is mock_es_trans
    assert "fr" in i18n._translations
    assert i18n._translations["fr"] is mock_fr_trans


@patch("src.utils.i18n.get_settings")  # Correct patch target
@patch("src.utils.i18n.gettext.translation")
def test_load_translations_file_not_found(mock_gettext_translation, mock_get_settings, capsys):
    """Test load_translations handles FileNotFoundError and falls back."""
    # --- Arrange ---
    # Mock the return value of get_settings()
    mock_settings_instance = MagicMock()
    mock_settings_instance.LOCALE_DIR = "/fake/locale"
    mock_settings_instance.SUPPORTED_LANGUAGES = ["en", "xx"]
    mock_get_settings.return_value = mock_settings_instance

    # Simulate FileNotFoundError for 'xx'
    mock_gettext_translation.side_effect = FileNotFoundError

    i18n._translations = {}

    # --- Act ---
    i18n.load_translations(locale_dir="/fake/locale")
    captured = capsys.readouterr()  # Capture print output

    # --- Assert ---
    # Check that gettext.translation was called for 'xx'
    mock_gettext_translation.assert_called_once_with(
        "messages", localedir="/fake/locale", languages=["xx"], fallback=True
    )
    # Check the warning message was printed
    assert "Warning: Translation file for language 'xx' not found" in captured.out
    # Check that 'xx' falls back to NullTranslations
    assert "en" in i18n._translations
    assert "xx" in i18n._translations
    assert isinstance(i18n._translations["xx"], gettext.NullTranslations)


def test_get_text_basic_and_fallback():
    """Test get_text retrieves text and falls back correctly."""
    # --- Arrange ---
    # Manually setup _translations for testing get_text directly
    mock_es_trans = MagicMock(spec=gettext.NullTranslations)
    mock_es_trans.gettext.side_effect = lambda key: {"hello": "hola"}.get(key, key)

    mock_en_trans = gettext.NullTranslations()  # English fallback returns the key

    i18n._translations = {
        "en": mock_en_trans,
        "es": mock_es_trans,
    }
    i18n.get_text.cache_clear()  # Clear cache before test

    # --- Act & Assert ---
    # Test basic retrieval
    assert i18n.get_text("hello", lang="es") == "hola"
    mock_es_trans.gettext.assert_called_once_with("hello")

    # Test fallback to English (key not in 'es')
    assert i18n.get_text("goodbye", lang="es") == "goodbye"
    assert mock_es_trans.gettext.call_count == 2  # Called again for goodbye
    mock_es_trans.gettext.assert_called_with("goodbye")

    # Test direct English retrieval
    assert i18n.get_text("hello", lang="en") == "hello"

    # Test fallback for unknown language ('fr' not loaded)
    assert i18n.get_text("hello", lang="fr") == "hello"

    # Test caching (gettext should not be called again for 'hello' in 'es')
    mock_es_trans.gettext.reset_mock()
    assert i18n.get_text("hello", lang="es") == "hola"
    mock_es_trans.gettext.assert_not_called()
