import type { Conversation } from "@grammyjs/conversations";
import { InlineKeyboard } from "grammy";
import type { User, UserPreferences } from "../../models/user";
import { Gender, GenderPreference } from "../../models/user";
import { getUserById, updateUser } from "../../services/user_service";
import type { Context, ConversationContext } from "../context";

/**
 * Conversation logic for editing the user's profile.
 * ID: 'editProfile'
 */
export async function editProfileConversation(
  conversation: ConversationContext,
  ctx: Context
): Promise<void> {
  // Use ctx for standard context properties/methods
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.reply(
      "Could not identify user. Please try starting the bot again."
    );
    return; // Exit the conversation
  }

  // Get current user data using conversation.external
  const user = await conversation.external(() => getUserById(userId));
  if (!user) {
    await ctx.reply("Could not find your profile. Please use /start first.");
    return;
  }

  await ctx.reply("Let's update your profile.");

  /**
   * Check if the user wants to cancel the conversation.
   */
  async function checkForCancel(ctx: Context, text?: string): Promise<boolean> {
    if (text?.toLowerCase() === "/cancel") {
      await ctx.reply("Profile update cancelled.");
      return true;
    }
    return false;
  }

  // --- Ask for Name ---
  await ctx.reply(
    `Current name: ${user.name || "Not set"}. What would you like your new display name to be? (or type /skip or /cancel)`
  );
  const nameMessage = await conversation.waitFor("message:text");
  if (await checkForCancel(ctx, nameMessage.message.text)) return;
  const newName = nameMessage.message.text.trim();

  if (newName.toLowerCase() === "/skip") {
    await ctx.reply("Skipping name update.");
  } else if (!newName) {
    await ctx.reply("Invalid name provided. Keeping the current name.");
  } else {
    user.name = newName;
    await ctx.reply(`OK, updated name to: ${newName}`);
  }

  // --- Ask for Age ---
  await ctx.reply(
    `Current age: ${user.age || "Not set"}. What is your age? (Enter a number, or type /skip or /cancel)`
  );
  const ageMessage = await conversation.waitFor("message:text");
  if (await checkForCancel(ctx, ageMessage.message.text)) return;
  const ageInput = ageMessage.message.text.trim();

  if (ageInput.toLowerCase() === "/skip") {
    await ctx.reply("Skipping age update.");
  } else {
    const newAge = Number.parseInt(ageInput, 10);
    if (Number.isNaN(newAge) || newAge <= 0 || newAge > 120) {
      await ctx.reply(
        "Invalid age provided. Please enter a realistic number. Keeping the current age."
      );
    } else {
      user.age = newAge;
      await ctx.reply(`OK, updated age to: ${newAge}`);
    }
  }

  // --- Ask for Description ---
  await ctx.reply(
    `Current description: ${user.description || "Not set"}. Tell us a bit about yourself! (or type /skip or /cancel)`
  );
  const descMessage = await conversation.waitFor("message:text");
  if (await checkForCancel(ctx, descMessage.message.text)) return;
  const newDescription = descMessage.message.text.trim();

  if (newDescription.toLowerCase() === "/skip") {
    await ctx.reply("Skipping description update.");
  } else if (!newDescription) {
    user.description = "";
    await ctx.reply("OK, cleared description.");
  } else {
    user.description = newDescription;
    await ctx.reply("OK, updated description.");
  }

  // --- Ask for Preferred Gender ---
  const genderKeyboard = new InlineKeyboard()
    .text("Male", "gender_male")
    .row()
    .text("Female", "gender_female")
    .row()
    .text("Everyone", "gender_all");

  await ctx.reply(
    `Current preference: ${user.preferences.gender_preference}. Whom are you interested in meeting?`,
    { reply_markup: genderKeyboard }
  );

  const genderCallback = await conversation.waitFor("callback_query:data");
  const chosenGender = genderCallback.callbackQuery.data;

  let newPref: GenderPreference | null = null;
  switch (chosenGender) {
    case "gender_male":
      newPref = GenderPreference.Men;
      break;
    case "gender_female":
      newPref = GenderPreference.Women;
      break;
    case "gender_all":
      newPref = GenderPreference.Everyone;
      break;
    default:
      await ctx.reply("Invalid choice. Keeping current preference.");
  }

  if (newPref) {
    if (user?.preferences) {
      user.preferences.gender_preference = newPref;
      await ctx.reply(`OK, updated preference to: ${newPref}`);
    } else {
      await ctx.reply("Error: Could not access user preferences.");
    }
  } else {
    await ctx.reply(
      `Keeping current preference: ${user?.preferences?.gender_preference || "Not set"}`
    );
  }
  await genderCallback.answerCallbackQuery();
  await ctx.editMessageReplyMarkup();

  await ctx.reply("Profile update finished.");

  try {
    await conversation.external(() => updateUser(userId, user as User));
    await ctx.reply("Profile saved successfully!");
  } catch (error) {
    console.error("Failed to update user profile:", error);
    await ctx.reply(
      "Sorry, there was an error saving your profile. Please try again later."
    );
  }

  return;
}
