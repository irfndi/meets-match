import { Bot, session } from "grammy";
import type { MyContext } from "./types.js";
import { startCommand, languageCallback } from "./handlers/start.js";
import { helpCommand, aboutCommand } from "./handlers/help.js";
import { profileCommand } from "./handlers/profile.js";
import { matchCommand, matchCallbacks } from "./handlers/match.js";
import { matchesCommand, matchesCallbacks } from "./handlers/matches.js";
import { settingsCommand, settingsCallbacks, handleAgeRangeCallback } from "./handlers/settings.js";
import { premiumCommand, premiumCallbacks, referralCommand } from "./handlers/premium.js";
import { activityTrackerMiddleware } from "./lib/activityTracker.js";
import { handleConversationMessage, handleContactMessage, handleLocationMessage, checkMandatoryUpdates } from "./lib/conversations.js";
import { handleProfileCallback } from "./menus/profile.js";
import { getNotifications, clearNotifications } from "./lib/notifications.js";
import { getMainMenuKeyboard } from "./lib/main-menu.js";
import { InlineKeyboard } from "grammy";
import { t, type Language } from "./lib/i18n.js";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  API_SERVICE: Fetcher;
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ENVIRONMENT?: string;
}

function createBot(env: Env): Bot<MyContext> {
  const bot = new Bot<MyContext>(env.BOT_TOKEN);

  bot.use(session({
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
  }));

  bot.use(activityTrackerMiddleware(env));

  // Mandatory profile update check — runs before commands and callbacks
  bot.use(async (ctx, next) => {
    if (!ctx.from) return next();
    // Skip if already in a birthdate conversation
    const state = await env.KV.get(`conversation:${ctx.from.id}`);
    if (state) {
      const parsed = JSON.parse(state) as { field?: string };
      if (parsed.field === 'birthdate') return next();
    }
    const needsUpdate = await checkMandatoryUpdates(ctx, env);
    if (needsUpdate) return;
    return next();
  });

  // Check for pending notifications only on command interactions (not every message)
  bot.use(async (ctx, next) => {
    if (!ctx.from || !ctx.message?.text?.startsWith("/")) return next();
    const userId = String(ctx.from.id);
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
        { reply_markup: keyboard }
      );
      await clearNotifications(env, userId);
    }
    return next();
  });

  // Register visible BotFather commands (clean, minimal set)
  void bot.api.setMyCommands([
    { command: "start", description: "Get started with MeetMatch" },
    { command: "profile", description: "View or edit your profile" },
    { command: "match", description: "Find your next match" },
    { command: "matches", description: "View your matches and likes" },
    { command: "settings", description: "Adjust match preferences" },
    { command: "premium", description: "Upgrade to Premium" },
    { command: "referral", description: "Invite friends for bonus swipes" },
    { command: "help", description: "How to use MeetMatch" },
    { command: "about", description: "About MeetMatch" },
  ]);

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

    if (
      data === "next_match" ||
      data === "view_matches" ||
      data.startsWith("match:")
    ) {
      return matchCallbacks(ctx, env);
    }

    if (data === "matches") {
      return matchesCommand(ctx, env);
    }

    if (
      data === "matches_close" ||
      data === "back_to_matches" ||
      data.startsWith("view_match_user_") ||
      data.startsWith("likes:")
    ) {
      return matchesCallbacks(ctx, env);
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
  });

  bot.on("message:contact", async (ctx) => {
    const handled = await handleContactMessage(ctx, env);
    if (handled) return;
  });

  bot.on("message:location", async (ctx) => {
    const handled = await handleLocationMessage(ctx, env);
    if (handled) return;
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message?.text;

    // Main menu keyboard buttons take priority over conversations
    switch (text) {
      case "🔍 Find Match":
        return matchCommand(ctx, env);
      case "💕 My Matches":
        return matchesCommand(ctx, env);
      case "👤 Profile":
        return profileCommand(ctx, env);
      case "⚙️ Settings":
        return settingsCommand(ctx, env);
    }

    const handled = await handleConversationMessage(ctx, env);
    if (handled) return;

    await ctx.reply(
      "I'm not sure what you mean. Use the menu below or try /help for guidance.",
      { reply_markup: getMainMenuKeyboard() }
    );
  });

  return bot;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
        const update = await request.json() as import("@grammyjs/types").Update;
        const bot = createBot(env);
        await bot.init();
        await bot.handleUpdate(update);
        return new Response("OK", { status: 200 });
      } catch (error) {
        console.error("Webhook error:", error);
        return new Response(JSON.stringify({ error: "Internal Server Error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (url.pathname === "/send-notification" && request.method === "POST") {
      try {
        const body = await request.json() as Record<string, unknown>;
        if (typeof body.userId !== "string" || typeof body.type !== "string") {
          return new Response(JSON.stringify({ error: "Invalid request: userId and type are required strings" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const userId = body.userId;
        const type = body.type;
        const payload = typeof body.payload === "string" ? JSON.parse(body.payload) : (body.payload ?? {});

        const bot = createBot(env);
        let message: string;
        let keyboard: import("grammy").InlineKeyboard | undefined;

        const otherUsername = payload.otherUsername as string | undefined;

        if (type === "like") {
          const fromName = payload.fromDisplayName ?? "Someone";
          message = `💕 *New Like!*\n\n${fromName} liked your profile! Use *💕 My Matches* to see who likes you.`;
        } else if (type === "mutual_match") {
          const otherName = payload.otherDisplayName ?? "Someone";
          message = `🎉 *It's a Match!*\n\nYou and *${otherName}* have liked each other! 💕`;
          if (otherUsername) {
            message += `\n\n👉 [Start chatting](https://t.me/${otherUsername})`;
          }
          keyboard = new InlineKeyboard().text("💕 View Matches", "matches").row();
        } else if (type === "BIRTHDAY") {
          message = payload.message || `🎂 Someone has a birthday today!`;
          keyboard = new InlineKeyboard().text("💕 View Matches", "matches").row();
        } else {
          message = payload.message || `You have a new ${type} notification!`;
        }

        await bot.api.sendMessage(userId, message, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
          link_preview_options: otherUsername ? { is_disabled: false } : undefined,
        });

        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Send notification error:", errorMessage);
        return new Response(JSON.stringify({ error: errorMessage }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
};
