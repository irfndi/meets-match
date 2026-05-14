import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { ensureUserExists, getProfileCompleteness, getMissingFieldsDisplay, isPhoneVerified, type UserProfile } from "../lib/user-utils.js";
import { addNotification } from "../lib/notifications.js";
import { promptPhoneVerification } from "../lib/conversations.js";
import { ApiServiceClient } from "../services/api-client.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import { t, type Language } from "../lib/i18n.js";

function getLang(user: Record<string, unknown> | UserProfile): Language {
  return (user.language as Language) ?? "en";
}

async function fetchUserLang(env: Env, userId: string): Promise<Language> {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" })
    );
    if (!res.ok) return "en";
    const data = (await res.json()) as { user?: Record<string, unknown> };
    return getLang(data.user ?? {});
  } catch {
    return "en";
  }
}

async function fetchPotentialMatches(env: Env, userId: string, limit = 5) {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}/potential-matches?limit=${limit}`)
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { potentialMatches?: Array<Record<string, unknown>> };
    return data.potentialMatches ?? [];
  } catch {
    return [];
  }
}

function buildMatchKeyboard(targetUserId: string) {
  return new InlineKeyboard()
    .text("❤️ Like", `match:like:${targetUserId}`)
    .text("👎 Dislike", `match:dislike:${targetUserId}`)
    .row()
    .text("⏩ Skip", `match:skip:${targetUserId}`);
}

function formatProfile(user: Record<string, unknown>, index: number): string {
  const name = (user.displayName ?? user.first_name ?? "Unknown") as string;
  const age = user.age ?? "?";
  const bio = user.bio ? `\n📝 ${user.bio}` : "";
  const interests = user.interests
    ? `\n🌟 ${Array.isArray(user.interests) ? (user.interests as string[]).join(", ") : String(user.interests)}`
    : "";
  return `${index}. ${name}, ${age}${bio}${interests}`;
}

function getGenderPronoun(gender: string | undefined): string {
  switch (gender) {
    case "male": return "him";
    case "female": return "her";
    default: return "them";
  }
}

function buildMatchCard(otherUser: Record<string, unknown>): string {
  const name = (otherUser.displayName ?? otherUser.first_name ?? "Someone") as string;
  const age = otherUser.age ?? "?";
  const loc = otherUser.location as Record<string, unknown> | undefined;
  const locationText = loc?.city && loc?.country
    ? `${loc.city}, ${loc.country}`
    : loc?.latitude
      ? "📍 Nearby"
      : "";
  const bio = otherUser.bio ? `\n📝 ${otherUser.bio}` : "";
  const interests = otherUser.interests
    ? `\n🌟 ${Array.isArray(otherUser.interests) ? (otherUser.interests as string[]).join(", ") : String(otherUser.interests)}`
    : "";

  const parts = [`👤 ${name}, ${age}`];
  if (locationText) parts.push(`📍 ${locationText}`);
  if (bio) parts.push(bio);
  if (interests) parts.push(interests);
  return parts.join("\n");
}

function buildChatLink(otherUser: Record<string, unknown>): string {
  const username = otherUser.username as string | undefined;
  const displayName = (otherUser.displayName ?? otherUser.first_name ?? "Someone") as string;
  if (username) {
    return `👉 [Start chatting with ${displayName}](https://t.me/${username})`;
  }
  return `💬 ${displayName} hasn't set a username yet. You can share your username with them!`;
}

export const matchCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply("Could not identify you. Try again.");
    return;
  }

  const result = await ensureUserExists(ctx, env);
  if (!result) {
    await ctx.reply(t("genericError"));
    return;
  }

  const { user } = result;
  const lang = getLang(user);
  const { complete, missing } = getProfileCompleteness(user);

  if (!complete) {
    await ctx.reply(
      t("matchProfileIncomplete", lang, { missing: getMissingFieldsDisplay(missing) })
    );
    return;
  }

  if (!isPhoneVerified(user)) {
    await promptPhoneVerification(ctx, env, lang);
    return;
  }

  const userId = String(ctx.from.id);

  await ctx.reply(t("matchFinding", lang), {
    parse_mode: "Markdown",
    reply_markup: getMainMenuKeyboard(),
  });

  const users = await fetchPotentialMatches(env, userId, 5);
  if (users.length === 0) {
    await ctx.reply(t("matchNoMatches", lang), {
      parse_mode: "Markdown",
      reply_markup: getMainMenuKeyboard(),
    });
    return;
  }

  for (const potentialMatch of users) {
    const text = buildMatchCard(potentialMatch);
    await ctx.reply(text, {
      reply_markup: buildMatchKeyboard(String(potentialMatch.id)),
    });
  }
};

async function handleMatchAction(
  ctx: MyContext,
  env: Env,
  action: string,
  targetUserId: string
) {
  if (!ctx.from) {
    await ctx.answerCallbackQuery("Could not identify you.").catch(() => {});
    return;
  }
  const userId = String(ctx.from.id);
  const myName = ctx.from.first_name ?? "Someone";
  const lang = await fetchUserLang(env, userId);

  try {
    const client = new ApiServiceClient(env.API_SERVICE);

    // Create match (normalized in API layer)
    const createRes = await client.createMatch({ user1Id: userId, user2Id: targetUserId });
    const matchId = createRes.match.id;

    if (action === "like") {
      const likeRes = await client.likeMatch({ matchId, userId });

      if (likeRes.isMutual) {
        // Get other user details for chat link
        const otherUserRes = await client.getUser({ userId: targetUserId });
        const otherUser = otherUserRes.user as Record<string, unknown>;
        const name = (otherUser.displayName ?? otherUser.first_name ?? "Someone") as string;
        const username = otherUser.username as string | undefined;
        const pronoun = getGenderPronoun(otherUser.gender as string);
        const chatLink = buildChatLink(otherUser);

        // Modern, engaging match message
        await ctx.reply(
          t("matchItsAMatch", lang, { name }),
          { parse_mode: "Markdown" }
        );

        await ctx.reply(
          `${chatLink}\n\n${t("matchSayHiTo", lang, { pronoun })}`,
          { parse_mode: "Markdown", link_preview_options: { is_disabled: false } }
        );

        // Store notification for the other user
        await addNotification(env, targetUserId, {
          type: "mutual_match",
          matchId,
          otherUserId: userId,
          otherDisplayName: myName,
          otherUsername: ctx.from.username ?? undefined,
          timestamp: new Date().toISOString(),
        });
      } else {
        await ctx.reply(t("matchLikeSuccess", lang), { reply_markup: getMainMenuKeyboard() });

        // Store like notification for target user
        await addNotification(env, targetUserId, {
          type: "like",
          fromUserId: userId,
          fromDisplayName: myName,
          timestamp: new Date().toISOString(),
        });
      }
    } else if (action === "dislike") {
      await env.API_SERVICE.fetch(
        new Request(`http://api/matches/${matchId}/dislike`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        })
      );
      await ctx.reply(t("matchDislikeSuccess", lang), { reply_markup: getMainMenuKeyboard() });
    } else if (action === "skip") {
      await env.API_SERVICE.fetch(
        new Request(`http://api/matches/${matchId}/skip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        })
      );
      await ctx.reply(t("matchSkipSuccess", lang), { reply_markup: getMainMenuKeyboard() });
    }
  } catch (error) {
    console.error("Match action error:", error);
    await ctx.reply(t("matchError", lang), { reply_markup: getMainMenuKeyboard() });
  }
  await ctx.answerCallbackQuery("Done!").catch(() => {});
}

export const matchCallbacks = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.callbackQuery?.data) {
    await ctx.answerCallbackQuery().catch(() => {});
    return;
  }
  const data = ctx.callbackQuery.data;

  if (data.startsWith("match:like:")) {
    await handleMatchAction(ctx, env, "like", data.replace("match:like:", ""));
  } else if (data.startsWith("match:dislike:")) {
    await handleMatchAction(ctx, env, "dislike", data.replace("match:dislike:", ""));
  } else if (data.startsWith("match:skip:")) {
    await handleMatchAction(ctx, env, "skip", data.replace("match:skip:", ""));
  } else {
    await ctx.answerCallbackQuery("Unknown action.").catch(() => {});
  }
};
