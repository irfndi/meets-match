import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";

async function fetchPotentialMatches(env: Env, userId: string, limit = 5) {
  const res = await env.API_SERVICE.fetch(
    new Request(`http://api/users/${userId}/potential-matches?limit=${limit}`)
  );
  if (!res.ok) return [];
  const data = await res.json() as { potentialMatches?: Array<Record<string, unknown>> };
  return data.potentialMatches ?? [];
}

function buildMatchKeyboard(matchId: string) {
  return new InlineKeyboard()
    .text("❤️ Like", `match:like:${matchId}`)
    .text("👎 Dislike", `match:dislike:${matchId}`)
    .row()
    .text("⏩ Skip", `match:skip:${matchId}`);
}

function formatProfile(user: Record<string, unknown>, index: number): string {
  const name = user.first_name ?? "Unknown";
  const age = user.age ?? "?";
  const bio = user.bio ? `\n📝 ${user.bio}` : "";
  const interests = user.interests ? `\n🌟 ${user.interests}` : "";
  return `${index}. ${name}, ${age}${bio}${interests}`;
}

export const matchCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply("Could not identify you. Try again.");
    return;
  }
  const userId = String(ctx.from.id);

  await ctx.reply("🔍 Finding matches for you...");

  const matches = await fetchPotentialMatches(env, userId, 5);
  if (matches.length === 0) {
    await ctx.reply(
      "No potential matches found right now. Complete your profile with /profile and try again!"
    );
    return;
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const text = formatProfile(match, i + 1);
    await ctx.reply(text, {
      reply_markup: buildMatchKeyboard(String(match.id)),
    });
  }
};

async function handleMatchAction(
  ctx: MyContext,
  env: Env,
  action: string,
  matchId: string
) {
  if (!ctx.from) return;
  const userId = String(ctx.from.id);

  const res = await env.API_SERVICE.fetch(
    new Request(`http://api/matches/${matchId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, action }),
    })
  );

  const result = await res.json() as { isMutual?: boolean; error?: string };

  if (action === "like" && result.isMutual) {
    await ctx.reply("💕 It's a match! You can now chat with each other.");
  } else if (action === "like") {
    await ctx.reply("❤️ You liked this profile!");
  } else if (action === "dislike") {
    await ctx.reply("👎 Profile skipped.");
  } else {
    await ctx.reply("⏩ Skipped.");
  }
  await ctx.answerCallbackQuery("Done!");
}

export const matchCallbacks = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.callbackQuery?.data) return;
  const data = ctx.callbackQuery.data;

  if (data.startsWith("match:like:")) {
    await handleMatchAction(ctx, env, "like", data.replace("match:like:", ""));
  } else if (data.startsWith("match:dislike:")) {
    await handleMatchAction(ctx, env, "dislike", data.replace("match:dislike:", ""));
  } else if (data.startsWith("match:skip:")) {
    await handleMatchAction(ctx, env, "skip", data.replace("match:skip:", ""));
  }
};
