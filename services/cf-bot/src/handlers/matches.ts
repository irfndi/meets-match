import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { ensureUserExists, getProfileCompleteness, getMissingFieldsDisplay } from "../lib/user-utils.js";

async function fetchMatches(env: Env, userId: string) {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}/potential-matches?limit=20`)
    );
    if (!res.ok) return [];
    const data = await res.json() as { potentialMatches?: Array<Record<string, unknown>> };
    return (data.potentialMatches ?? []).filter(
      (m: Record<string, unknown>) => m.status === "matched"
    );
  } catch {
    return [];
  }
}

function formatMatch(match: Record<string, unknown>): string {
  const name = (match.displayName ?? match.first_name ?? "Unknown") as string;
  const age = match.age ?? "?";
  const bio = match.bio ? `\n📝 ${match.bio}` : "";
  return `💕 ${name}, ${age}${bio}\nMatched at: ${match.matched_at ?? "recently"}`;
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
      `⚠️ You need to complete your profile before viewing matches.\n\nMissing fields:\n${getMissingFieldsDisplay(missing)}\n\nUse /profile to update your info.`
    );
    return;
  }

  const userId = String(ctx.from.id);

  const matches = await fetchMatches(env, userId);
  if (matches.length === 0) {
    await ctx.reply(
      "💑 No matches yet. Use /match to find potential matches, then like someone who likes you back!"
    );
    return;
  }

  await ctx.reply(`💑 You have ${matches.length} match(es):`);
  for (const match of matches) {
    await ctx.reply(formatMatch(match));
  }
};

export const matchesCallbacks = async (ctx: MyContext, _env: Env): Promise<void> => {
  await ctx.answerCallbackQuery("Match details coming soon.");
};
