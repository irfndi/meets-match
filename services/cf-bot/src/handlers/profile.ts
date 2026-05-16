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
import { mdv2 } from "../lib/i18n.js";
import { createLogger } from "@meetsmatch/cf-shared";
import { replyWithError } from "../lib/error-feedback.js";

const log = createLogger("cf-bot");

export const profileCommand = async (
  ctx: MyContext,
  env: Env,
): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply("Could not identify you. Please try /start first.");
    return;
  }

  try {
    const result = await ensureUserExists(ctx, env);
    if (!result) {
      await ctx.reply(
        "❌ Sorry, there was an error loading your profile. Please try again later.",
      );
      return;
    }

    const { user } = result;
    const name = user.displayName || "Not set";
    const computedAge = user.birthDate
      ? computeAgeFromBirthDate(user.birthDate)
      : user.age;
    const ageDisplay =
      computedAge !== undefined ? String(computedAge) : "Not set";
    const gender =
      typeof user.gender === "string" && user.gender
        ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1)
        : "Not set";
    const bio = user.bio || "Not set";
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
    const locationText = rawLocationText;
    const interests =
      user.interests &&
      Array.isArray(user.interests) &&
      user.interests.length > 0
        ? (user.interests as string[]).join(", ")
        : "Not set";
    const mediaCount =
      (user.mediaUrls as Array<unknown> | undefined)?.length ?? 0;
    const mediaText = mediaCount > 0 ? `${mediaCount}/3 uploaded` : "Not set";

    const { complete, missing } = getProfileCompleteness(user);

    const text = mdv2`👤 *Your Profile*

*Name:* ${name}
*Age:* ${ageDisplay}
*Gender:* ${gender}
*Bio:* ${bio}
*Location:* ${locationText}
*Interests:* ${interests}
*Media:* ${mediaText}`;

    const fullText = complete
      ? text +
        "\n\n✅ *Profile complete* Ready to match\n\nSelect a field to edit:"
      : text +
        "\n\n⚠️ *Profile Incomplete*\nTo start matching, please fill in:\n" +
        getMissingFieldsDisplay(missing) +
        "\n\nSelect a field to edit:";

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
          caption: fullText,
          parse_mode: "MarkdownV2",
          reply_markup: keyboard,
        });
      } else if (firstRenderable?.type === "video") {
        await ctx.replyWithVideo(firstRenderable.url, {
          caption: fullText,
          parse_mode: "MarkdownV2",
          reply_markup: keyboard,
        });
      } else {
        await ctx.reply(fullText, {
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
      await ctx.reply(fullText, {
        parse_mode: "MarkdownV2",
        reply_markup: keyboard,
      });
    }
  } catch (error) {
    log.error("profileCommand", "Unhandled error", undefined, error);
    await replyWithError(ctx, env, "en", { command: "profile" });
  }
};
