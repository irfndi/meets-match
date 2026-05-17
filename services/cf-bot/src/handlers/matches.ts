import { InlineKeyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-bot");
import {
  ensureUserExists,
  getProfileCompleteness,
  getMissingFieldsDisplay,
  isPhoneVerified,
} from "../lib/user-utils.js";
import { promptPhoneVerification } from "../lib/conversations.js";
import {
  getNotifications,
  removeNotification,
  type LikeNotification,
  type MutualMatchNotification,
} from "../lib/notifications.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import { t, escapeMd } from "../lib/i18n.js";
import { type Language } from "../lib/i18n.js";
import { ApiServiceClient } from "../services/api-client.js";
import { replyWithError } from "../lib/error-feedback.js";

function buildChatLink(
  otherUser: Record<string, unknown>,
  lang: Language,
): string {
  const username = otherUser.username as string | undefined;
  const displayName = (otherUser.displayName ??
    otherUser.first_name ??
    "Someone") as string;
  if (username) {
    return t("matchesChatWith", lang, { name: escapeMd(displayName) });
  }
  return t("matchesNoUsernameSet", lang, { name: escapeMd(displayName) });
}

function formatMatch(match: Record<string, unknown>, lang: Language): string {
  const name = (match.displayName ?? match.first_name ?? "Unknown") as string;
  const age = match.age ?? "?";
  const bio = match.bio ? `\n📝 ${escapeMd(String(match.bio))}` : "";
  const matchedAt = match.matched_at
    ? t("matchesMatchedAt", lang, { time: String(match.matched_at) })
    : t("matchesMatchedAt", lang, { time: t("matchesMatchedRecently", lang) });
  return `💕 ${escapeMd(name)}, ${age}${bio}\n${matchedAt}`;
}

async function fetchMutualMatches(env: Env, userId: string) {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(
        `http://api/matches?userId=${userId}&status=MATCHED&limit=50`,
      ),
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      matches?: Array<Record<string, unknown>>;
    };
    return data.matches ?? [];
  } catch (error) {
    log.error(
      "fetchMutualMatches",
      "Failed to fetch mutual matches",
      { userId },
      error,
    );
    return [];
  }
}

async function fetchPendingLikes(env: Env, userId: string) {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}/pending-likes`),
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      pendingLikes?: Array<Record<string, unknown>>;
    };
    return data.pendingLikes ?? [];
  } catch (error) {
    log.error(
      "fetchPendingLikes",
      "Failed to fetch pending likes",
      { userId },
      error,
    );
    return [];
  }
}

export const matchesCommand = async (
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
    const { complete, missing } = getProfileCompleteness(user);

    if (!complete) {
      await ctx.reply(
        `⚠️ *Almost there!*\n\nComplete your profile before viewing matches:\n\n${getMissingFieldsDisplay(missing)}\n\nTap *👤 Profile* to finish setting up.`,
        { parse_mode: "Markdown", reply_markup: getMainMenuKeyboard() },
      );
      return;
    }

    const lang = (user.language as Language) ?? "en";
    if (!isPhoneVerified(user)) {
      await promptPhoneVerification(ctx, env, lang);
      return;
    }

    const userId = String(ctx.from.id);

    // 1. Show stored notifications (mutual matches + likes)
    const notifications = await getNotifications(env, userId);
    const mutualNotifications = notifications.filter(
      (n): n is MutualMatchNotification => n.type === "mutual_match",
    );
    const likeNotifications = notifications.filter(
      (n): n is LikeNotification => n.type === "like",
    );

    if (mutualNotifications.length > 0) {
      await ctx.reply(
        t("matchesNewMutualMatches", lang, {
          count: String(mutualNotifications.length),
        }),
      );
      for (const notif of mutualNotifications) {
        const msg = [
          t("mutualMatch", lang, {
            name: escapeMd(notif.otherDisplayName ?? "Someone"),
          }),
          buildChatLink(
            {
              displayName: notif.otherDisplayName,
              username: notif.otherUsername,
            },
            lang,
          ),
        ].join("\n");
        await ctx.reply(msg, { parse_mode: "Markdown" });
      }
    }

    if (likeNotifications.length > 0) {
      const keyboard = new InlineKeyboard();
      for (let i = 0; i < likeNotifications.length; i++) {
        const notif = likeNotifications[i];
        keyboard
          .text(`❤️ ${notif.fromDisplayName}`, `likes:view:${notif.fromUserId}`)
          .row();
      }
      keyboard.text(t("matchesDismissAll", lang), "likes:dismiss");
      await ctx.reply(
        t("matchesNewLikes", lang, {
          count: String(likeNotifications.length),
        }),
        { reply_markup: keyboard },
      );
    }

    // 2. Fetch mutual matches from API
    const mutualMatches = await fetchMutualMatches(env, userId);

    // 3. Fetch pending likes from API (users who liked you but you haven't responded)
    const pendingLikes = await fetchPendingLikes(env, userId);

    const totalMatches = mutualMatches.length;
    const totalPending = pendingLikes.length;

    if (
      totalMatches === 0 &&
      totalPending === 0 &&
      notifications.length === 0
    ) {
      await ctx.reply(t("matchesNoMatches", lang), {
        parse_mode: "Markdown",
        reply_markup: getMainMenuKeyboard(),
      });
      return;
    }

    if (totalMatches > 0) {
      await ctx.reply(
        t("matchesMutualMatchesCount", lang, { count: String(totalMatches) }),
      );
      for (const match of mutualMatches) {
        // Fetch the other user's profile
        const otherUserId =
          match.user1Id === userId ? match.user2Id : match.user1Id;
        try {
          const client = new ApiServiceClient(env.API_SERVICE);
          const userRes = await client.getUser({ userId: String(otherUserId) });
          const otherUser = userRes.user as Record<string, unknown>;
          const msg = formatMatch(otherUser, lang);
          const chatLink = buildChatLink(otherUser, lang);
          const mediaUrls = (otherUser.mediaUrls ?? []) as Array<{
            url: string;
            type: string;
          }>;
          // Preserve media order: show the first uploaded item (image or video)
          const firstRenderable = mediaUrls.find(
            (m) => m.type === "image" || m.type === "video",
          );
          const text = `${msg}\n${chatLink}`;

          try {
            if (firstRenderable?.type === "image") {
              await ctx.replyWithPhoto(firstRenderable.url, {
                caption: text,
                parse_mode: "Markdown",
              });
            } else if (firstRenderable?.type === "video") {
              await ctx.replyWithVideo(firstRenderable.url, {
                caption: text,
                parse_mode: "Markdown",
              });
            } else {
              await ctx.reply(text, { parse_mode: "Markdown" });
            }
          } catch {
            await ctx.reply(text, { parse_mode: "Markdown" });
          }
        } catch {
          await ctx.reply(formatMatch(match, lang));
        }
      }
    }

    if (totalPending > 0) {
      const keyboard = new InlineKeyboard();
      for (const pending of pendingLikes) {
        const name = (pending.displayName ??
          pending.first_name ??
          "Someone") as string;
        keyboard.text(`❤️ ${name}`, `likes:view:${pending.id}`).row();
      }
      await ctx.reply(`💕 ${totalPending} person(s) liked you! See them now?`, {
        reply_markup: keyboard,
      });
    }

    await ctx.reply(t("matchesNavigatePrompt", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  } catch (error) {
    log.error("matchesCommand", "Unhandled error", undefined, error);
    await replyWithError(ctx, env, "en", { command: "matches" });
  }
};

export const matchesCallbacks = async (
  ctx: MyContext,
  env: Env,
): Promise<void> => {
  if (!ctx.from || !ctx.callbackQuery?.data) {
    await ctx.answerCallbackQuery().catch(() => {});
    return;
  }
  const userId = String(ctx.from.id);
  const data = ctx.callbackQuery.data;

  // Resolve language
  let lang: Language = "en";
  try {
    const client = new ApiServiceClient(env.API_SERVICE);
    const userRes = await client.getUser({ userId });
    lang = (userRes.user?.language as Language) ?? "en";
  } catch {
    /* fallback to en */
  }

  try {
    if (data === "likes:dismiss") {
      const notifications = await getNotifications(env, userId);
      // Remove from end to beginning to preserve indices
      for (const n of notifications) {
        if (n.type === "like") {
          await removeNotification(env, userId, n.id);
        }
      }
      await ctx
        .answerCallbackQuery(t("matchesDismissed", lang))
        .catch(() => {});
      await ctx.editMessageText(t("matchesSeeAnytime", lang)).catch(() => {});
      return;
    }

    if (data.startsWith("likes:view:")) {
      const targetUserId = data.replace("likes:view:", "");
      await ctx
        .answerCallbackQuery(t("matchesLoadingProfile", lang))
        .catch(() => {});

      try {
        const client = new ApiServiceClient(env.API_SERVICE);
        const userRes = await client.getUser({ userId: targetUserId });
        const targetUser = userRes.user as Record<string, unknown>;
        const name = (targetUser.displayName ??
          targetUser.first_name ??
          "Unknown") as string;
        const age = targetUser.age ?? "?";
        const bio = targetUser.bio ? `\n📝 ${targetUser.bio}` : "";
        const interests = targetUser.interests
          ? `\n🌟 ${Array.isArray(targetUser.interests) ? (targetUser.interests as string[]).join(", ") : String(targetUser.interests)}`
          : "";
        const mediaUrls = (targetUser.mediaUrls ?? []) as Array<{
          url: string;
          type: string;
        }>;
        // Preserve media order: show the first uploaded item (image or video)
        const firstRenderable = mediaUrls.find(
          (m) => m.type === "image" || m.type === "video",
        );

        const keyboard = new InlineKeyboard()
          .text(t("matchesLikeBack", lang), `match:like:${targetUserId}`)
          .text(t("matchesPass", lang), `match:dislike:${targetUserId}`)
          .row();

        const text = `${name}, ${age}${bio}${interests}`;
        try {
          if (firstRenderable?.type === "image") {
            await ctx.replyWithPhoto(firstRenderable.url, {
              caption: text,
              reply_markup: keyboard,
            });
          } else if (firstRenderable?.type === "video") {
            await ctx.replyWithVideo(firstRenderable.url, {
              caption: text,
              reply_markup: keyboard,
            });
          } else {
            await ctx.reply(text, { reply_markup: keyboard });
          }
        } catch {
          await ctx.reply(text, { reply_markup: keyboard });
        }

        // Remove this like notification
        const notifications = await getNotifications(env, userId);
        const notification = notifications.find(
          (n) => n.type === "like" && n.fromUserId === targetUserId,
        );
        if (notification)
          await removeNotification(env, userId, notification.id);
      } catch {
        await ctx.reply(t("matchesCouldNotLoad", lang));
      }
      return;
    }

    await ctx
      .answerCallbackQuery(t("matchesUnknownAction", lang))
      .catch(() => {});
  } catch (error) {
    log.error("matchesCallbacks", "Unhandled error", undefined, error);
    await replyWithError(ctx, env, "en", { action: "matches_callback" });
    await ctx.answerCallbackQuery().catch(() => {});
  }
};
