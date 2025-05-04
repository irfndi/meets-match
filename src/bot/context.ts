import type { Context as BaseContext } from "grammy";

// Define a custom context type for the bot.
// We can add custom properties here later, like session data or services.
export interface CustomContext extends BaseContext {
  // Example: db: DatabaseService;
  // Example: user?: User; // If using middleware to inject user data
}

// Use the custom context type throughout the bot.
export type Context = CustomContext;
