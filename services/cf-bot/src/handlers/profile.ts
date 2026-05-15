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
  return text.replace(/[_*\[\]`\\]/g, "\\$&");
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
  const gender =
    typeof user.gender === "string" && user.gender
      ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1)
      : "Not set";
  const bio = escapeMarkdown(user.bio || "Not set");
  const loc = user.location;
  let rawLocationText = "Not set";
  const city = loc?.city as string | undefined;
  const country = loc?.country as string | undefined;
  if (city && country) {
    rawLocationText = `${city}, ${country}`;
  } else if (city) {
    rawLocationText = city;
  } else if (loc?.latitude) {
    rawLocationText = "📍 Shared";
  }
  const locationText = escapeMarkdown(rawLocationText);
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

  const text = msgParts.join("\n");
  const mediaUrls = (user.mediaUrls ?? []) as Array<{
    url: string;
    type: string;
  }>;
  const firstImage = mediaUrls.find((m) => m.type === "image");
  const firstVideo = mediaUrls.find((m) => m.type === "video");
  const keyboard = getProfileMenu(env, mediaCount);

  try {
    if (firstImage) {
      await ctx.replyWithPhoto(firstImage.url, {
        caption: text,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } else if (firstVideo) {
      await ctx.replyWithVideo(firstVideo.url, {
        caption: text,
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    } else {
      await ctx.reply(text, {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
    }
  } catch {
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
  }
};
