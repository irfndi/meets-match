import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { ensureUserExists } from "../lib/user-utils.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";

const PREMIUM_PRICE = "$4.99/month";
const SUPERVIP_PRICE = "$9.99/month";

async function getSwipeStatus(env: Env, userId: string): Promise<{ remaining: number; total: number; tier: string } | null> {
  try {
    const res = await env.API_SERVICE.fetch(new Request(`http://api/users/${userId}/swipe-status`, { method: "GET" }));
    if (!res.ok) return null;
    return await res.json() as { remaining: number; total: number; tier: string };
  } catch {
    return null;
  }
}

async function getReferralCode(env: Env, userId: string): Promise<string | null> {
  try {
    const res = await env.API_SERVICE.fetch(new Request(`http://api/users/${userId}/referral`, { method: "GET" }));
    if (!res.ok) return null;
    const data = await res.json() as { code?: string };
    return data.code ?? null;
  } catch {
    return null;
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
  const status = await getSwipeStatus(env, userId);
  const tier = status?.tier ?? "free";

  const msg = [
    "👑 *Premium Plans*",
    "",
    `*Current plan:* ${tier === "free" ? "Free" : tier === "premium" ? "Premium 👑" : "SuperVIP 💎"}`,
    status ? `*Swipes remaining today:* ${status.remaining}/${status.total}` : "",
    "",
    "*Free Plan:*",
    "• 10 swipes per day",
    "• Basic matching",
    "",
    "*Premium 👑 — " + PREMIUM_PRICE + "*",
    "• Unlimited swipes",
    "• Priority matching",
    "• See who liked you",
    "",
    "*SuperVIP 💎 — " + SUPERVIP_PRICE + "*",
    "• Everything in Premium",
    "• Verified badge",
    "• Advanced filters",
    "",
    "_Premium activation is currently manual. Contact support to upgrade._",
  ].filter(Boolean).join("\n");

  const keyboard = new InlineKeyboard()
    .text("🎁 Share for Free Swipes", "referral:show")
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
  const code = await getReferralCode(env, userId);
  const botUsername = ctx.me?.username ?? "YourBot";
  const link = `https://t.me/${botUsername}?start=ref_${code}`;

  const msg = [
    "🎁 *Invite Friends, Earn Swipes*",
    "",
    "Share your referral link with friends. When they join and complete their profile, *both of you get +5 bonus swipes!*",
    "",
    `*Your referral code:* \`${code ?? "N/A"}\``,
    "",
    `*Your link:* ${link}`,
    "",
    "Copy and share the link above with your friends!",
  ].join("\n");

  const keyboard = new InlineKeyboard()
    .url("📤 Share Link", `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join me on MeetMatch! 🎁")}`)
    .row()
    .text("❌ Close", "referral:close");

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

  if (data === "referral:close") {
    await ctx.deleteMessage().catch(() => {});
    await ctx.answerCallbackQuery().catch(() => {});
    return;
  }
};
