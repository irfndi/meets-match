// biome-ignore lint/style/useImportType: <explanation>
import { Bot, webhookCallback, Context as BaseContext } from "grammy";

// Define the environment variables expected by the Worker
export interface Env {
  BOT_TOKEN: string;
  // Add other secrets or bindings from wrangler.toml here
  // Example: MY_KV_NAMESPACE: KVNamespace;
}

// Define a custom context type if needed later
// interface CustomContext extends BaseContext {
//   // Add custom properties here
//   // e.g., sessionData: SessionData;
// }
// type Context = CustomContext;
type Context = BaseContext; // Using BaseContext for now

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // Ensure the BOT_TOKEN is set
      if (!env.BOT_TOKEN) {
        console.error("BOT_TOKEN is not set in environment variables.");
        return new Response("Internal Server Error: Bot token missing", { status: 500 });
      }

      // Create a new bot instance
      const bot = new Bot<Context>(env.BOT_TOKEN);

      // --- Bot Logic Start ---
      // Register a simple command handler
      bot.command("start", (ctx) => ctx.reply("Hello from the Cloudflare Worker!"));

      // Register a basic message handler
      bot.on("message:text", (ctx) => ctx.reply("Got your message!"));
      // --- Bot Logic End ---

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
