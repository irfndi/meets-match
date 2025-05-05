import type { KVNamespace } from "@cloudflare/workers-types";
import { conversations, createConversation } from "@grammyjs/conversations";
import { KvAdapter } from "@grammyjs/storage-cloudflare";
import { Bot, session, webhookCallback } from "grammy";
import type { Context, SessionData } from "./bot/context";

import { registerMatchCommand } from "./bot/handlers/match";
import { registerProfileCommand } from "./bot/handlers/profile";
// Import command handlers
import { registerStartCommand } from "./bot/handlers/start";
import { initI18n } from "./locales/config";

// Import conversation logic
import { editProfileConversation } from "./bot/conversations/profile";

// Define environment variable structure
export interface Env {
  BOT_TOKEN: string;
  WORKER_ENV?: string;
  SESSIONS_KV: KVNamespace;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      // Ensure the BOT_TOKEN is set
      if (!env.BOT_TOKEN) {
        console.error("BOT_TOKEN is not set in environment variables.");
        return new Response("Internal Server Error: Bot token missing", {
          status: 500,
        });
      }

      // Initialize the bot with the custom context
      const bot = new Bot<Context>(env.BOT_TOKEN);

      // Initialize other services like i18n
      await initI18n(env);

      // --- Middleware Setup ---

      // 1. Session Middleware
      // Stores session data for each user.
      bot.use(
        session({
          initial: (): SessionData => ({}),
          storage: new KvAdapter<SessionData>(env.SESSIONS_KV),
          // Optional settings might be passed differently or not available
          // in this version/adapter.
          // Options like: { key_prefix: "session:", ttl: 60 * 60 * 24 } // 1 day
        })
      );

      // 2. Conversations Middleware
      // Must be installed after the session middleware.
      bot.use(conversations());

      // --- Register Conversations ---
      bot.use(createConversation(editProfileConversation, "editProfile"));

      // --- Register Bot Handlers ---
      registerStartCommand(bot);
      registerProfileCommand(bot);
      registerMatchCommand(bot);

      // --- Error Handling ---
      bot.catch((err) => {
        const ctx = err.ctx;
        console.error(`Error while handling update ${ctx.update.update_id}:`);
        const e = err.error;
        console.error("[Bot Error Handler] Error during webhook processing:");
        if (e instanceof Error) {
          console.error(`  Type: ${e.constructor.name}`);
          console.error(`  Message: ${e.message}`);
          if (e.stack) {
            console.error(
              `  Stack: ${e.stack.split("\n").slice(1).join("\n")}`
            ); // Log stack trace without the first line (error message)
          }
        } else {
          // Log non-standard errors
          console.error("  Caught non-Error object:", e);
        }
        // Consider adding more context here if possible, e.g., update ID if available
      });

      // Create a webhook handler for Cloudflare Workers
      // Grammy recommends 'cloudflare-mod' for Module Workers
      const handleUpdate = webhookCallback(bot, "cloudflare-mod");

      return await handleUpdate(request);
    } catch (err) {
      console.error("[Bot Error Handler] Error during webhook processing:");
      if (err instanceof Error) {
        console.error(`  Type: ${err.constructor.name}`);
        console.error(`  Message: ${err.message}`);
        if (err.stack) {
          console.error(
            `  Stack: ${err.stack.split("\n").slice(1).join("\n")}`
          ); // Log stack trace without the first line (error message)
        }
      } else {
        // Log non-standard errors
        console.error("  Caught non-Error object:", err);
      }
      // Consider adding more context here if possible, e.g., update ID if available
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};
