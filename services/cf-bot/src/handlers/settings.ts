import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { startConversation } from "../lib/conversations.js";
import { ensureUserExists } from "../lib/user-utils.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";

function getSettingsKeyboard() {
  return new InlineKeyboard()
    .text("🎯 Age Range", "settings:age-range")
    .text("📍 Max Distance", "settings:distance")
    .row()
    .text("⚧ Gender Preference", "settings:gender-pref")
    .row()
    .text("❌ Close", "settings:close");
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
    case "settings:age-range":
      await startConversation(env.KV, userId, "age-range");
      await ctx.reply("Enter your preferred age range (e.g. *18-30*). Type *Cancel* to abort.", { parse_mode: "Markdown" });
      await ctx.answerCallbackQuery().catch(() => {});
      break;
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
      try {
        await ctx.deleteMessage();
      } catch (e) {
        if (e instanceof Error && e.message.includes("message to delete not found")) return;
        console.error("Failed to delete settings message:", e);
      }
      break;
    default:
      await ctx.answerCallbackQuery("Unknown setting.").catch(() => {});
  }
};
