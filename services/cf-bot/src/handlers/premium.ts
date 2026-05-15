import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { ensureUserExists } from "../lib/user-utils.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";

const PREMIUM_PRICE = "$4.99/month";
const PREMIUM_PLUS_PRICE = "$9.99/month";

async function getInteractionStatus(env: Env, userId: string): Promise<{ likesRemaining: number; likesTotal: number; dislikesRemaining: number; dislikesTotal: number; tier: string } | null> {
  try {
    const res = await env.API_SERVICE.fetch(new Request(`http://api/users/${userId}/interaction-status`, { method: "GET" }));
    if (!res.ok) return null;
    return await res.json() as { likesRemaining: number; likesTotal: number; dislikesRemaining: number; dislikesTotal: number; tier: string };
  } catch {
    return null;
  }
}

async function getReferralInfo(env: Env, userId: string): Promise<{ code: string | null; count: number; bonus: number } | null> {
  try {
    const res = await env.API_SERVICE.fetch(new Request(`http://api/users/${userId}`, { method: "GET" }));
    if (!res.ok) return null;
    const data = await res.json() as { user?: Record<string, unknown> };
    const user = data.user;
    if (!user) return null;
    return {
      code: user.referralCode as string | undefined ?? null,
      count: Number(user.referralCount ?? 0),
      bonus: Number(user.referralBonusSwipes ?? 0),
    };
  } catch {
    return null;
  }
}

async function getBotUsername(ctx: MyContext): Promise<string | undefined> {
  // ctx.me is populated after bot.init(); fallback to getMe() API call
  if (ctx.me?.username) return ctx.me.username;
  try {
    const me = await ctx.api.getMe();
    return me.username;
  } catch {
    return undefined;
  }
}

export const premiumCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) return;

  const result = await ensureUserExists(ctx, env);
  if (!result) {
    await ctx.reply("❌ Sorry, there was an error. Please try /start first.");
    return;
  }

  const userId = String(ctx.from.id);
  const status = await getInteractionStatus(env, userId);
  const tier = status?.tier ?? "free";

  const interactionLine = status
    ? `❤️ ${status.likesRemaining}/${status.likesTotal} likes · 👎 ${status.dislikesRemaining}/${status.dislikesTotal} dislikes today`
    : "";

  const msg = [
    "👑 *Premium Plans*",
    "",
    `*Current plan:* ${tier === "free" ? "Free" : tier === "premium" ? "Premium 👑" : "Premium+ 💎"}`,
    interactionLine,
    "",
    "*Free Plan:*",
    "• Browse unlimited profiles",
    "• 15 likes + 35 dislikes per day",
    "• No skip (Like or Dislike only)",
    "",
    "*Premium 👑 — " + PREMIUM_PRICE + "*",
    "• Unlimited likes & dislikes",
    "• ⏩ Skip profiles",
    "• Priority matching",
    "• See who liked you",
    "",
    "*Premium+ 💎 — " + PREMIUM_PLUS_PRICE + "*",
    "• Everything in Premium",
    "• Unlimited direct DMs",
    "• Verified badge",
    "• Advanced filters",
    "",
    "_Premium activation is currently manual. Contact support to upgrade._",
  ].filter(Boolean).join("\n");

  const keyboard = new InlineKeyboard()
    .text("🎁 Share for Free Bonus", "referral:show")
    .row()
    .text("❌ Close", "premium:close");

  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
};

export const referralCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) return;

  const result = await ensureUserExists(ctx, env);
  if (!result) {
    await ctx.reply("❌ Sorry, there was an error. Please try /start first.");
    return;
  }

  const userId = String(ctx.from.id);
  const info = await getReferralInfo(env, userId);
  const botUsername = await getBotUsername(ctx);
  const code = info?.code;
  const link = botUsername && code
    ? `https://t.me/${botUsername}?start=ref_${code}`
    : null;

  const statsLines = info
    ? [
        `👥 *Friends invited:* ${info.count}`,
        `⭐ *Bonus earned:* +${info.bonus} likes/dislikes`,
      ]
    : [];

  const msg = [
    "🎁 *Invite Friends, Earn Bonus*",
    "",
    "Share your referral link with friends. When they join and complete their profile, *both of you get +5 bonus likes & dislikes!*",
    "",
    ...statsLines,
    "",
    `*Your referral code:* \`${code ?? "N/A"}\``,
    link ? `\n*Your link:* ${link}` : "",
  ].filter(Boolean).join("\n");

  const keyboard = new InlineKeyboard();
  if (link) {
    keyboard.url("📤 Share on Telegram", `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join me on MeetMatch! 🎁")}`)
      .row();
    keyboard.copyText("📋 Copy Link", link).row();
  }
  keyboard.text("❌ Close", "referral:close");

  await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: keyboard });
};

export const premiumCallbacks = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from || !ctx.callbackQuery?.data) return;
  const data = ctx.callbackQuery.data;

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
};
