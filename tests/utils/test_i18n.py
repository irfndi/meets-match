from unittest.mock import MagicMock, patch

import pytest

from src.utils.i18n import SUPPORTED_LANGUAGES, I18n


@pytest.fixture
def i18n_instance():
    # Patch load_translations to avoid filesystem access during init
    with patch.object(I18n, "_load_translations"):
        instance = I18n()
        # Manually set up some mock translations
        instance.translations = {
            "en": MagicMock(),
            "es": MagicMock(),
        }
        instance.translations["en"].gettext.side_effect = lambda x: f"EN_{x}"
        instance.translations["es"].gettext.side_effect = lambda x: f"ES_{x}"
        return instance


def test_supported_languages(i18n_instance):
    assert i18n_instance.get_supported_languages() == SUPPORTED_LANGUAGES


def test_get_text_supported_language(i18n_instance):
    assert i18n_instance.get_text("hello", "en") == "EN_hello"
    assert i18n_instance.get_text("hello", "es") == "ES_hello"


def test_get_text_unsupported_language_fallback(i18n_instance):
    # Should fallback to 'en'
    assert i18n_instance.get_text("hello", "fr") == "EN_hello"


def test_load_translations_not_found():
    # Test real initialization but with mocked gettext.translation failing
    with patch("src.utils.i18n.gettext.translation") as mock_translation:
        mock_translation.side_effect = FileNotFoundError

        i18n = I18n()

        # Should have NullTranslations for all languages
        import gettext

        for lang in SUPPORTED_LANGUAGES:
            assert isinstance(i18n.translations[lang], gettext.NullTranslations)
