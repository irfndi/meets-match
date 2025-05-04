import { Bot, webhookCallback } from "grammy";
import type { Context } from "./bot/context"; // Import custom context
import { registerStartCommand } from "./bot/handlers/start"; // Import start handler

// Define the environment variables expected by the Worker
export interface Env {
  BOT_TOKEN: string;
  // Add other secrets or bindings from wrangler.toml here
  // Example: MY_KV_NAMESPACE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // Ensure the BOT_TOKEN is set
      if (!env.BOT_TOKEN) {
        console.error("BOT_TOKEN is not set in environment variables.");
        return new Response("Internal Server Error: Bot token missing", { status: 500 });
      }

      // Create a new bot instance using the custom context
      const bot = new Bot<Context>(env.BOT_TOKEN);

      // --- Register Bot Handlers ---
      registerStartCommand(bot); // Register the /start command
      // TODO: Register other handlers (profile, match, etc.) here

      // Create a webhook handler for Cloudflare Workers
      // Grammy recommends 'cloudflare-mod' for Module Workers
      const handleUpdate = webhookCallback(bot, "cloudflare-mod");

      return await handleUpdate(request);

    } catch (e) {
      // Basic error logging
      if (e instanceof Error) {
        console.error("Error in fetch handler:", e.message);
      } else {
        console.error("Unknown error in fetch handler:", e);
      }
      return new Response("Internal Server Error", { status: 500 });
    }
  },
};
