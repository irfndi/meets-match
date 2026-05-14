import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { ensureUserExists, getProfileCompleteness, getMissingFieldsDisplay, isPhoneVerified } from "../lib/user-utils.js";
import { promptPhoneVerification } from "../lib/conversations.js";
import { getNotifications, removeNotification, type LikeNotification, type MutualMatchNotification } from "../lib/notifications.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import { type Language } from "../lib/i18n.js";
import { ApiServiceClient } from "../services/api-client.js";

function buildChatLink(otherUser: Record<string, unknown>): string {
  const username = otherUser.username as string | undefined;
  const displayName = (otherUser.displayName ?? otherUser.first_name ?? "Someone") as string;
  if (username) {
    return `💬 [Chat with ${displayName}](https://t.me/${username})`;
  }
  return `💬 ${displayName} (no username set)`;
}

function formatMatch(match: Record<string, unknown>): string {
  const name = (match.displayName ?? match.first_name ?? "Unknown") as string;
  const age = match.age ?? "?";
  const bio = match.bio ? `\n📝 ${match.bio}` : "";
  return `💕 ${name}, ${age}${bio}\nMatched at: ${match.matched_at ?? "recently"}`;
}

async function fetchMutualMatches(env: Env, userId: string) {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/matches?userId=${userId}&status=MATCHED&limit=50`)
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { matches?: Array<Record<string, unknown>> };
    return data.matches ?? [];
  } catch {
    return [];
  }
}

async function fetchPendingLikes(env: Env, userId: string) {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}/pending-likes`)
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { pendingLikes?: Array<Record<string, unknown>> };
    return data.pendingLikes ?? [];
  } catch {
    return [];
  }
}

export const matchesCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply("Could not identify you. Try again.");
    return;
  }

  const result = await ensureUserExists(ctx, env);
  if (!result) {
    await ctx.reply("❌ Sorry, there was an error. Please try /start first.");
    return;
  }

  const { user } = result;
  const { complete, missing } = getProfileCompleteness(user);

  if (!complete) {
    await ctx.reply(
      `⚠️ *Almost there!*\n\nComplete your profile before viewing matches:\n\n${getMissingFieldsDisplay(missing)}\n\nTap *👤 Profile* to finish setting up.`,
      { parse_mode: "Markdown", reply_markup: getMainMenuKeyboard() }
    );
    return;
  }

  const lang = (user.language as Language) ?? 'en';
  if (!isPhoneVerified(user)) {
    await promptPhoneVerification(ctx, env, lang);
    return;
  }

  const userId = String(ctx.from.id);

  // 1. Show stored notifications (mutual matches + likes)
  const notifications = await getNotifications(env, userId);
  const mutualNotifications = notifications.filter((n): n is MutualMatchNotification => n.type === "mutual_match");
  const likeNotifications = notifications.filter((n): n is LikeNotification => n.type === "like");

  if (mutualNotifications.length > 0) {
    await ctx.reply(`💕 You have ${mutualNotifications.length} new mutual match(es)!`);
    for (const notif of mutualNotifications) {
      const msg = [
        `💕 It's a match with ${notif.otherDisplayName}!`,
        buildChatLink({ displayName: notif.otherDisplayName, username: notif.otherUsername }),
      ].join("\n");
      await ctx.reply(msg, { parse_mode: "Markdown" });
    }
  }

  if (likeNotifications.length > 0) {
    const keyboard = new InlineKeyboard();
    for (let i = 0; i < likeNotifications.length; i++) {
      const notif = likeNotifications[i];
      keyboard.text(`❤️ ${notif.fromDisplayName}`, `likes:view:${notif.fromUserId}`).row();
    }
    keyboard.text("⏭ Dismiss all", "likes:dismiss");
    await ctx.reply(
      `💕 ${likeNotifications.length} person(s) liked your profile! Want to check them out?`,
      { reply_markup: keyboard }
    );
  }

  // 2. Fetch mutual matches from API
  const mutualMatches = await fetchMutualMatches(env, userId);

  // 3. Fetch pending likes from API (users who liked you but you haven't responded)
  const pendingLikes = await fetchPendingLikes(env, userId);

  const totalMatches = mutualMatches.length;
  const totalPending = pendingLikes.length;

  if (totalMatches === 0 && totalPending === 0 && notifications.length === 0) {
    await ctx.reply(
      "💑 *No matches yet.*\n\nUse *🔍 Find Match* to discover people, then like someone who likes you back!",
      { parse_mode: "Markdown", reply_markup: getMainMenuKeyboard() }
    );
    return;
  }

  if (totalMatches > 0) {
    await ctx.reply(`💑 You have ${totalMatches} mutual match(es):`);
    for (const match of mutualMatches) {
      // Fetch the other user's profile
      const otherUserId = match.user1Id === userId ? match.user2Id : match.user1Id;
      try {
        const client = new ApiServiceClient(env.API_SERVICE);
        const userRes = await client.getUser({ userId: String(otherUserId) });
        const otherUser = userRes.user as Record<string, unknown>;
        const msg = formatMatch(otherUser);
        const chatLink = buildChatLink(otherUser);
        await ctx.reply(`${msg}\n${chatLink}`, { parse_mode: "Markdown" });
      } catch {
        await ctx.reply(formatMatch(match));
      }
    }
  }

  if (totalPending > 0) {
    const keyboard = new InlineKeyboard();
    for (const pending of pendingLikes) {
      const name = (pending.displayName ?? pending.first_name ?? "Someone") as string;
      keyboard.text(`❤️ ${name}`, `likes:view:${pending.id}`).row();
    }
    await ctx.reply(
      `💕 ${totalPending} person(s) liked you! See them now?`,
      { reply_markup: keyboard }
    );
  }
};

export const matchesCallbacks = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from || !ctx.callbackQuery?.data) {
    await ctx.answerCallbackQuery().catch(() => {});
    return;
  }
  const userId = String(ctx.from.id);
  const data = ctx.callbackQuery.data;

  if (data === "likes:dismiss") {
    const notifications = await getNotifications(env, userId);
    // Remove from end to beginning to preserve indices
    for (let i = notifications.length - 1; i >= 0; i--) {
      if (notifications[i].type === "like") {
        await removeNotification(env, userId, i);
      }
    }
    await ctx.answerCallbackQuery("Dismissed.");
    await ctx.editMessageText("💕 You can see your likes anytime with /matches.");
    return;
  }

  if (data.startsWith("likes:view:")) {
    const targetUserId = data.replace("likes:view:", "");
    await ctx.answerCallbackQuery("Loading profile...");

    try {
      const client = new ApiServiceClient(env.API_SERVICE);
      const userRes = await client.getUser({ userId: targetUserId });
      const targetUser = userRes.user as Record<string, unknown>;
      const name = (targetUser.displayName ?? targetUser.first_name ?? "Unknown") as string;
      const age = targetUser.age ?? "?";
      const bio = targetUser.bio ? `\n📝 ${targetUser.bio}` : "";
      const interests = targetUser.interests
        ? `\n🌟 ${Array.isArray(targetUser.interests) ? (targetUser.interests as string[]).join(", ") : String(targetUser.interests)}`
        : "";

      const keyboard = new InlineKeyboard()
        .text("❤️ Like back", `match:like:${targetUserId}`)
        .text("👎 Pass", `match:dislike:${targetUserId}`)
        .row();

      await ctx.reply(`${name}, ${age}${bio}${interests}`, { reply_markup: keyboard });

      // Remove this like notification
      const notifications = await getNotifications(env, userId);
      const idx = notifications.findIndex((n) => n.type === "like" && n.fromUserId === targetUserId);
      if (idx >= 0) await removeNotification(env, userId, idx);
    } catch {
      await ctx.reply("Could not load profile. Please try again.");
    }
    return;
  }

  await ctx.answerCallbackQuery("Unknown action.");
};
