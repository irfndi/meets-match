import type { MyContext } from "../types.js";
import { getProfileMenu } from "../menus/profile.js";
import type { Env } from "../index.js";
import {
  ensureUserExists,
  getProfileCompleteness,
  getMissingFieldsDisplay,
  computeAgeFromBirthDate,
} from "../lib/user-utils.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";

function escapeMarkdown(value: unknown): string {
  const text = typeof value === "string" ? value : String(value);
  return text.replace(/[_*\[\]`]/g, "\\$&");
}

export const profileCommand = async (
  ctx: MyContext,
  env: Env,
): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply("Could not identify you. Please try /start first.");
    return;
  }

  const result = await ensureUserExists(ctx, env);
  if (!result) {
    await ctx.reply(
      "❌ Sorry, there was an error loading your profile. Please try again later.",
    );
    return;
  }

  const { user } = result;
  const name = escapeMarkdown(user.displayName || "Not set");
  const computedAge = user.birthDate
    ? computeAgeFromBirthDate(user.birthDate)
    : user.age;
  const ageDisplay =
    computedAge !== undefined ? String(computedAge) : "Not set";
  const gender = user.gender
    ? (user.gender as string).charAt(0).toUpperCase() +
      (user.gender as string).slice(1)
    : "Not set";
  const bio = escapeMarkdown(user.bio || "Not set");
  const loc = user.location;
  const locationText = escapeMarkdown(
    loc?.city && loc?.country
      ? `${loc.city}, ${loc.country}`
      : loc?.city
        ? loc.city
        : loc?.latitude
          ? "📍 Shared"
          : "Not set",
  );
  const interests = escapeMarkdown(
    user.interests && Array.isArray(user.interests) && user.interests.length > 0
      ? (user.interests as string[]).join(", ")
      : "Not set",
  );
  const mediaCount =
    (user.mediaUrls as Array<unknown> | undefined)?.length ?? 0;
  const mediaText = mediaCount > 0 ? `${mediaCount}/3 uploaded` : "Not set";

  const { complete, missing } = getProfileCompleteness(user);

  const msgParts = [
    "👤 *Your Profile*",
    "",
    `*Name:* ${name}`,
    `*Age:* ${ageDisplay}`,
    `*Gender:* ${gender}`,
    `*Bio:* ${bio}`,
    `*Location:* ${locationText}`,
    `*Interests:* ${interests}`,
    `*Media:* ${mediaText}`,
  ];

  if (!complete) {
    msgParts.push(
      "",
      "⚠️ *Profile Incomplete*",
      "To start matching, please fill in:",
      getMissingFieldsDisplay(missing),
    );
  } else {
    msgParts.push("", "✅ *Profile complete!* Ready to match.");
  }

  msgParts.push("", "Select a field to edit:");

  await ctx.reply(msgParts.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: getProfileMenu(env, mediaCount),
  });
};
