import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import i18next from "../../locales/config"; // Import the configured i18next instance
import { findOrCreateUser } from "../../services/user_service";
import type { Context } from "./../context";

/**
 * Registers the /start command handler.
 *
 * @param bot The Bot instance.
 */
export function registerStartCommand(bot: Bot<Context>): void {
  bot.command("start", async (ctx) => {
    const userId = ctx.from?.id;
    const username = ctx.from?.username;
    const firstName = ctx.from?.first_name || "User";

    if (!userId) {
      console.error("Cannot process /start command: User ID is missing.");
      // Optionally reply to the user, though this is unlikely if `ctx.from` is missing
      return ctx.reply(i18next.t("error_id_missing"));
    }

    try {
      // Find or create the user in the database
      const user = await findOrCreateUser(userId, username);
      console.log(
        `User ${user.id} processed (/start). New? ${user.created_at.getTime() === user.updated_at.getTime()}`
      );

      const welcomeMessage = i18next.t("welcome_new", { firstName });

      await ctx.reply(welcomeMessage, {
        // Optional: Use Markdown for formatting
        // parse_mode: "MarkdownV2",
      });
    } catch (error) {
      console.error(`Failed processing /start for user ${userId}:`, error);
      // Optionally send a fallback message
      await ctx.reply(i18next.t("error_generic"));
    }
  });
}
