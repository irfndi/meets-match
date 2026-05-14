import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";

async function fetchPotentialMatches(env: Env, userId: string, limit = 5) {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}/potential-matches?limit=${limit}`)
    );
    if (!res.ok) return [];
    const data = await res.json() as { potentialMatches?: Array<Record<string, unknown>> };
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

export const matchCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply("Could not identify you. Try again.");
    return;
  }
  const userId = String(ctx.from.id);

  await ctx.reply("🔍 Finding matches for you...");

  const users = await fetchPotentialMatches(env, userId, 5);
  if (users.length === 0) {
    await ctx.reply(
      "No potential matches found right now. Complete your profile with /profile and try again!"
    );
    return;
  }

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const text = formatProfile(user, i + 1);
    await ctx.reply(text, {
      reply_markup: buildMatchKeyboard(String(user.id)),
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
    await ctx.answerCallbackQuery("Could not identify you.");
    return;
  }
  const userId = String(ctx.from.id);

  try {
    const createRes = await env.API_SERVICE.fetch(
      new Request("http://api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user1Id: userId, user2Id: targetUserId }),
      })
    );
    if (!createRes.ok) {
      await ctx.answerCallbackQuery("Failed to process. Try again.");
      return;
    }
    const created = await createRes.json() as { id?: string };
    const matchId = created.id;
    if (!matchId) {
      await ctx.answerCallbackQuery("Failed to create match. Try again.");
      return;
    }

    const actionRes = await env.API_SERVICE.fetch(
      new Request(`http://api/matches/${matchId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      })
    );

    const result = await actionRes.json() as { isMutual?: boolean };

    if (action === "like" && result.isMutual) {
      await ctx.reply("💕 It's a match! You can now chat with each other.");
    } else if (action === "like") {
      await ctx.reply("❤️ You liked this profile!");
    } else if (action === "dislike") {
      await ctx.reply("👎 Profile skipped.");
    } else {
      await ctx.reply("⏩ Skipped.");
    }
  } catch {
    await ctx.reply("Something went wrong. Please try again.");
  }
  await ctx.answerCallbackQuery("Done!");
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
    await ctx.answerCallbackQuery("Unknown action.");
  }
};
