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
import { mdv2, t, type Language } from "../lib/i18n.js";
import { createLogger } from "@meetsmatch/cf-shared";
import { replyWithError } from "../lib/error-feedback.js";

const log = createLogger("cf-bot");

export const profileCommand = async (
  ctx: MyContext,
  env: Env,
): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply(t("matchCouldNotIdentify", "en"));
    return;
  }

  try {
    const result = await ensureUserExists(ctx, env);
    if (!result) {
      await ctx.reply(t("genericError", "en"));
      return;
    }

    const { user } = result;
    const lang: Language = (user.language as Language) ?? "en";
    const name = user.displayName || t("profileInterestsNotSet", lang);
    const computedAge =
      user.age ??
      (user.birthDate ? computeAgeFromBirthDate(user.birthDate) : undefined);
    const ageDisplay =
      computedAge !== undefined
        ? String(computedAge)
        : t("profileInterestsNotSet", lang);
    const genderRaw =
      typeof user.gender === "string" && user.gender
        ? user.gender.toLowerCase()
        : null;
    const gender =
      genderRaw === "male"
        ? t("genderDisplayMale", lang)
        : genderRaw === "female"
          ? t("genderDisplayFemale", lang)
          : genderRaw
            ? t("genderDisplayOther", lang)
            : t("profileInterestsNotSet", lang);
    const bio = user.bio || t("profileInterestsNotSet", lang);
    const loc = user.location;
    let rawLocationText = t("profileInterestsNotSet", lang);
    const city = loc?.city as string | undefined;
    const country = loc?.country as string | undefined;
    if (city && country) {
      rawLocationText = `${city}, ${country}`;
    } else if (city) {
      rawLocationText = city;
    } else if (loc?.latitude) {
      rawLocationText = t("profileLocationShared", lang);
    }
    const locationText = rawLocationText;
    const interests =
      user.interests &&
      Array.isArray(user.interests) &&
      user.interests.length > 0
        ? (user.interests as string[]).join(", ")
        : t("profileInterestsNotSet", lang);
    const mediaCount =
      (user.mediaUrls as Array<unknown> | undefined)?.length ?? 0;
    const mediaText =
      mediaCount > 0
        ? t("profileMediaUploaded", lang, { count: String(mediaCount) })
        : t("profileInterestsNotSet", lang);

    const { complete, missing } = getProfileCompleteness(user);

    const text = mdv2`${t("profileYourProfile", lang)}

${t("profileNameLabel", lang, { value: name })}
${t("profileAgeLabel", lang, { value: ageDisplay })}
${t("profileGenderLabel", lang, { value: gender })}
${t("profileBioLabel", lang, { value: bio })}
${t("profileLocationLabel", lang, { value: locationText })}
${t("profileInterestsLabel", lang, { value: interests })}
${t("profileMediaLabel", lang, { value: mediaText })}`;

    const fullText = complete
      ? text +
        "\n\n" +
        t("profileCompleteReady", lang) +
        "\n\n" +
        t("profileSelectField", lang)
      : text +
        "\n\n" +
        t("profileIncompleteWarning", lang, {
          missing: getMissingFieldsDisplay(missing),
        }) +
        "\n\n" +
        t("profileSelectField", lang);

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
