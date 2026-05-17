import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { ensureUserExists } from "../lib/user-utils.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import { ApiServiceClient } from "../services/api-client.js";
import { createLogger } from "@meetsmatch/cf-shared";
import { replyWithError } from "../lib/error-feedback.js";
import { t, type Language } from "../lib/i18n.js";

const log = createLogger("cf-bot");

const PREMIUM_STARS = 500;
const PREMIUM_PLUS_STARS = 1000;

async function getInteractionStatus(
  env: Env,
  userId: string,
): Promise<{
  likesRemaining: number;
  likesTotal: number;
  dislikesRemaining: number;
  dislikesTotal: number;
  tier: string;
} | null> {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}/interaction-status`, {
        method: "GET",
      }),
    );
    if (!res.ok) return null;
    return (await res.json()) as {
      likesRemaining: number;
      likesTotal: number;
      dislikesRemaining: number;
      dislikesTotal: number;
      tier: string;
    };
  } catch (error) {
    log.error(
      "getInteractionStatus",
      "Failed to get interaction status",
      { userId },
      error,
    );
    return null;
  }
}

async function getReferralInfo(
  env: Env,
  userId: string,
): Promise<{ code: string | null; count: number; bonus: number } | null> {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { user?: Record<string, unknown> };
    const user = data.user;
    if (!user) return null;

    let code = (user.referralCode as string | undefined) ?? null;
    if (!code) {
      try {
        const client = new ApiServiceClient(env.API_SERVICE);
        const referralRes = await client.getReferralCode(userId);
        code = referralRes.code;
      } catch (error) {
        log.error(
          "getReferralCode",
          "Failed to get referral code",
          { userId },
          error,
        );
      }
    }

    return {
      code,
      count: Number(user.referralCount ?? 0),
      bonus: Number(user.referralBonusSwipes ?? 0),
    };
  } catch (error) {
    log.error(
      "getReferralInfo",
      "Failed to get referral info",
      { userId },
      error,
    );
    return null;
  }
}

async function getBotUsername(ctx: MyContext): Promise<string | undefined> {
  // ctx.me is populated after bot.init(); fallback to getMe() API call
  if (ctx.me?.username) return ctx.me.username;
  try {
    const me = await ctx.api.getMe();
    return me.username;
  } catch (error) {
    log.error("getBotUsername", "Failed to get bot username", undefined, error);
    return undefined;
  }
}

export const premiumCommand = async (
  ctx: MyContext,
  env: Env,
): Promise<void> => {
  if (!ctx.from) return;

  try {
    const result = await ensureUserExists(ctx, env);
    if (!result) {
      await ctx.reply(t("genericError", "en"));
      return;
    }

    const userId = String(ctx.from.id);
    const lang: Language = (result.user.language as Language) ?? "en";
    const status = await getInteractionStatus(env, userId);
    const tier = status?.tier ?? "free";

    // Fetch expiry date for paid tiers
    let expiryLine = "";
    if (tier !== "free") {
      try {
        const client = new ApiServiceClient(env.API_SERVICE);
        const userRes = await client.getUser({ userId });
        const expiresAt = userRes.user?.subscriptionExpiresAt;
        if (expiresAt) {
          const date = new Date(expiresAt);
          expiryLine = t("premiumExpires", lang, {
            date: date.toLocaleDateString("en-GB"),
          });
        }
      } catch {
        // ignore
      }
    }

    const interactionLine = status
      ? `❤️ ${status.likesRemaining}/${status.likesTotal} likes · 👎 ${status.dislikesRemaining}/${status.dislikesTotal} dislikes today`
      : "";

    const msg = [
      t("premiumTitle", lang),
      "",
      t("premiumCurrentPlan", lang, {
        plan:
          tier === "free"
            ? t("planFree", lang)
            : tier === "premium"
              ? "Premium 👑"
              : "Premium+ 💎",
      }),
      expiryLine,
      interactionLine,
      "",
      t("premiumFreePlan", lang),
      t("premiumFeatureBrowse", lang),
      t("premiumFeatureLikes", lang, { likes: "15", dislikes: "35" }),
      t("premiumFeatureNoSkip", lang),
      "",
      `*Premium 👑 — ${PREMIUM_STARS} ⭐*`,
      t("premiumFeatureUnlimited", lang),
      t("premiumFeatureSkip", lang),
      t("premiumFeaturePriority", lang),
      t("premiumFeatureSeeLikes", lang),
      "",
      `*Premium+ 💎 — ${PREMIUM_PLUS_STARS} ⭐*`,
      t("premiumFeatureDMs", lang),
      t("premiumFeatureVerified", lang),
      t("premiumFeatureAdvancedFilters", lang),
    ]
      .filter(Boolean)
      .join("\n");

    const keyboard = new InlineKeyboard();

    // Free users can buy Premium; premium users upgrade via Premium+ button below
    if (tier === "free") {
      try {
        const premiumLink = await ctx.api.createInvoiceLink(
          t("premiumInvoiceTitlePremium", lang),
          t("premiumInvoiceDescPremium", lang),
          `premium_${userId}_premium`,
          "",
          "XTR",
          [{ label: "Premium", amount: PREMIUM_STARS }],
        );
        keyboard
          .url(
            t("premiumBuyPremium", lang, { stars: String(PREMIUM_STARS) }),
            premiumLink,
          )
          .row();
      } catch (error) {
        log.error(
          "premiumInvoice",
          "Failed to create Premium invoice",
          { userId },
          error,
        );
      }
    }

    if (tier !== "premium_plus") {
      try {
        const plusLink = await ctx.api.createInvoiceLink(
          t("premiumInvoiceTitlePlus", lang),
          t("premiumInvoiceDescPlus", lang),
          `premium_${userId}_premium_plus`,
          "",
          "XTR",
          [{ label: "Premium+", amount: PREMIUM_PLUS_STARS }],
        );
        keyboard
          .url(
            t("premiumBuyPremiumPlus", lang, {
              stars: String(PREMIUM_PLUS_STARS),
            }),
            plusLink,
          )
          .row();
      } catch (error) {
        log.error(
          "premiumInvoice",
          "Failed to create Premium+ invoice",
          { userId },
          error,
        );
      }
    }

    keyboard.text(t("premiumShareForBonus", lang), "referral:show").row();
    keyboard.text(t("premiumClose", lang), "premium:close");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (error) {
    log.error("premiumCommand", "Unhandled error", undefined, error);
    await replyWithError(ctx, env, "en", { command: "premium" });
  }
};

export const referralCommand = async (
  ctx: MyContext,
  env: Env,
): Promise<void> => {
  if (!ctx.from) return;

  try {
    const result = await ensureUserExists(ctx, env);
    if (!result) {
      await ctx.reply(t("genericError", "en"));
      return;
    }

    const userId = String(ctx.from.id);
    const lang: Language = (result.user.language as Language) ?? "en";
    const info = await getReferralInfo(env, userId);
    const botUsername = await getBotUsername(ctx);
    const code = info?.code;
    const link =
      botUsername && code
        ? `https://t.me/${botUsername}?start=ref_${code}`
        : null;

    const statsLines = info
      ? [
          t("referralFriendsInvited", lang, { count: String(info.count) }),
          t("referralBonusEarned", lang, { count: String(info.bonus) }),
        ]
      : [];

    const msg = [
      t("referralTitle", lang),
      "",
      t("referralBody", lang),
      "",
      ...statsLines,
      "",
      t("referralYourCode", lang, { code: code ?? "N/A" }),
      link ? "\n" + t("referralYourLink", lang, { link }) : "",
    ]
      .filter(Boolean)
      .join("\n");

    const keyboard = new InlineKeyboard();
    if (link) {
      keyboard
        .url(
          t("referralShareOnTelegram", lang),
          `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t("referralShareText", lang))}`,
        )
        .row();
      keyboard.copyText(t("referralCopyLink", lang), link).row();
    }
    keyboard.text(t("referralClose", lang), "referral:close");

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
  } catch (error) {
    log.error("referralCommand", "Unhandled error", undefined, error);
    await replyWithError(ctx, env, "en", { command: "referral" });
  }
};

export const premiumCallbacks = async (
  ctx: MyContext,
  env: Env,
): Promise<void> => {
  if (!ctx.from || !ctx.callbackQuery?.data) return;
  const data = ctx.callbackQuery.data;

  try {
    if (data === "premium:show") {
      await premiumCommand(ctx, env);
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    if (data === "premium:close") {
      await ctx.deleteMessage().catch(() => {});
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    if (data === "referral:show") {
      await referralCommand(ctx, env);
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    if (data === "referral:close" || data === "referral:dismiss") {
      await ctx.deleteMessage().catch(() => {});
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    if (data === "premium_ad:dismiss") {
      await ctx.deleteMessage().catch(() => {});
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }
  } catch (error) {
    log.error("premiumCallbacks", "Unhandled error", undefined, error);
    await replyWithError(ctx, env, "en", { action: "premium_callback" });
    await ctx.answerCallbackQuery().catch(() => {});
  }
};
