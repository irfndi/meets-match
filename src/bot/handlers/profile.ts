import type { Bot } from "grammy";
import { getUserById } from "../../services/user_service";
import type { Context } from "../context"; // Import our custom context

/**
 * Registers the /profile command handler.
 * This command initiates the profile editing conversation.
 *
 * @param bot The bot instance.
 */
export function registerProfileCommand(bot: Bot<Context>) {
  bot.command("profile", async (ctx) => {
    // Check if conversations API is available (it should be, as it's middleware)
    if (!ctx.conversation) {
      console.error("Conversations feature not available in context!");
      await ctx.reply(
        "Sorry, something went wrong. Cannot edit profile right now."
      );
      return;
    }

    const userId = ctx.from?.id;
    if (!userId) {
      console.error("User ID not found in context!");
      await ctx.reply(
        "Sorry, something went wrong. Cannot edit profile right now."
      );
      return;
    }

    // Fetch user fresh or use session data if reliable
    const user = ctx.session.user ?? (await getUserById(userId));

    if (!user) {
      // Should ideally not happen if /start worked, but handle defensively
      await ctx.reply(
        "Sorry, something went wrong. Cannot edit profile right now."
      );
      return;
    }

    try {
      // Enter the 'editProfile' conversation
      await ctx.conversation.enter("editProfile");
    } catch (error) {
      console.error("Failed to enter editProfile conversation:", error);
      await ctx.reply("Sorry, there was an error starting the profile editor.");
      // Optionally exit any potentially lingering conversation state
      await ctx.conversation.exit();
    }
  });

  bot.command("editprofile", async (ctx) => {
    await ctx.conversation.enter("editProfile");
  });
}
