import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { ensureUserExists, getProfileCompleteness, getMissingFieldsDisplay } from "../lib/user-utils.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import { t, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type Language } from "../lib/i18n.js";

export function buildLanguageKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const lang of SUPPORTED_LANGUAGES) {
    keyboard.text(`${lang.flag} ${lang.label}`, `lang:${lang.code}`).row();
  }
  return keyboard;
}

async function setUserLanguage(env: Env, userId: string, language: Language): Promise<boolean> {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: { language } }),
      })
    );
    return res.ok;
  } catch {
    return false;
  }
}

export const startCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply(t("welcomeNew"));
    return;
  }

  const result = await ensureUserExists(ctx, env);
  if (!result) {
    await ctx.reply(t("genericError"));
    return;
  }

  const { user, created } = result;
  const lang = (user.language as Language) ?? DEFAULT_LANGUAGE;

  if (created) {
    // New user — show language selection first
    await ctx.reply(
      "🌍 Choose your language / Pilih bahasa:\n(More languages coming soon!)",
      { reply_markup: buildLanguageKeyboard() }
    );
    return;
  }

  // Existing user — welcome back in their language
  const { complete, missing } = getProfileCompleteness(user);

  if (!complete) {
    await ctx.reply(
      t("welcomeBackIncomplete", lang, { missing: getMissingFieldsDisplay(missing) }),
      { reply_markup: getMainMenuKeyboard(), parse_mode: "Markdown" }
    );
    return;
  }

  await ctx.reply(t("welcomeBack", lang), {
    reply_markup: getMainMenuKeyboard(),
    parse_mode: "Markdown",
  });
};

export const languageCallback = async (ctx: MyContext, env: Env, data: string): Promise<boolean> => {
  if (!ctx.from) return false;
  if (!data.startsWith("lang:")) return false;

  const selectedLang = data.replace("lang:", "") as Language;
  const userId = String(ctx.from.id);

  // Store language preference
  await setUserLanguage(env, userId, selectedLang);

  await ctx.answerCallbackQuery("Language set to English 🇬🇧").catch(() => {});
  await ctx.editMessageText(t("welcomeNew", selectedLang), { parse_mode: "Markdown" });
  await ctx.reply("Use the menu below to get started:", { reply_markup: getMainMenuKeyboard() });
  return true;
};
