import type { Bot } from "grammy";
import type { Context } from "../context"; // Assuming we'll create a context type later

/**
 * Registers the /start command handler.
 *
 * @param bot The Bot instance to register the command with.
 */
export function registerStartCommand(bot: Bot<Context>): void {
  bot.command("start", async (ctx) => {
    // TODO: Implement user creation/lookup logic from the Python version
    // TODO: Add proper logging
    // TODO: Add i18n for messages

    // Get user info for the welcome message
    const firstName = ctx.from?.first_name || "User";

    const welcomeMessage = `👋 Welcome to MeetMatch, ${firstName}!\n\nI can help you find potential matches based on your profile.\n\nUse /help to see available commands.`;

    try {
      await ctx.reply(welcomeMessage, {
        parse_mode: "MarkdownV2", // Optional: Use Markdown for formatting
      });
    } catch (error) {
      console.error("Failed to send start message:", error);
      // Optionally send a fallback message
      await ctx.reply(`Welcome, ${firstName}! Failed to load full welcome message.`);
    }
  });
}
