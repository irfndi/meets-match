import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import {
  ensureUserExists,
  getProfileCompleteness,
  isPhoneVerified,
  type UserProfile,
} from "../lib/user-utils.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import {
  continueOnboarding,
  promptPhoneVerification,
  clearOnboardingProgress,
} from "../lib/conversations.js";
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-bot");
import {
  t,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  type Language,
} from "../lib/i18n.js";

function getLanguageLabel(lang: Language): string {
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
  return found ? `${found.label} ${found.flag}` : lang;
}

export function buildLanguageKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (const lang of SUPPORTED_LANGUAGES) {
    keyboard.text(`${lang.flag} ${lang.label}`, `lang:${lang.code}`).row();
  }
  return keyboard;
}

async function setUserLanguage(
  env: Env,
  userId: string,
  language: Language,
): Promise<boolean> {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: { language } }),
      }),
    );
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "<no body>");
      log.error("setUserLanguage", "API returned error", {
        userId,
        language,
        status: res.status,
        body: bodyText,
      });
    }
    return res.ok;
  } catch (error) {
    log.error(
      "setUserLanguage",
      "Failed to set user language",
      { userId, language },
      error,
    );
    return false;
  }
}

export const startCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  try {
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

    // Handle referral code from deep link: /start ref_XXXXXX
    const startPayload = ctx.message?.text?.replace("/start", "").trim() ?? "";
    if (startPayload.startsWith("ref_")) {
      const code = startPayload.replace("ref_", "");
      const applyRes = await env.API_SERVICE.fetch(
        new Request(`http://api/users/${ctx.from.id}/apply-referral`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }),
      );
      if (applyRes.ok) {
        const data = (await applyRes.json()) as { message?: string };
        await ctx.reply(`🎉 ${data.message ?? "Referral applied!"}`);
      }
    }

    // For ALL incomplete users (new or existing), show language picker first
    // so they can choose/change language before onboarding
    const { complete } = getProfileCompleteness(user);

    if (created || !complete) {
      await ctx.reply(
        "🌍 Choose your language / Pilih bahasa:\n(More languages coming soon!)",
        { reply_markup: buildLanguageKeyboard() },
      );
      return;
    }

    // Profile complete — check phone verification
    if (!isPhoneVerified(user)) {
      await promptPhoneVerification(ctx, env, lang);
      return;
    }

    // Existing complete user — welcome back in their language
    await ctx.reply(t("welcomeBack", lang), {
      reply_markup: getMainMenuKeyboard(),
      parse_mode: "Markdown",
    });
  } catch (error) {
    log.error("startCommand", "Unhandled error", undefined, error);
    await ctx.reply(t("genericError"));
  }
};

export const languageCallback = async (
  ctx: MyContext,
  env: Env,
  data: string,
): Promise<boolean> => {
  if (!ctx.from) return false;
  if (!data.startsWith("lang:")) return false;

  try {
    const selectedLang = data.replace("lang:", "") as Language;
    const userId = String(ctx.from.id);

    // Store language preference
    const saved = await setUserLanguage(env, userId, selectedLang);
    if (!saved) {
      await ctx
        .answerCallbackQuery("❌ Failed to set language. Please try again.")
        .catch(() => {});
      await ctx.reply(t("genericError", selectedLang));
      return true;
    }

    await ctx
      .answerCallbackQuery(`Language set to ${getLanguageLabel(selectedLang)}`)
      .catch(() => {});
    await ctx
      .editMessageText(t("welcomeNew", selectedLang), {
        parse_mode: "Markdown",
      })
      .catch(() => {});

    // Fetch updated user profile to check completeness
    const userRes = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    if (!userRes.ok) {
      log.warn(
        "languageCallback",
        "Failed to fetch user after language update",
        {
          userId,
          status: userRes.status,
        },
      );
      await ctx.reply(t("genericError", selectedLang));
      return true;
    }

    const userData = (await userRes.json()) as { user?: UserProfile };
    const user = userData.user;
    if (!user) {
      log.warn(
        "languageCallback",
        "User payload missing after language update",
        {
          userId,
        },
      );
      await ctx.reply(t("genericError", selectedLang));
      return true;
    }

    log.info("languageCallback", "Fetched user after language update", {
      userId,
      selectedLang,
      userLanguage: user.language,
    });

    const { complete } = getProfileCompleteness(user);
    if (!complete) {
      // Clear any previous onboarding progress so the flow restarts fresh
      // (allows users to change language and re-do onboarding from the beginning)
      await clearOnboardingProgress(env.KV, userId);
      // Start onboarding from the first step
      const continued = await continueOnboarding(
        ctx,
        env,
        userId,
        selectedLang,
      );
      if (continued) return true;
    }

    // Profile fields complete — check phone verification before showing menu
    if (!isPhoneVerified(user)) {
      await promptPhoneVerification(ctx, env, selectedLang);
      return true;
    }

    await ctx.reply(t("menuPrompt", selectedLang), {
      reply_markup: getMainMenuKeyboard(),
    });
    return true;
  } catch (error) {
    log.error("languageCallback", "Unhandled error", undefined, error);
    await ctx.answerCallbackQuery("❌ Something went wrong.").catch(() => {});
    return false;
  }
};
