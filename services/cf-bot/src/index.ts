import { Bot, session } from "grammy";
import { getVersionInfo } from "./lib/version.js";
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
  handleGiftPremiumPayment,
  startLikeMessageConversation,
  fetchUserLang,
} from "./handlers/match.js";
import { matchesCommand, matchesCallbacks } from "./handlers/matches.js";
import { buildMediaKey, buildMediaPublicUrl } from "@meetsmatch/cf-shared";
import {
  settingsCommand,
  settingsCallbacks,
  handleAgeRangeCallback,
  handleDistanceCallback,
  handleGenderPrefCallback,
  handleSettingsLanguageCallback,
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
  startFeedbackConversation,
} from "./lib/conversations.js";
import { handleProfileCallback, handleMediaCallback } from "./menus/profile.js";
import { getNotifications, clearNotifications } from "./lib/notifications.js";
import {
  getMainMenuKeyboard,
  MENU_FIND_MATCH,
  MENU_MY_MATCHES,
  MENU_PROFILE,
  MENU_SETTINGS,
  MENU_PREMIUM,
  MENU_REFERRAL,
} from "./lib/main-menu.js";
import { InlineKeyboard } from "grammy";
import { t, type Language } from "./lib/i18n.js";
import {
  handleErrorReportCallback,
  recordCommandJourney,
  recordActionJourney,
  replyWithError,
  isBotBlockedError,
  isPermanentDeliveryError,
} from "./lib/error-feedback.js";
import { sendAggregatedAlerts } from "./lib/admin-alerts.js";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  API_SERVICE: Fetcher;
  MEDIA_BUCKET?: R2Bucket;
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ENVIRONMENT?: string;
  ADMIN_CHAT_ID?: string;
}

function createBot(env: Env): Bot<MyContext> {
  const bot = new Bot<MyContext>(env.BOT_TOKEN);

  bot.catch((err) => {
    if (isBotBlockedError(err.error)) {
      // Silently ignore when user blocks the bot
      return;
    }
    console.error("Bot error:", err);
  });

  bot.use(
    session({
      initial: () => ({}),
      storage: {
        read: async (key) => {
          const value = await env.KV.get(`session:${key}`);
          if (!value) return {};
          try {
            const parsed = JSON.parse(value);
            if (
              parsed &&
              typeof parsed === "object" &&
              !Array.isArray(parsed)
            ) {
              return parsed as Record<string, unknown>;
            }
            return {};
          } catch {
            return {};
          }
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
    // Skip bot commands (let command handlers show language picker / welcome)
    if (ctx.message?.text?.startsWith("/")) return next();
    // Skip language selection callbacks so onboarding doesn't block language persistence
    if (ctx.callbackQuery?.data?.startsWith("lang:")) return next();
    // Skip pre-checkout queries (payment flow must not be blocked)
    if (ctx.preCheckoutQuery) return next();
    // Skip if already in any conversation (let conversation handlers process input)
    const state = await env.KV.get(`conversation:${ctx.from.id}`);
    if (state) return next();
    // Skip if user is sharing their contact (phone verification in progress)
    if (ctx.message?.contact) return next();
    const needsUpdate = await checkMandatoryUpdates(ctx, env);
    if (needsUpdate) return;
    return next();
  });

  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    const userId = String(ctx.from.id);

    // Skip if in a conversation
    const state = await getConversationState(env.KV, userId);
    if (state) return next();

    await next();

    const stateAfter = await getConversationState(env.KV, userId);
    if (stateAfter) return;

    const notifications = await getNotifications(env, userId);
    const hasLikes = notifications.some((n) => n.type === "like");
    const hasMutual = notifications.some((n) => n.type === "mutual_match");

    if (hasMutual || hasLikes) {
      let lang: Language = "en";
      try {
        const client = new ApiServiceClient(env.API_SERVICE);
        const userRes = await client.getUser({ userId });
        lang = (userRes.user?.language as Language) ?? "en";
      } catch {
        /* fallback */
      }
      const parts: string[] = [];
      if (hasMutual) parts.push(t("notificationsNewMutual", lang));
      if (hasLikes) parts.push(t("notificationsNewLikes", lang));
      const keyboard = new InlineKeyboard()
        .text(t("notificationMutualMatchView", lang), "matches")
        .row();
      await ctx.reply(
        t("notificationsCheckMatches", lang, {
          items: parts.join(", "),
        }),
        { reply_markup: keyboard },
      );
      await clearNotifications(env, userId);
    }
  });

  // Record journey for commands and menu buttons — must be BEFORE handlers
  // Fire-and-forget: never block command/menu processing on KV/network.
  bot.use((ctx, next) => {
    const text = ctx.message?.text;
    let promise: Promise<void> | undefined;
    if (text?.startsWith("/")) {
      const cmd = text.split(" ")[0].slice(1);
      promise = recordCommandJourney(ctx, env, cmd);
    } else if (text === MENU_FIND_MATCH) {
      promise = recordActionJourney(ctx, env, "menu/find_match");
    } else if (text === MENU_MY_MATCHES) {
      promise = recordActionJourney(ctx, env, "menu/my_matches");
    } else if (text === MENU_PROFILE) {
      promise = recordActionJourney(ctx, env, "menu/profile");
    } else if (text === MENU_SETTINGS) {
      promise = recordActionJourney(ctx, env, "menu/settings");
    } else if (text === MENU_PREMIUM) {
      promise = recordActionJourney(ctx, env, "menu/premium");
    } else if (text === MENU_REFERRAL) {
      promise = recordActionJourney(ctx, env, "menu/referral");
    }
    promise?.catch((error) => console.warn("Journey tracking failed:", error));
    return next();
  });

  // Bot commands are registered once via scripts/setup-bot-commands.ts
  // to avoid rate-limiting and latency in the serverless handler.

  bot.command("start", (ctx) => startCommand(ctx, env));
  bot.command("help", (ctx) => helpCommand(ctx, env));
  bot.command("about", (ctx) => aboutCommand(ctx, env));
  bot.command("profile", (ctx) => profileCommand(ctx, env));
  bot.command("match", (ctx) => matchCommand(ctx, env));
  bot.command("matches", (ctx) => matchesCommand(ctx, env));
  bot.command("settings", (ctx) => settingsCommand(ctx, env));
  bot.command("premium", (ctx) => premiumCommand(ctx, env));
  bot.command("referral", (ctx) => referralCommand(ctx, env));
  bot.command("feedback", (ctx) => startFeedbackConversation(ctx, env));
  bot.command("report", async (ctx) => {
    if (!ctx.from) return;
    const lang = await fetchUserLang(env, String(ctx.from.id));
    await ctx.reply(t("reportCommandHint", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  });

  bot.on("callback_query:data", async (ctx) => {
    try {
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
        data.startsWith("dm:") ||
        data.startsWith("gift_premium:")
      ) {
        return await matchCallbacks(ctx, env);
      }

      if (data === "matches") {
        return await matchesCommand(ctx, env);
      }

      if (data === "find_match") {
        return await matchCommand(ctx, env);
      }

      if (
        data === "matches_close" ||
        data === "back_to_matches" ||
        data.startsWith("view_match_user_") ||
        data.startsWith("likes:")
      ) {
        return await matchesCallbacks(ctx, env);
      }

      if (data === "settings:show") {
        await settingsCommand(ctx, env);
        await ctx.answerCallbackQuery().catch(() => {});
        return;
      }

      if (data === "settings:back") {
        await settingsCommand(ctx, env);
        await ctx.answerCallbackQuery().catch(() => {});
        return;
      }

      if (data.startsWith("settings-lang:")) {
        const handled = await handleSettingsLanguageCallback(ctx, env, data);
        if (handled) return;
      }

      if (data.startsWith("settings:")) {
        return await settingsCallbacks(ctx, env);
      }

      if (data.startsWith("agerange:")) {
        const handled = await handleAgeRangeCallback(ctx, env, data);
        if (handled) return;
      }

      if (data.startsWith("distance:")) {
        const handled = await handleDistanceCallback(ctx, env, data);
        if (handled) return;
      }

      if (data.startsWith("genderpref:")) {
        const handled = await handleGenderPrefCallback(ctx, env, data);
        if (handled) return;
      }

      if (
        data.startsWith("premium:") ||
        data.startsWith("referral:") ||
        data.startsWith("premium_ad:")
      ) {
        return await premiumCallbacks(ctx, env);
      }

      if (data.startsWith("report_error:")) {
        const traceId = data.replace("report_error:", "");
        await handleErrorReportCallback(ctx, env, traceId);
        return;
      }

      if (data === "menu:main") {
        await ctx.deleteMessage().catch(() => {});
        const lang = ctx.from
          ? await fetchUserLang(env, String(ctx.from.id))
          : "en";
        await ctx.reply(t("mainMenuPrompt", lang), {
          reply_markup: getMainMenuKeyboard(),
        });
        await ctx.answerCallbackQuery().catch(() => {});
        return;
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
        return await matchCallbacks(ctx, env);
      }
    } catch (error) {
      if (isBotBlockedError(error)) {
        await ctx.answerCallbackQuery().catch(() => {});
        return;
      }
      console.error("Callback query error:", error);
      await replyWithError(ctx, env, "en", { action: "callback_query" });
      await ctx.answerCallbackQuery().catch(() => {});
    }
  });

  bot.on("message:contact", async (ctx) => {
    try {
      const handled = await handleContactMessage(ctx, env);
      if (handled) return;
    } catch (error) {
      console.error("Contact message error:", error);
      await replyWithError(ctx, env, "en", { action: "contact_message" });
    }
  });

  bot.on("message:location", async (ctx) => {
    try {
      const handled = await handleLocationMessage(ctx, env);
      if (handled) return;
    } catch (error) {
      console.error("Location message error:", error);
      await replyWithError(ctx, env, "en", { action: "location_message" });
    }
  });

  bot.on("message:photo", async (ctx) => {
    try {
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
    } catch (error) {
      console.error("Photo message error:", error);
      await replyWithError(ctx, env, "en", { action: "photo_message" });
    }
  });

  bot.on("message:video", async (ctx) => {
    try {
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
    } catch (error) {
      console.error("Video message error:", error);
      await replyWithError(ctx, env, "en", { action: "video_message" });
    }
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
        const lang = await fetchUserLang(env, userId);
        await ctx.reply(
          t("dmPurchased", lang, {
            count: String(amount),
            total: String(result.dmCredits),
          }),
          { reply_markup: getMainMenuKeyboard() },
        );
      } catch (error) {
        console.error("DM credit purchase error:", error);
        await replyWithError(ctx, env, "en", { action: "dm_credit_purchase" });
      }
    }

    if (payload && payload.startsWith("gift_premium_")) {
      await handleGiftPremiumPayment(ctx, env, payload);
    } else if (payload && payload.startsWith("gift_")) {
      await handleGiftPayment(ctx, env, payload);
    }

    if (payload && payload.startsWith("premium_")) {
      const parts = payload.split("_");
      const userId = parts[1];
      const tier = parts.slice(2).join("_");
      if (!userId || !tier) return;
      if (tier !== "premium" && tier !== "premium_plus") return;

      try {
        const client = new ApiServiceClient(env.API_SERVICE);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        await client.updateUser({
          userId,
          user: {
            id: userId,
            subscriptionTier: tier,
            subscriptionExpiresAt: expiresAt.toISOString(),
          },
        });
        const lang = await fetchUserLang(env, userId);
        await ctx.reply(
          t("premiumPurchased", lang, {
            tier: tier === "premium_plus" ? "Premium+ 💎" : "Premium 👑",
          }),
          { reply_markup: getMainMenuKeyboard() },
        );
      } catch (error) {
        console.error("Premium purchase error:", error);
        await replyWithError(ctx, env, "en", { action: "premium_purchase" });
      }
    }
  });

  bot.on("message:text", async (ctx) => {
    // Resolve user language early so it's available in catch blocks too
    let lang: Language = "en";
    try {
      const client = new ApiServiceClient(env.API_SERVICE);
      const userRes = await client.getUser({
        userId: String(ctx.from?.id ?? ""),
      });
      lang = (userRes.user?.language as Language) ?? "en";
    } catch {
      /* fallback to en */
    }

    try {
      const text = ctx.message?.text;

      // Main menu keyboard buttons take priority over conversations
      switch (text) {
        case MENU_FIND_MATCH:
          return await matchCommand(ctx, env);
        case MENU_MY_MATCHES:
          return await matchesCommand(ctx, env);
        case MENU_PROFILE:
          return await profileCommand(ctx, env);
        case MENU_SETTINGS:
          return await settingsCommand(ctx, env);
        case MENU_PREMIUM:
          return await premiumCommand(ctx, env);
        case MENU_REFERRAL:
          return await referralCommand(ctx, env);
      }

      // Match action reply keyboard — only if there's an active match queue
      const actionMap: Record<string, string> = {
        "❤️": "like",
        "👎": "dislike",
        "⏩": "skip",
        "↩️": "undo",
        "⚠️": "report",
        "💌": "like-message",
        [t("matchSendGift", lang)]: "gift",
        [t("matchMainMenu", lang)]: "menu",
      };

      if (text && actionMap[text]) {
        const action = actionMap[text];
        if (action === "menu") {
          await ctx.reply(t("mainMenuPrompt", lang), {
            reply_markup: getMainMenuKeyboard(),
          });
          return;
        }
        const handled = await handleMatchReplyAction(ctx, env, action);
        if (handled) return;
      }

      const handled = await handleConversationMessage(ctx, env);
      if (handled) return;

      // Graceful fallback: if user sends Skip without an active like-message
      // conversation but has a match queue, treat it as a regular Like
      if (text === t("likeMessageSkipButton", lang)) {
        const queueHandled = await handleMatchReplyAction(ctx, env, "like");
        if (queueHandled) return;
      }

      await ctx.reply(t("fallbackMessage", lang), {
        reply_markup: getMainMenuKeyboard(),
      });
    } catch (error) {
      if (isBotBlockedError(error)) {
        return;
      }
      console.error("Text message error:", error);
      const text = ctx.message?.text;
      const action = text?.startsWith("/")
        ? `command:${text.split(" ")[0].slice(1)}`
        : "text_message";
      await replyWithError(ctx, env, lang, { action });
    }
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
    const key = buildMediaKey(userId, ext);
    await env.MEDIA_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: `image/${ext}` },
    });

    const publicUrl = buildMediaPublicUrl(key);

    const { handleLikeMessageMedia } = await import("./handlers/match.js");
    await handleLikeMessageMedia(ctx, env, publicUrl, "image");
  } catch (error) {
    console.error("Like message photo error:", error);
    await replyWithError(ctx, env, "en", { action: "like_message_photo" });
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

    const key = buildMediaKey(userId, "mp4");
    await env.MEDIA_BUCKET.put(key, bytes, {
      httpMetadata: { contentType: "video/mp4" },
    });

    const publicUrl = buildMediaPublicUrl(key);

    const { handleLikeMessageMedia } = await import("./handlers/match.js");
    await handleLikeMessageMedia(ctx, env, publicUrl, "video");
  } catch (error) {
    console.error("Like message video error:", error);
    await replyWithError(ctx, env, "en", { action: "like_message_video" });
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
      return new Response(
        JSON.stringify({
          status: "ok",
          service: "cf-bot",
          version: getVersionInfo(),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
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
        if (isBotBlockedError(error)) {
          return new Response("OK", { status: 200 });
        }
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
        } else if (type === "gift_premium") {
          const fromName = escapeMd(payload.fromDisplayName ?? "Someone");
          const tier = escapeMd(payload.tier ?? "Premium");
          message = `🎁 *Premium Gift!*\n\n${fromName} gifted you *${tier}*! 💕\n\nEnjoy your upgraded experience!`;
          keyboard = new InlineKeyboard()
            .text("👑 View Premium", "premium:show")
            .row();
        } else if (type === "BIRTHDAY") {
          message =
            escapeMd(payload.message as string) ||
            `🎂 Someone has a birthday today!`;
          keyboard = new InlineKeyboard()
            .text("💕 View Matches", "matches")
            .row();
        } else if (type === "REENGAGEMENT") {
          message =
            escapeMd(payload.message as string) ||
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
          message =
            escapeMd(payload.message as string) ||
            `You have a new ${type} notification!`;
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
        if (isPermanentDeliveryError(error)) {
          return new Response(
            JSON.stringify({
              error:
                error instanceof Error
                  ? error.message
                  : "Permanent delivery failure",
            }),
            {
              status: 410,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
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

  async scheduled(
    controller: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (controller.cron === "0 */6 * * *") {
      await sendAggregatedAlerts(env);
    }
  },
};
