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
import { escapeMarkdownV2 } from "../lib/i18n.js";
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-bot");

function escapeProfileField(value: unknown): string {
  const text = typeof value === "string" ? value : String(value);
  return escapeMarkdownV2(text);
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
  const name = escapeProfileField(user.displayName || "Not set");
  const computedAge = user.birthDate
    ? computeAgeFromBirthDate(user.birthDate)
    : user.age;
  const ageDisplay = escapeProfileField(
    computedAge !== undefined ? String(computedAge) : "Not set",
  );
  const gender = escapeProfileField(
    typeof user.gender === "string" && user.gender
      ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1)
      : "Not set",
  );
  const bio = escapeProfileField(user.bio || "Not set");
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
  const locationText = escapeProfileField(rawLocationText);
  const interests = escapeProfileField(
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
  // Preserve media order: show the first uploaded item (image or video)
  const firstRenderable = mediaUrls.find(
    (m) => m.type === "image" || m.type === "video",
  );
  const keyboard = getProfileMenu(env, mediaCount);

  try {
    if (firstRenderable?.type === "image") {
      await ctx.replyWithPhoto(firstRenderable.url, {
        caption: text,
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
    } else if (firstRenderable?.type === "video") {
      await ctx.replyWithVideo(firstRenderable.url, {
        caption: text,
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
    } else {
      await ctx.reply(text, {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
    }
  } catch (err) {
    log.error(
      "profileCommand",
      "failed to send media for profile",
      {
        userId: String(ctx.from?.id ?? "unknown"),
        chatId: String(ctx.chat?.id ?? "unknown"),
      },
      err instanceof Error ? err : new Error(String(err)),
    );
    await ctx.reply(text, {
      parse_mode: "MarkdownV2",
      reply_markup: keyboard,
    });
  }
};
