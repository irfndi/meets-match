import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { startConversation, setConversationState, clearConversationState, getConversationState } from "../lib/conversations.js";
import { ensureUserExists, computeAgeFromBirthDate } from "../lib/user-utils.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import { t, type Language } from "../lib/i18n.js";

function getSettingsKeyboard() {
  return new InlineKeyboard()
    .text("🎯 Age Range", "settings:age-range")
    .text("📍 Max Distance", "settings:distance")
    .row()
    .text("⚧ Gender Preference", "settings:gender-pref")
    .row()
    .text("❌ Close", "settings:close");
}

function buildAgeGridKeyboard(
  prefix: "min" | "max",
  userAge: number,
  selectedMin?: number
): InlineKeyboard {
  const gridStart = Math.max(12, userAge - 13);
  const gridEnd = Math.min(80, userAge + 15);
  const keyboard = new InlineKeyboard();

  let count = 0;
  for (let age = gridStart; age <= gridEnd; age++) {
    // For max selection, skip ages below the selected min
    if (prefix === "max" && selectedMin !== undefined && age < selectedMin) {
      continue;
    }
    const label = String(age);
    const callback = `agerange:${prefix}:${age}`;
    keyboard.text(label, callback);
    count++;
    if (count % 6 === 0) {
      keyboard.row();
    }
  }
  if (count % 6 !== 0) {
    keyboard.row();
  }

  keyboard.text("✏️ Type manually", `agerange:manual:${prefix}`).row();
  return keyboard;
}

export const settingsCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) return;

  const result = await ensureUserExists(ctx, env);
  if (!result) {
    await ctx.reply('❌ Sorry, there was an error. Please try /start first.');
    return;
  }

  await ctx.reply("⚙️ *Settings*\n\nAdjust your match preferences:", {
    parse_mode: "Markdown",
    reply_markup: getSettingsKeyboard(),
  });
};

export const settingsCallbacks = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from || !ctx.callbackQuery?.data) return;
  const userId = String(ctx.from.id);
  const data = ctx.callbackQuery.data;

  switch (data) {
    case "settings:age-range": {
      // Fetch user to get their age for dynamic grid
      const userRes = await env.API_SERVICE.fetch(
        new Request(`http://api/users/${userId}`, { method: "GET" })
      );
      let userAge = 25;
      if (userRes.ok) {
        const userData = await userRes.json() as { user?: Record<string, unknown> };
        const bd = userData.user?.birthDate as string | undefined;
        const age = userData.user?.age as number | undefined;
        userAge = (bd ? computeAgeFromBirthDate(bd) : age) ?? 25;
      }

      await startConversation(env.KV, userId, "age-range");
      await ctx.reply(t("ageRangeSelectMin", "en"), {
        reply_markup: buildAgeGridKeyboard("min", userAge),
      });
      await ctx.answerCallbackQuery().catch(() => {});
      break;
    }
    case "settings:distance":
      await startConversation(env.KV, userId, "distance");
      await ctx.reply("Enter max distance in km (e.g. *50*). Type *Cancel* to abort.", { parse_mode: "Markdown" });
      await ctx.answerCallbackQuery().catch(() => {});
      break;
    case "settings:gender-pref":
      await startConversation(env.KV, userId, "gender-pref");
      await ctx.reply("Enter preferred genders separated by commas (*male, female, other, prefer_not_to_say*). Type *Cancel* to abort.", { parse_mode: "Markdown" });
      await ctx.answerCallbackQuery().catch(() => {});
      break;
    case "settings:close":
      await ctx.answerCallbackQuery("Settings closed.").catch(() => {});
      await ctx.deleteMessage().catch(() => {});
      break;
    default:
      await ctx.answerCallbackQuery("Unknown setting.").catch(() => {});
  }
};

export async function handleAgeRangeCallback(ctx: MyContext, env: Env, data: string): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);

  // Fetch user age for dynamic grid
  const userRes = await env.API_SERVICE.fetch(
    new Request(`http://api/users/${userId}`, { method: "GET" })
  );
  let userAge = 25;
  if (userRes.ok) {
    const userData = await userRes.json() as { user?: Record<string, unknown> };
    const bd = userData.user?.birthDate as string | undefined;
    const age = userData.user?.age as number | undefined;
    userAge = (bd ? computeAgeFromBirthDate(bd) : age) ?? 25;
  }

  if (data.startsWith("agerange:manual:")) {
    const prefix = data.replace("agerange:manual:", "") as "min" | "max";
    if (prefix === "min") {
      await startConversation(env.KV, userId, "age-range");
      await ctx.reply("Enter minimum age (12–80), or type a range like *18-25*. Type *Cancel* to abort.", { parse_mode: "Markdown" });
    } else {
      const state = await getConversationState(env.KV, userId);
      const min = (state?.data?.min as number) ?? 12;
      await setConversationState(env.KV, { userId, field: "age-range", step: 1, data: { min } });
      await ctx.reply("Enter maximum age (must be ≥ minimum). Type *Cancel* to abort.", { parse_mode: "Markdown" });
    }
    await ctx.answerCallbackQuery().catch(() => {});
    return true;
  }

  if (data.startsWith("agerange:min:")) {
    const min = parseInt(data.replace("agerange:min:", ""), 10);
    if (Number.isNaN(min)) {
      await ctx.answerCallbackQuery("Invalid selection.").catch(() => {});
      return true;
    }
    await setConversationState(env.KV, { userId, field: "age-range", step: 1, data: { min } });
    await ctx.editMessageText(t("ageRangeSelectMax", "en", { min: String(min) }), {
      parse_mode: "Markdown",
      reply_markup: buildAgeGridKeyboard("max", userAge, min),
    }).catch(() => {});
    await ctx.answerCallbackQuery().catch(() => {});
    return true;
  }

  if (data.startsWith("agerange:max:")) {
    const max = parseInt(data.replace("agerange:max:", ""), 10);
    if (Number.isNaN(max)) {
      await ctx.answerCallbackQuery("Invalid selection.").catch(() => {});
      return true;
    }
    const state = await getConversationState(env.KV, userId);
    const min = (state?.data?.min as number) ?? 12;

    if (max < min) {
      await ctx.answerCallbackQuery(`Max must be ≥ ${min}`).catch(() => {});
      return true;
    }

    const success = await updateUserPreferences(env, userId, { minAge: min, maxAge: max });
    await clearConversationState(env.KV, userId);

    if (success) {
      await ctx.editMessageText(t("ageRangeUpdated", "en", { min: String(min), max: String(max) }), {
        parse_mode: "Markdown",
      }).catch(() => {});
    } else {
      await ctx.reply(t("genericError", "en")).catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    return true;
  }

  return false;
}

async function updateUserPreferences(
  env: Env,
  userId: string,
  prefs: Record<string, unknown>
): Promise<boolean> {
  try {
    const response = await env.API_SERVICE.fetch(new Request(`http://api/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ user: { preferences: prefs } }),
      headers: { "Content-Type": "application/json" },
    }));
    return response.ok;
  } catch {
    return false;
  }
}
