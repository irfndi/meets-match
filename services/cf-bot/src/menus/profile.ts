import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import { startConversation } from "../lib/conversations.js";
import type { Env } from "../index.js";
import { t, type Language } from "../lib/i18n.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import type { UserProfile } from "../lib/user-utils.js";

export function getProfileMenu(env: Env, mediaCount = 0) {
  return new InlineKeyboard()
    .text("📝 Bio", "profile:bio")
    .text("🎂 Age", "profile:birthdate")
    .row()
    .text("👤 Name", "profile:name")
    .text("⚧ Gender", "profile:gender")
    .row()
    .text("🌟 Interests", "profile:interests")
    .text("📍 Location", "profile:location")
    .row()
    .text(`📸 Media (${mediaCount}/3)`, "profile:media")
    .row()
    .text("❌ Close", "profile:close");
}

export async function handleProfileCallback(
  ctx: MyContext,
  env: Env,
  data: string,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);
  const userRes = await env.API_SERVICE.fetch(
    new Request(`http://api/users/${userId}`, { method: "GET" }),
  );
  let lang: Language = "en";
  if (userRes.ok) {
    const userData = (await userRes.json()) as {
      user?: Record<string, unknown>;
    };
    lang = (userData.user?.language as Language) ?? "en";
  }

  switch (data) {
    case "profile:bio": {
      await startConversation(env.KV, userId, "bio");
      const bioKeyboard = {
        keyboard: [[{ text: t("genericCancel", lang) }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
      await ctx.reply(t("bioPrompt", lang), { reply_markup: bioKeyboard });
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }
    case "profile:birthdate": {
      await startConversation(env.KV, userId, "birthdate");
      const birthKeyboard = {
        keyboard: [[{ text: t("genericCancel", lang) }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
      await ctx.reply(t("birthDatePrompt", lang), {
        reply_markup: birthKeyboard,
      });
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }
    case "profile:name": {
      await startConversation(env.KV, userId, "name");
      const nameKeyboard = {
        keyboard: [
          [{ text: t("nameUseTelegramButton", lang) }],
          [{ text: t("genericCancel", lang) }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
      await ctx.reply(t("namePrompt", lang), { reply_markup: nameKeyboard });
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }
    case "profile:gender": {
      await startConversation(env.KV, userId, "gender");
      const keyboard = {
        keyboard: [
          [
            { text: t("genderMaleButton", lang) },
            { text: t("genderFemaleButton", lang) },
          ],
          [{ text: t("genericCancel", lang) }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
      await ctx.reply(t("genderPrompt", lang), { reply_markup: keyboard });
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }
    case "profile:interests": {
      await startConversation(env.KV, userId, "interests");
      const interestsKeyboard = {
        keyboard: [[{ text: t("genericCancel", lang) }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
      await ctx.reply(t("interestsPrompt", lang), {
        reply_markup: interestsKeyboard,
      });
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }
    case "profile:location": {
      await startConversation(env.KV, userId, "location");
      const keyboard = {
        keyboard: [
          [{ text: t("locationShareButton", lang), request_location: true }],
          [{ text: t("locationTypeButton", lang) }],
          [{ text: t("genericCancel", lang) }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      };
      await ctx.reply(t("locationPrompt", lang), { reply_markup: keyboard });
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }
    case "profile:media": {
      const mediaUserRes = await env.API_SERVICE.fetch(
        new Request(`http://api/users/${userId}`, { method: "GET" }),
      );
      const mediaUserData = mediaUserRes.ok
        ? ((await mediaUserRes.json()) as { user?: UserProfile })
        : { user: undefined };
      const media =
        (mediaUserData.user?.mediaUrls as
          | Array<{ url: string; type: string }>
          | undefined) ?? [];

      if (media.length === 0) {
        const keyboard = new InlineKeyboard()
          .text("📤 Upload Media", "media:upload")
          .row()
          .text("← Back to Profile", "media:back");
        await ctx.editMessageText(t("mediaManagerEmpty", lang), {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
        await ctx.answerCallbackQuery().catch(() => {});
        return true;
      }

      const lines = media.map(
        (m, i) =>
          `${i + 1}. ${m.type === "image" ? t("mediaManagerItemPhoto", lang) : t("mediaManagerItemVideo", lang)}`,
      );
      const msg = `${t("mediaManagerTitle", lang, { count: String(media.length) })}\n\n${lines.join("\n")}\n\n${t("mediaManagerDeletePrompt", lang)}`;

      const keyboard = new InlineKeyboard();
      media.forEach((_, i) => {
        keyboard.text(`🗑 ${i + 1}`, `media:delete:${i}`);
        if ((i + 1) % 3 === 0) keyboard.row();
      });
      if (media.length % 3 !== 0) keyboard.row();
      if (media.length < 3) {
        keyboard.text("📤 Upload More", "media:upload");
      }
      keyboard.row().text("← Back to Profile", "media:back");

      await ctx.editMessageText(msg, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      await ctx.answerCallbackQuery().catch(() => {});
      return true;
    }
    case "profile:close":
      await ctx.deleteMessage().catch(() => {});
      await ctx.reply("👇 Use the menu below to navigate:", {
        reply_markup: getMainMenuKeyboard(),
      });
      return true;
    default:
      return false;
  }
}

export async function handleMediaCallback(
  ctx: MyContext,
  env: Env,
  data: string,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);

  // Fetch user for language and current media
  const userRes = await env.API_SERVICE.fetch(
    new Request(`http://api/users/${userId}`, { method: "GET" }),
  );
  let lang: Language = "en";
  let media: Array<{ url: string; type: string; uploadedAt: string }> = [];
  if (userRes.ok) {
    const userData = (await userRes.json()) as { user?: UserProfile };
    lang = (userData.user?.language as Language) ?? "en";
    media =
      (userData.user?.mediaUrls as
        | Array<{ url: string; type: string; uploadedAt: string }>
        | undefined) ?? [];
  }

  if (data === "media:upload") {
    await startConversation(env.KV, userId, "media");
    await ctx.reply(t("mediaPrompt", lang));
    await ctx.answerCallbackQuery().catch(() => {});
    return true;
  }

  if (data.startsWith("media:delete:")) {
    const index = parseInt(data.replace("media:delete:", ""), 10);
    if (Number.isNaN(index) || index < 0 || index >= media.length) {
      await ctx.answerCallbackQuery("Item not found").catch(() => {});
      return true;
    }
    const item = media[index];
    if (!item) {
      await ctx.answerCallbackQuery("Item not found").catch(() => {});
      return true;
    }

    // Call API to delete specific media item
    const deleteRes = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}/media`, {
        method: "DELETE",
        body: JSON.stringify({ url: item.url }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    if (!deleteRes.ok) {
      await ctx
        .answerCallbackQuery(t("mediaDeleteError", lang))
        .catch(() => {});
      return true;
    }

    // Refresh media list from API
    const freshRes = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    let freshMedia: Array<{ url: string; type: string }> = [];
    if (freshRes.ok) {
      const freshData = (await freshRes.json()) as { user?: UserProfile };
      freshMedia =
        (freshData.user?.mediaUrls as
          | Array<{ url: string; type: string }>
          | undefined) ?? [];
    }

    if (freshMedia.length === 0) {
      const keyboard = new InlineKeyboard()
        .text("📤 Upload Media", "media:upload")
        .row()
        .text("← Back to Profile", "media:back");
      await ctx.editMessageText(t("mediaManagerEmpty", lang), {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } else {
      const lines = freshMedia.map(
        (m, i) =>
          `${i + 1}. ${m.type === "image" ? t("mediaManagerItemPhoto", lang) : t("mediaManagerItemVideo", lang)}`,
      );
      const msg = `${t("mediaManagerTitle", lang, { count: String(freshMedia.length) })}\n\n${lines.join("\n")}\n\n${t("mediaManagerDeletePrompt", lang)}`;
      const keyboard = new InlineKeyboard();
      freshMedia.forEach((_, i) => {
        keyboard.text(`🗑 ${i + 1}`, `media:delete:${i}`);
        if ((i + 1) % 3 === 0) keyboard.row();
      });
      if (freshMedia.length % 3 !== 0) keyboard.row();
      if (freshMedia.length < 3) {
        keyboard.text("📤 Upload More", "media:upload");
      }
      keyboard.row().text("← Back to Profile", "media:back");
      await ctx.editMessageText(msg, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    }

    await ctx
      .answerCallbackQuery(t("mediaDeleteSuccess", lang))
      .catch(() => {});
    return true;
  }

  return false;
}
