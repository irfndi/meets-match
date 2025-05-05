import i18next from "i18next";
import type { Env } from "../index"; // Import the main Env type
import enTranslation from "./en.json";
// Import other languages here, e.g.:
// import idTranslation from './id.json';

/**
 * Initializes the i18next instance.
 */
export async function initI18n(env: Env): Promise<void> {
  // Use the imported Env type
  const isDevelopment = env.WORKER_ENV === "development"; // Check specific var
  console.log(
    `[i18n] Initializing i18next. Development mode: ${isDevelopment}`
  );

  await i18next.init({
    lng: "en", // Default language
    fallbackLng: "en", // Fallback language
    debug: isDevelopment, // Use environment variable
    resources: {
      en: {
        translation: enTranslation,
      },
      // Add other languages here
      // id: {
      //   translation: idTranslation,
      // },
    },
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
  });
  console.log("[i18n] Initialized successfully.");
}

export default i18next;
