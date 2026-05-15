import { Bot, session } from "grammy";
import type { MyContext } from "./types.js";
import { startCommand, languageCallback } from "./handlers/start.js";
import { helpCommand, aboutCommand } from "./handlers/help.js";
import { profileCommand } from "./handlers/profile.js";
import {
  matchCommand,
  matchCallbacks,
  handleMatchReplyAction,
  getMatchActionKeyboard,
  handleGiftCallback,
  handleGiftPayment,
  startLikeMessageConversation,
} from "./handlers/match.js";
import { matchesCommand, matchesCallbacks } from "./handlers/matches.js";
import {
  settingsCommand,
  settingsCallbacks,
  handleAgeRangeCallback,
} from "./handlers/settings.js";
import {
  premiumCommand,
  premiumCallbacks,
  referralCommand,
} from "./handlers/premium.js";
import { ApiServiceClient } from "./services/api-client.js";
import { activityTrackerMiddleware } from "./lib/activityTracker.js";
import {
  handleConversationMessage,
  handleContactMessage,
  handleLocationMessage,
  handleMediaMessage,
  checkMandatoryUpdates,
  getConversationState,
} from "./lib/conversations.js";
import { handleProfileCallback, handleMediaCallback } from "./menus/profile.js";
import { getNotifications, clearNotifications } from "./lib/notifications.js";
import {
  getMainMenuKeyboard,
  MENU_FIND_MATCH,
  MENU_MY_MATCHES,
  MENU_PROFILE,
  MENU_SETTINGS,
} from "./lib/main-menu.js";
import { InlineKeyboard } from "grammy";
import { t, type Language } from "./lib/i18n.js";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  API_SERVICE: Fetcher;
  MEDIA_BUCKET?: R2Bucket;
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ENVIRONMENT?: string;
}

function createBot(env: Env): Bot<MyContext> {
  const bot = new Bot<MyContext>(env.BOT_TOKEN);

  bot.use(
    session({
      initial: () => ({}),
      storage: {
        read: async (key) => {
          const value = await env.KV.get(`session:${key}`);
          return value ? JSON.parse(value) : {};
        },
        write: async (key, value) => {
          await env.KV.put(`session:${key}`, JSON.stringify(value));
        },
        delete: async (key) => {
          await env.KV.delete(`session:${key}`);
        },
      },
    }),
  );

  bot.use(activityTrackerMiddleware(env));

  // Mandatory profile update check — runs before commands and callbacks
  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    // Skip if already in a birthdate conversation
    const state = await env.KV.get(`conversation:${ctx.from.id}`);
    if (state) {
      const parsed = JSON.parse(state) as { field?: string };
      if (parsed.field === "birthdate") return next();
    }
    const needsUpdate = await checkMandatoryUpdates(ctx, env);
    if (needsUpdate) return;
    return next();
  });

  // Check for pending notifications on any user interaction
  // Skip if user is in an active conversation to avoid interrupting input
  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const userId = String(ctx.from.id);

    // Skip if in a conversation
    const state = await getConversationState(env.KV, userId);
    if (state) return next();

    const notifications = await getNotifications(env, userId);
    const hasLikes = notifications.some((n) => n.type === "like");
    const hasMutual = notifications.some((n) => n.type === "mutual_match");

    if (hasMutual || hasLikes) {
      const parts: string[] = [];
      if (hasMutual) parts.push(t("notificationsNewMutual"));
      if (hasLikes) parts.push(t("notificationsNewLikes"));
      const keyboard = new InlineKeyboard().text("View now", "matches").row();
      await ctx.reply(
        t("notificationsCheckMatches", "en", { items: parts.join(" and ") }),
        { reply_markup: keyboard },
      );
      await clearNotifications(env, userId);
    }
    return next();
  });

  // Bot commands are registered once via scripts/setup-bot-commands.ts
  // to avoid rate-limiting and latency in the serverless handler.

  bot.command("start", (ctx) => startCommand(ctx, env));
  bot.command("help", helpCommand);
  bot.command("about", aboutCommand);
  bot.command("profile", (ctx) => profileCommand(ctx, env));
  bot.command("match", (ctx) => matchCommand(ctx, env));
  bot.command("matches", (ctx) => matchesCommand(ctx, env));
  bot.command("settings", (ctx) => settingsCommand(ctx, env));
  bot.command("premium", (ctx) => premiumCommand(ctx, env));
  bot.command("referral", (ctx) => referralCommand(ctx, env));

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;

    // Language selection callback
    if (data.startsWith("lang:")) {
      await languageCallback(ctx, env, data);
      return;
    }

    if (data.startsWith("profile:")) {
      const handled = await handleProfileCallback(ctx, env, data);
      if (handled) return;
    }

    if (data === "media:back") {
      await profileCommand(ctx, env);
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    if (data.startsWith("media:")) {
      const handled = await handleMediaCallback(ctx, env, data);
      if (handled) return;
    }

    if (
      data === "next_match" ||
      data === "view_matches" ||
      data.startsWith("match:") ||
      data.startsWith("dm:")
    ) {
      return matchCallbacks(ctx, env);
    }

    if (data === "matches") {
      return matchesCommand(ctx, env);
    }

    if (data === "find_match") {
      return matchCommand(ctx, env);
    }

    if (
      data === "matches_close" ||
      data === "back_to_matches" ||
      data.startsWith("view_match_user_") ||
      data.startsWith("likes:")
    ) {
      return matchesCallbacks(ctx, env);
    }

    if (data === "settings:show") {
      await settingsCommand(ctx, env);
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    if (data.startsWith("settings:")) {
      return settingsCallbacks(ctx, env);
    }

    if (data.startsWith("agerange:")) {
      const handled = await handleAgeRangeCallback(ctx, env, data);
      if (handled) return;
    }

    if (data.startsWith("premium:") || data.startsWith("referral:")) {
      return premiumCallbacks(ctx, env);
    }

    if (data === "media:retry") {
      await ctx.deleteMessage().catch(() => {});
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    if (data === "media:cancel") {
      await ctx.deleteMessage().catch(() => {});
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    // Gift callbacks
    if (data.startsWith("gift:") || data === "gift:cancel") {
      const handled = await handleGiftCallback(ctx, env, data);
      if (handled) return;
    }

    // DM callbacks (inline button on match card)
    if (
      data.startsWith("dm:send:") ||
      data.startsWith("dm:buy:") ||
      data === "dm:cancel"
    ) {
      return matchCallbacks(ctx, env);
    }
  });

  bot.on("message:contact", async (ctx) => {
    const handled = await handleContactMessage(ctx, env);
    if (handled) return;
  });

  bot.on("message:location", async (ctx) => {
    const handled = await handleLocationMessage(ctx, env);
    if (handled) return;
  });

  bot.on("message:photo", async (ctx) => {
    // Check if in like-message conversation first
    if (ctx.from) {
      const state = await getConversationState(env.KV, String(ctx.from.id));
      if (state && state.field === "like-message") {
        await handleLikeMessagePhoto(ctx, env);
        return;
      }
    }
    const handled = await handleMediaMessage(ctx, env, "image");
    if (handled) return;
  });

  bot.on("message:video", async (ctx) => {
    // Check if in like-message conversation first
    if (ctx.from) {
      const state = await getConversationState(env.KV, String(ctx.from.id));
      if (state && state.field === "like-message") {
        await handleLikeMessageVideo(ctx, env);
        return;
      }
    }
    const handled = await handleMediaMessage(ctx, env, "video");
    if (handled) return;
  });

  // Handle Telegram Stars payments
  bot.on("pre_checkout_query", async (ctx) => {
    await ctx.answerPreCheckoutQuery(true).catch(() => {});
  });

  bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;
    if (!payment) return;
    const payload = payment.invoice_payload;

    if (payload && payload.startsWith("dm_credit_")) {
      const parts = payload.split("_");
      const userId = parts[2];
      const amount = Number(parts[3] ?? 1);
      if (!userId) return;

      try {
        const client = new ApiServiceClient(env.API_SERVICE);
        const result = await client.purchaseDMCredits(userId, amount);
        await ctx.reply(
          t("dmPurchased", "en", {
            count: String(amount),
            total: String(result.dmCredits),
          }),
          { reply_markup: getMainMenuKeyboard() },
        );
      } catch (error) {
        console.error("DM credit purchase error:", error);
        await ctx.reply(
          "❌ Payment processed but we could not add DM credits. Please contact support.",
        );
      }
    }

    if (payload && payload.startsWith("gift_")) {
      await handleGiftPayment(ctx, env, payload);
    }
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message?.text;

    // Main menu keyboard buttons take priority over conversations
    switch (text) {
      case MENU_FIND_MATCH:
        return matchCommand(ctx, env);
      case MENU_MY_MATCHES:
        return matchesCommand(ctx, env);
      case MENU_PROFILE:
        return profileCommand(ctx, env);
      case MENU_SETTINGS:
        return settingsCommand(ctx, env);
    }

    // Match action reply keyboard — only if there's an active match queue
    const actionMap: Record<string, string> = {
      "❤️": "like",
      "👎": "dislike",
      "⏩": "skip",
      "↩️": "undo",
      "⚠️": "report",
      "💌": "like-message",
      "🎁 Send a gift": "gift",
      "🏠 Main menu": "menu",
    };

    if (text && actionMap[text]) {
      const action = actionMap[text];
      if (action === "menu") {
        await ctx.reply("Main menu:", { reply_markup: getMainMenuKeyboard() });
        return;
      }
      const handled = await handleMatchReplyAction(ctx, env, action);
      if (handled) return;
    }

    const handled = await handleConversationMessage(ctx, env);
    if (handled) return;

    // Graceful fallback: if user sends ⏭ Skip without an active like-message
    // conversation but has a match queue, treat it as a regular Like
    if (text === "⏭ Skip") {
      const queueHandled = await handleMatchReplyAction(ctx, env, "like");
      if (queueHandled) return;
    }

    await ctx.reply(t("fallbackMessage", "en"), {
      reply_markup: getMainMenuKeyboard(),
    });
  });

  return bot;
}

// --- Like with Message media handlers ---

async function handleLikeMessagePhoto(ctx: MyContext, env: Env): Promise<void> {
  if (!ctx.from || !ctx.message?.photo) return;
  const userId = String(ctx.from.id);

  try {
    const photos = ctx.message.photo;
    const fileId = photos[photos.length - 1].file_id;

    const file = await ctx.api.getFile(fileId);
    if (!file.file_path) {
      await ctx.reply("❌ Failed to get file. Please try again.");
      return;
    }

    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      await ctx.reply("❌ Failed to download. Please try again.");
      return;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (!env.MEDIA_BUCKET) {
      await ctx.reply("❌ Upload service unavailable.");
      return;
    }

    const ext = "jpg";
    const key = `${userId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    await env.MEDIA_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: `image/${ext}` },
    });

    const publicUrl = `https://media.meetsmatch.irfndi.workers.dev/${key}`;

    const { handleLikeMessageMedia } = await import("./handlers/match.js");
    await handleLikeMessageMedia(ctx, env, publicUrl, "image");
  } catch (error) {
    console.error("Like message photo error:", error);
    await ctx.reply("❌ Failed to upload. Please try again.");
  }
}

async function handleLikeMessageVideo(ctx: MyContext, env: Env): Promise<void> {
  if (!ctx.from || !ctx.message?.video) return;
  const userId = String(ctx.from.id);

  try {
    const fileId = ctx.message.video.file_id;

    const file = await ctx.api.getFile(fileId);
    if (!file.file_path) {
      await ctx.reply("❌ Failed to get file. Please try again.");
      return;
    }

    const fileUrl = `https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`;
    const response = await fetch(fileUrl);
    if (!response.ok) {
      await ctx.reply("❌ Failed to download. Please try again.");
      return;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (!env.MEDIA_BUCKET) {
      await ctx.reply("❌ Upload service unavailable.");
      return;
    }

    const key = `${userId}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.mp4`;
    await env.MEDIA_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: "video/mp4" },
    });

    const publicUrl = `https://media.meetsmatch.irfndi.workers.dev/${key}`;

    const { handleLikeMessageMedia } = await import("./handlers/match.js");
    await handleLikeMessageMedia(ctx, env, publicUrl, "video");
  } catch (error) {
    console.error("Like message video error:", error);
    await ctx.reply("❌ Failed to upload. Please try again.");
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(JSON.stringify({ status: "ok", service: "cf-bot" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/webhook") {
      if (env.TELEGRAM_WEBHOOK_SECRET) {
        const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
        if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
          status: 405,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const update =
          (await request.json()) as import("@grammyjs/types").Update;
        const bot = createBot(env);
        await bot.init();
        await bot.handleUpdate(update);
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("Webhook error:", error);
        return new Response(
          JSON.stringify({ error: "Internal Server Error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    if (url.pathname === "/send-notification" && request.method === "POST") {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        if (typeof body.userId !== "string" || typeof body.type !== "string") {
          return new Response(
            JSON.stringify({
              error: "Invalid request: userId and type are required strings",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        const userId = body.userId;
        const type = body.type;
        const payload =
          typeof body.payload === "string"
            ? JSON.parse(body.payload)
            : (body.payload ?? {});

        const bot = createBot(env);
        let message: string;
        let keyboard: import("grammy").InlineKeyboard | undefined;

        const otherUsername = payload.otherUsername as string | undefined;

        function escapeMd(text: string): string {
          return text.replace(/[_*\[\]`\\]/g, "\\$&");
        }

        if (type === "like") {
          const fromName = escapeMd(payload.fromDisplayName ?? "Someone");
          message = `💕 *New Like!*\n\n${fromName} liked your profile!`;
          if (payload.messageText) {
            const safeText = escapeMd(String(payload.messageText));
            message += `\n\n💌 *Message:* "${safeText}"`;
          }
          if (payload.mediaUrl) {
            message += `\n\n📎 They also sent a photo/video with their like.`;
          }
          message += ` Use *💕 My Matches* to see who likes you.`;
        } else if (type === "mutual_match") {
          const otherName = escapeMd(payload.otherDisplayName ?? "Someone");
          message = `🎉 *It's a Match!*\n\nYou and *${otherName}* have liked each other! 💕`;
          if (otherUsername) {
            message += `\n\n👉 [Start chatting](https://t.me/${otherUsername})`;
          }
          keyboard = new InlineKeyboard()
            .text("💕 View Matches", "matches")
            .row();
        } else if (type === "gift") {
          const fromName = escapeMd(payload.fromDisplayName ?? "Someone");
          const giftEmoji = payload.giftEmoji ?? "🎁";
          const giftName = escapeMd(payload.giftName ?? "gift");
          message = `🎁 *New Gift!*\n\n${fromName} sent you a ${giftEmoji} *${giftName}*! 💕`;
        } else if (type === "BIRTHDAY") {
          message = payload.message || `🎂 Someone has a birthday today!`;
          keyboard = new InlineKeyboard()
            .text("💕 View Matches", "matches")
            .row();
        } else if (type === "REENGAGEMENT") {
          message =
            payload.message ||
            `We miss you on MeetMatch! Come back and find your next match! 💘`;
          const action = payload.action as string | undefined;
          if (action === "find_match") {
            keyboard = new InlineKeyboard()
              .text("🔍 Find Matches", "find_match")
              .row();
          }
        } else if (type === "CLEANUP_MEDIA_DELETED") {
          message =
            payload.message ||
            `📸 Your profile photos were removed after 30 days of inactivity. Upload new photos to start matching again!`;
          keyboard = new InlineKeyboard()
            .text("👤 Go to Profile", "profile:media")
            .row();
        } else {
          message = payload.message || `You have a new ${type} notification!`;
        }

        await bot.api.sendMessage(userId, message, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
          link_preview_options: otherUsername
            ? { is_disabled: false }
            : undefined,
        });

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        console.error("Send notification error:", error);
        return new Response(
          JSON.stringify({ error: "Internal Server Error" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
};
