import { db } from "@/db/index"; // Import the initialized Drizzle db instance
import type { Bot, CommandMiddleware } from "grammy";
import { InlineKeyboard } from "grammy"; // Import InlineKeyboard
import type { User } from "../../models/user";
import { InteractionService } from "../../services/interaction_service"; // Import InteractionService
import { findMatches } from "../../services/matching_service";
import { getUserById } from "../../services/user_service";
import type { Context } from "../context";

/**
 * Handles the /match command.
 */
const matchHandler: CommandMiddleware<Context> = async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    console.error("[MatchHandler] User ID not found in context.");
    return ctx.reply("Sorry, I could not identify you. Please try again.");
  }

  try {
    const currentUser = await getUserById(userId);

    if (!currentUser) {
      return ctx.reply(
        "I could not find your profile. Have you run /start and completed your profile with /profile?"
      );
    }

    if (!currentUser.is_complete) {
      return ctx.reply(
        "Your profile is not complete yet. Please use /profile to finish setting it up before looking for matches."
      );
    }

    console.log(`[MatchHandler] Finding matches for user: ${currentUser.id}`);

    // InteractionService uses the imported 'db' instance directly
    const interactionService = new InteractionService();

    // Fetch potential matches using the matching service
    // Pass the imported Drizzle db instance
    const potentialMatches = await findMatches(db, interactionService, userId);

    if (potentialMatches.length === 0) {
      return ctx.reply(
        "No potential matches found right now. Check back later!"
      );
    }

    // Send each match as a separate message with details and actions
    await ctx.reply("Here are some potential matches for you:");

    for (const match of potentialMatches) {
      const name = match.name || "Unnamed User";
      const ageInfo = match.age ? `, ${match.age}` : "";
      // Truncate description to avoid overly long messages
      const descriptionSnippet = match.bio
        ? `\nBio: ${match.bio.substring(0, 70)}${match.bio.length > 70 ? "..." : ""}`
        : "";

      const messageText = `**${name}**${ageInfo}${descriptionSnippet}`;

      // Create inline keyboard
      const keyboard = new InlineKeyboard()
        .text("👤 View Profile", `view_profile_${match.id}`)
        .text("❤️ Like", `like_${match.id}`);

      await ctx.reply(messageText, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    }

    return; // Indicate successful handling
  } catch (error) {
    console.error(
      `[MatchHandler] Error finding matches for user ${userId}:`,
      error
    );
    return ctx.reply(
      "An error occurred while trying to find matches. Please try again later."
    );
  }
};

/**
 * Registers the /match command handler with the bot.
 * @param bot The Bot instance.
 */
export function registerMatchCommand(bot: Bot<Context>): void {
  bot.command("match", matchHandler);
  console.log("[Bot] Registered /match command handler.");
}
