import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import {
  startConversation,
  setConversationState,
  clearConversationState,
  getConversationState,
} from "../lib/conversations.js";
import {
  ensureUserExists,
  computeAgeFromBirthDate,
  getDefaultPreferences,
} from "../lib/user-utils.js";
import { ApiServiceClient } from "../services/api-client.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import { createLogger } from "@meetsmatch/cf-shared";
import { replyWithError } from "../lib/error-feedback.js";

const log = createLogger("cf-bot");
import { t, DEFAULT_LANGUAGE, type Language, escapeMd } from "../lib/i18n.js";

function getSettingsKeyboard() {
  return new InlineKeyboard()
    .text("🎯 Age Range", "settings:age-range")
    .text("📍 Max Distance", "settings:distance")
    .row()
    .text("⚧ Gender Preference", "settings:gender-pref")
    .row()
    .text("❌ Close", "settings:close");
}

function buildDistanceKeyboard(): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const values = [5, 10, 25, 50, 100, 200];
  values.forEach((val, i) => {
    keyboard.text(`${val} km`, `distance:${val}`);
    if ((i + 1) % 3 === 0) keyboard.row();
  });
  if (values.length % 3 !== 0) keyboard.row();
  keyboard.text("✏️ Type manually", "distance:manual").row();
  keyboard.text("← Back", "settings:back");
  return keyboard;
}

function buildGenderPrefKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("♂️ Male", "genderpref:male")
    .text("♀️ Female", "genderpref:female")
    .row()
    .text("⚧ Other", "genderpref:other")
    .text("🤫 Prefer not to say", "genderpref:prefer_not_to_say")
    .row()
    .text("✅ All genders", "genderpref:all")
    .row()
    .text("← Back", "settings:back");
}

function buildAgeGridKeyboard(
  prefix: "min" | "max",
  userAge: number,
  selectedMin?: number,
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

export const settingsCommand = async (
  ctx: MyContext,
  env: Env,
): Promise<void> => {
  if (!ctx.from) return;

  try {
    const result = await ensureUserExists(ctx, env);
    if (!result) {
      await ctx.reply("❌ Sorry, there was an error. Please try /start first.");
      return;
    }

    const userId = String(ctx.from.id);
    const rawPrefs = await fetchUserPreferences(env, userId);
    const defaults = getDefaultPreferences(
      result.user as unknown as Record<string, unknown>,
    );
    // Merge defaults with existing prefs so partially set preferences
    // still show calculated defaults for unset fields
    const prefs = { ...defaults, ...rawPrefs };

    const ageRange =
      prefs?.minAge !== undefined && prefs?.maxAge !== undefined
        ? `${prefs.minAge}–${prefs.maxAge}`
        : "Not set";
    const distance =
      prefs?.maxDistance !== undefined ? `${prefs.maxDistance} km` : "Not set";
    const genderPref =
      prefs?.genderPreference !== undefined &&
      Array.isArray(prefs.genderPreference) &&
      prefs.genderPreference.length > 0
        ? (prefs.genderPreference as string[]).join(", ")
        : "Not set";

    const lang = (result.user.language as Language) ?? DEFAULT_LANGUAGE;
    const lines = [
      t("settingsTitle", lang),
      "",
      "*Current Preferences:*",
      `🎯 Age Range: ${escapeMd(ageRange)}`,
      `📍 Max Distance: ${escapeMd(distance)}`,
      `⚧ Gender Preference: ${escapeMd(genderPref)}`,
      "",
      "Tap a field below to change it:",
    ];

    await ctx.reply(lines.join("\n"), {
      parse_mode: "Markdown",
      reply_markup: getSettingsKeyboard(),
    });
  } catch (error) {
    log.error("settingsCommand", "Unhandled error", undefined, error);
    await replyWithError(ctx, env, "en", { command: "settings" });
  }
};

export const settingsCallbacks = async (
  ctx: MyContext,
  env: Env,
): Promise<void> => {
  if (!ctx.from || !ctx.callbackQuery?.data) return;
  const userId = String(ctx.from.id);
  const data = ctx.callbackQuery.data;

  try {
    // Fetch user once for language and defaults
    const userRes = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    let userData: Record<string, unknown> | undefined;
    let userAge = 25;
    let lang: Language = "en";
    if (userRes.ok) {
      const json = (await userRes.json()) as { user?: Record<string, unknown> };
      userData = json.user;
      const bd = userData?.birthDate as string | undefined;
      const age = userData?.age as number | undefined;
      userAge = (bd ? computeAgeFromBirthDate(bd) : age) ?? 25;
      lang = (userData?.language as Language) ?? "en";
    }

    switch (data) {
      case "settings:age-range": {
        await startConversation(env.KV, userId, "age-range");
        await ctx.reply(t("ageRangeSelectMin", lang), {
          reply_markup: buildAgeGridKeyboard("min", userAge),
        });
        await ctx.answerCallbackQuery().catch(() => {});
        break;
      }
      case "settings:distance": {
        await ctx.reply(t("distanceSelect", lang), {
          reply_markup: buildDistanceKeyboard(),
        });
        await ctx.answerCallbackQuery().catch(() => {});
        break;
      }
      case "settings:gender-pref": {
        await ctx.reply(t("genderPrefSelect", lang), {
          reply_markup: buildGenderPrefKeyboard(),
        });
        await ctx.answerCallbackQuery().catch(() => {});
        break;
      }
      case "settings:close":
        await ctx.answerCallbackQuery("Settings closed.").catch(() => {});
        await ctx.deleteMessage().catch(() => {});
        await ctx.reply("👇 Use the menu below to navigate:", {
          reply_markup: getMainMenuKeyboard(),
        });
        break;
      default:
        await ctx.answerCallbackQuery("Unknown setting.").catch(() => {});
    }
  } catch (error) {
    log.error("settingsCallbacks", "Unhandled error", undefined, error);
    await replyWithError(ctx, env, "en", { action: "settings_callback" });
    await ctx.answerCallbackQuery().catch(() => {});
  }
};

export async function handleAgeRangeCallback(
  ctx: MyContext,
  env: Env,
  data: string,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);

  try {
    // Fetch user age for dynamic grid
    const userRes = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    let userAge = 25;
    let lang: Language = "en";
    let userData: { user?: Record<string, unknown> } | undefined;
    if (userRes.ok) {
      userData = (await userRes.json()) as { user?: Record<string, unknown> };
      const bd = userData.user?.birthDate as string | undefined;
      const age = userData.user?.age as number | undefined;
      userAge = (bd ? computeAgeFromBirthDate(bd) : age) ?? 25;
      lang = (userData.user?.language as Language) ?? "en";
    }

    if (data.startsWith("agerange:manual:")) {
      const prefix = data.replace("agerange:manual:", "") as "min" | "max";
      if (prefix === "min") {
        await startConversation(env.KV, userId, "age-range");
        await ctx.reply(
          "Enter minimum age (12–80), or type a range like *18-25*. Type *Cancel* to abort.",
          { parse_mode: "Markdown" },
        );
      } else {
        const state = await getConversationState(env.KV, userId);
        const min = (state?.data?.min as number) ?? 12;
        await setConversationState(env.KV, {
          userId,
          field: "age-range",
          step: 1,
          data: { min },
        });
        await ctx.reply(
          "Enter maximum age (must be ≥ minimum). Type *Cancel* to abort.",
          { parse_mode: "Markdown" },
        );
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
      await setConversationState(env.KV, {
        userId,
        field: "age-range",
        step: 1,
        data: { min },
      });
      await ctx
        .editMessageText(t("ageRangeSelectMax", lang, { min: String(min) }), {
          parse_mode: "Markdown",
          reply_markup: buildAgeGridKeyboard("max", userAge, min),
        })
        .catch(() => {});
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

      const existing = userData?.user?.preferences as
        | Record<string, unknown>
        | undefined;
      const success = await updateUserPreferences(env, userId, {
        ...(existing ?? {}),
        minAge: min,
        maxAge: max,
      });
      await clearConversationState(env.KV, userId);

      if (success) {
        await ctx
          .editMessageText(
            t("ageRangeUpdated", lang, { min: String(min), max: String(max) }),
            {
              parse_mode: "Markdown",
            },
          )
          .catch(() => {});
        await ctx.reply("👇 Use the menu below to navigate:", {
          reply_markup: getMainMenuKeyboard(),
        });
      } else {
        await ctx
          .reply(t("genericError", lang), {
            reply_markup: getMainMenuKeyboard(),
          })
          .catch(() => {});
      }
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }

    return false;
  } catch (error) {
    log.error("handleAgeRangeCallback", "Unhandled error", undefined, error);
    await ctx.answerCallbackQuery("❌ Something went wrong.").catch(() => {});
    return false;
  }
}

export async function handleDistanceCallback(
  ctx: MyContext,
  env: Env,
  data: string,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);

  try {
    const userRes = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    let lang: Language = "en";
    let userData: { user?: Record<string, unknown> } | undefined;
    if (userRes.ok) {
      userData = (await userRes.json()) as { user?: Record<string, unknown> };
      lang = (userData.user?.language as Language) ?? "en";
    }

    if (data === "distance:manual") {
      await startConversation(env.KV, userId, "distance");
      await ctx.reply(
        "Enter max distance in km (e.g. *50*). Type *Cancel* to abort.",
        { parse_mode: "Markdown" },
      );
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }

    if (data.startsWith("distance:")) {
      const val = parseInt(data.replace("distance:", ""), 10);
      if (Number.isNaN(val) || val < 1 || val > 500) {
        await ctx.answerCallbackQuery("Invalid distance.").catch(() => {});
        return true;
      }
      const existing = userData?.user?.preferences as
        | Record<string, unknown>
        | undefined;
      const success = await updateUserPreferences(env, userId, {
        ...(existing ?? {}),
        maxDistance: val,
      });
      if (success) {
        await ctx
          .editMessageText(
            t("distanceUpdated", lang, { distance: String(val) }),
            { parse_mode: "Markdown" },
          )
          .catch(() => {});
        await ctx.reply("👇 Use the menu below to navigate:", {
          reply_markup: getMainMenuKeyboard(),
        });
      } else {
        await ctx
          .reply(t("genericError", lang), {
            reply_markup: getMainMenuKeyboard(),
          })
          .catch(() => {});
      }
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }

    return false;
  } catch (error) {
    log.error("handleDistanceCallback", "Unhandled error", undefined, error);
    await ctx.answerCallbackQuery("❌ Something went wrong.").catch(() => {});
    return false;
  }
}

export async function handleGenderPrefCallback(
  ctx: MyContext,
  env: Env,
  data: string,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);

  try {
    const userRes = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    let lang: Language = "en";
    let existing: Record<string, unknown> | undefined;
    if (userRes.ok) {
      const userData = (await userRes.json()) as {
        user?: Record<string, unknown>;
      };
      lang = (userData.user?.language as Language) ?? "en";
      existing = userData.user?.preferences as
        | Record<string, unknown>
        | undefined;
    }

    let selected: string[] = [];
    switch (data) {
      case "genderpref:male":
        selected = ["male"];
        break;
      case "genderpref:female":
        selected = ["female"];
        break;
      case "genderpref:other":
        selected = ["other"];
        break;
      case "genderpref:prefer_not_to_say":
        selected = ["prefer_not_to_say"];
        break;
      case "genderpref:all":
        selected = ["male", "female", "other", "prefer_not_to_say"];
        break;
      default:
        return false;
    }

    const success = await updateUserPreferences(env, userId, {
      ...(existing ?? {}),
      genderPreference: selected,
    });
    if (success) {
      await ctx
        .editMessageText(
          t("genderPrefUpdated", lang, { preferences: selected.join(", ") }),
          { parse_mode: "Markdown" },
        )
        .catch(() => {});
      await ctx.reply("👇 Use the menu below to navigate:", {
        reply_markup: getMainMenuKeyboard(),
      });
    } else {
      await ctx
        .reply(t("genericError", lang), { reply_markup: getMainMenuKeyboard() })
        .catch(() => {});
    }
    await ctx.answerCallbackQuery().catch(() => {});
    return true;
  } catch (error) {
    log.error("handleGenderPrefCallback", "Unhandled error", undefined, error);
    await ctx.answerCallbackQuery("❌ Something went wrong.").catch(() => {});
    return false;
  }
}

async function fetchUserPreferences(
  env: Env,
  userId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { user?: Record<string, unknown> };
    const user = data.user;
    if (!user) return null;
    return (user.preferences as Record<string, unknown>) ?? {};
  } catch (error) {
    log.error(
      "fetchUserPreferences",
      "Failed to fetch user preferences",
      { userId },
      error,
    );
    return null;
  }
}

async function updateUserPreferences(
  env: Env,
  userId: string,
  prefs: Record<string, unknown>,
): Promise<boolean> {
  try {
    const response = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ user: { preferences: prefs } }),
        headers: { "Content-Type": "application/json" },
      }),
    );
    return response.ok;
  } catch (error) {
    log.error(
      "updateUserPreferences",
      "Failed to update user preferences",
      { userId },
      error,
    );
    return false;
  }
}
