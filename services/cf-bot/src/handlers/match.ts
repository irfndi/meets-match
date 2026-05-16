import { InlineKeyboard, Keyboard } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-bot");
import {
  ensureUserExists,
  getProfileCompleteness,
  getMissingFieldsDisplay,
  isPhoneVerified,
  isBirthdayToday,
  computeAgeFromBirthDate,
  type UserProfile,
} from "../lib/user-utils.js";
import { addNotification } from "../lib/notifications.js";
import {
  getConversationState,
  setConversationState,
  clearConversationState,
} from "../lib/conversations.js";

async function enqueueNotification(
  env: Env,
  userId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await env.API_SERVICE.fetch(
      new Request("http://api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          type,
          payload: JSON.stringify(payload),
        }),
      }),
    );
  } catch (error) {
    console.error("Failed to enqueue notification:", error);
  }
}

async function getInteractionStatus(
  env: Env,
  userId: string,
): Promise<{
  likesRemaining: number;
  dislikesRemaining: number;
  tier: string;
} | null> {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}/interaction-status`, {
        method: "GET",
      }),
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      likesRemaining: number;
      dislikesRemaining: number;
      tier: string;
    };
    return data;
  } catch (error) {
    console.error("Failed to get interaction status:", error);
    return null;
  }
}
import { promptPhoneVerification } from "../lib/conversations.js";
import { ApiServiceClient } from "../services/api-client.js";
import { getMainMenuKeyboard } from "../lib/main-menu.js";
import { t, type Language, escapeMarkdownV2 } from "../lib/i18n.js";

function getLang(user: Record<string, unknown> | UserProfile): Language {
  return (user.language as Language) ?? "en";
}

async function fetchUserLang(env: Env, userId: string): Promise<Language> {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    if (!res.ok) return "en";
    const data = (await res.json()) as { user?: Record<string, unknown> };
    return getLang(data.user ?? {});
  } catch (error) {
    log.error(
      "fetchUserLang",
      "Failed to fetch user language",
      { userId },
      error,
    );
    return "en";
  }
}

async function ensureDefaultPreferences(
  env: Env,
  userId: string,
  user: Record<string, unknown>,
): Promise<void> {
  // Always fetch fresh preferences from the API to avoid overwriting
  // custom preferences with stale data from a previous fetch
  let freshPrefs: Record<string, unknown> = {};
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, { method: "GET" }),
    );
    if (res.ok) {
      const data = (await res.json()) as { user?: Record<string, unknown> };
      freshPrefs =
        (data.user?.preferences as Record<string, unknown> | undefined) ?? {};
    } else {
      // API returned non-OK — fall back to cached user object to avoid
      // overwriting existing preferences during transient failures
      freshPrefs =
        (user.preferences as Record<string, unknown> | undefined) ?? {};
    }
  } catch {
    // fall back to the passed-in user object
    freshPrefs =
      (user.preferences as Record<string, unknown> | undefined) ?? {};
  }

  const hasPrefs =
    freshPrefs.minAge !== undefined ||
    freshPrefs.maxAge !== undefined ||
    freshPrefs.maxDistance !== undefined ||
    freshPrefs.genderPreference !== undefined;
  if (hasPrefs) return;

  const age = user.birthDate
    ? computeAgeFromBirthDate(String(user.birthDate))
    : (user.age as number | undefined);
  const gender = user.gender as string | undefined;
  if (!age || !gender) return;

  const minAge = Math.max(12, age - 7);
  const maxAge = Math.min(80, age + 7);
  const maxDistance = 25;

  let genderPreference: string[];
  if (gender === "male") genderPreference = ["female"];
  else if (gender === "female") genderPreference = ["male"];
  else genderPreference = ["male", "female", "other", "prefer_not_to_say"];

  try {
    await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, {
        method: "PUT",
        body: JSON.stringify({
          user: {
            preferences: { minAge, maxAge, maxDistance, genderPreference },
          },
        }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch (error) {
    console.error("Failed to set default preferences:", error);
  }
}

async function fetchPotentialMatches(
  env: Env,
  userId: string,
  limit = 5,
): Promise<{ matches: Array<Record<string, unknown>>; relaxed: boolean }> {
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(
        `http://api/users/${userId}/potential-matches?limit=${limit}`,
      ),
    );
    if (!res.ok) return { matches: [], relaxed: false };
    const data = (await res.json()) as {
      potentialMatches?: Array<Record<string, unknown>>;
      relaxed?: boolean;
    };
    return {
      matches: data.potentialMatches ?? [],
      relaxed: data.relaxed ?? false,
    };
  } catch (error) {
    log.error(
      "fetchPotentialMatches",
      "Failed to fetch potential matches",
      { userId },
      error,
    );
    return { matches: [], relaxed: false };
  }
}

const MATCH_QUEUE_TTL = 600; // 10 minutes
const LAST_ACTION_TTL = 3600; // 1 hour
const ACTION_LOCK_TTL = 5; // 5 seconds — prevent double-processing
const DM_BYPASS_LIMIT = 100;
const DM_BYPASS_TTL = 86400; // 24 hours

interface MatchQueue {
  matches: Array<Record<string, unknown>>;
  index: number;
  tier: string;
  relaxed: boolean;
}

interface LastAction {
  matchId: string;
  targetUserId: string;
  action: string;
  timestamp: string;
}

async function getMatchQueue(
  kv: KVNamespace,
  userId: string,
): Promise<MatchQueue | null> {
  const value = await kv.get(`match_queue:${userId}`);
  return value ? JSON.parse(value) : null;
}

async function setMatchQueue(
  kv: KVNamespace,
  userId: string,
  queue: MatchQueue,
): Promise<void> {
  await kv.put(`match_queue:${userId}`, JSON.stringify(queue), {
    expirationTtl: MATCH_QUEUE_TTL,
  });
}

async function clearMatchQueue(kv: KVNamespace, userId: string): Promise<void> {
  await kv.delete(`match_queue:${userId}`);
}

async function getLastAction(
  kv: KVNamespace,
  userId: string,
): Promise<LastAction | null> {
  const value = await kv.get(`last_action:${userId}`);
  return value ? JSON.parse(value) : null;
}

async function setLastAction(
  kv: KVNamespace,
  userId: string,
  action: LastAction,
): Promise<void> {
  await kv.put(`last_action:${userId}`, JSON.stringify(action), {
    expirationTtl: LAST_ACTION_TTL,
  });
}

async function clearLastAction(kv: KVNamespace, userId: string): Promise<void> {
  await kv.delete(`last_action:${userId}`);
}

async function acquireActionLock(
  kv: KVNamespace,
  userId: string,
): Promise<boolean> {
  const key = `action_lock:${userId}`;
  const existing = await kv.get(key);
  if (existing) return false;
  await kv.put(key, "1", { expirationTtl: ACTION_LOCK_TTL });
  return true;
}

async function releaseActionLock(
  kv: KVNamespace,
  userId: string,
): Promise<void> {
  await kv.delete(`action_lock:${userId}`);
}

// --- Premium+ DM Bypass tracking ---

interface DMBypassStatus {
  used: number;
  resetAt: string;
}

async function getDMBypassStatus(
  kv: KVNamespace,
  userId: string,
): Promise<DMBypassStatus> {
  const value = await kv.get(`dm_bypass:${userId}`);
  if (value) {
    const parsed = JSON.parse(value) as DMBypassStatus;
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();
    if (parsed.resetAt < today) {
      return { used: 0, resetAt: today };
    }
    return parsed;
  }
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
  return { used: 0, resetAt: today };
}

async function useDMBypass(
  kv: KVNamespace,
  userId: string,
): Promise<{ used: number; remaining: number }> {
  const status = await getDMBypassStatus(kv, userId);
  status.used++;
  await kv.put(`dm_bypass:${userId}`, JSON.stringify(status), {
    expirationTtl: DM_BYPASS_TTL,
  });
  return {
    used: status.used,
    remaining: Math.max(0, DM_BYPASS_LIMIT - status.used),
  };
}

function buildMatchCardKeyboard(targetUserId: string, tier: string) {
  const isPremium = tier === "premium" || tier === "premium_plus";
  const keyboard = new InlineKeyboard();
  if (isPremium) {
    keyboard.text("↩️", `match:undo:${targetUserId}`);
  }
  keyboard.text("👎", `match:dislike:${targetUserId}`);
  keyboard.text("❤️", `match:like:${targetUserId}`);
  keyboard.row();
  keyboard.text("💌", `match:like-message:${targetUserId}`);
  keyboard.text("📩 Send DM", `dm:send:${targetUserId}`);
  return keyboard;
}

export function getMatchActionKeyboard(tier: string): Keyboard {
  const isPremium = tier === "premium" || tier === "premium_plus";
  const keyboard = new Keyboard();

  if (isPremium) {
    keyboard.text("↩️").text("👎").text("⏩");
    keyboard.row();
    keyboard.text("⚠️").text("💌").text("❤️");
    keyboard.row();
  } else {
    keyboard.text("👎").text("⚠️").text("❤️");
    keyboard.row();
    keyboard.text("💌");
    keyboard.row();
  }

  keyboard.text("🏠 Main menu");
  if (isPremium) {
    keyboard.text("🎁 Send a gift");
  }

  return keyboard.resized();
}

function formatProfile(user: Record<string, unknown>, index: number): string {
  const name = (user.displayName ?? user.first_name ?? "Unknown") as string;
  const age = user.age ?? "?";
  const bio = user.bio ? `\n📝 ${user.bio}` : "";
  const interests = user.interests
    ? `\n🌟 ${Array.isArray(user.interests) ? (user.interests as string[]).join(", ") : String(user.interests)}`
    : "";
  return `${index}. ${name}, ${age}${bio}${interests}`;
}

function getGenderPronoun(gender: string | undefined): string {
  switch (gender) {
    case "male":
      return "him";
    case "female":
      return "her";
    default:
      return "them";
  }
}

function buildMatchCard(otherUser: Record<string, unknown>): string {
  const name = escapeMarkdownV2(
    (otherUser.displayName ?? otherUser.first_name ?? "Someone") as string,
  );
  const age = otherUser.age ?? "?";
  const birthdayBadge = isBirthdayToday(
    otherUser.birthDate as string | undefined,
  )
    ? " 🎂"
    : "";
  const loc = otherUser.location as Record<string, unknown> | undefined;
  const locationText =
    loc?.city && loc?.country
      ? escapeMarkdownV2(`${loc.city}, ${loc.country}`)
      : loc?.latitude
        ? "📍 Nearby"
        : "";
  let bio = "";
  if (otherUser.bio) {
    const bioText = String(otherUser.bio);
    // Truncate long bios with spoiler expand/collapse
    const maxBioLen = 180;
    if (bioText.length > maxBioLen) {
      const visiblePart = escapeMarkdownV2(bioText.slice(0, maxBioLen));
      const spoilerPart = escapeMarkdownV2(bioText.slice(maxBioLen));
      bio = `\n📝 ${visiblePart}||${spoilerPart}||`;
    } else {
      bio = `\n📝 ${escapeMarkdownV2(bioText)}`;
    }
  }
  const interests = otherUser.interests
    ? `\n🌟 ${escapeMarkdownV2(Array.isArray(otherUser.interests) ? (otherUser.interests as string[]).join(", ") : String(otherUser.interests))}`
    : "";

  const parts = [`👤 ${name}, ${age}${birthdayBadge}`];
  if (locationText) parts.push(`📍 ${locationText}`);
  if (bio) parts.push(bio);
  if (interests) parts.push(interests);
  return parts.join("\n");
}

function buildChatLink(otherUser: Record<string, unknown>): string {
  const username = otherUser.username as string | undefined;
  const displayName = (otherUser.displayName ??
    otherUser.first_name ??
    "Someone") as string;
  if (username) {
    return `👉 [Start chatting with ${displayName}](https://t.me/${username})`;
  }
  return `💬 ${displayName} hasn't set a username yet. You can share your username with them!`;
}

async function sendMatchCard(
  ctx: MyContext,
  match: Record<string, unknown>,
  lang: Language,
  tier: string,
): Promise<void> {
  const text = buildMatchCard(match);
  const mediaUrls = (match.mediaUrls ?? []) as unknown as Array<{
    url: string;
    type: string;
  }>;
  const firstImage = mediaUrls.find((m) => m.type === "image");
  const firstVideo = mediaUrls.find((m) => m.type === "video");
  const inlineKeyboard = buildMatchCardKeyboard(String(match.id), tier);

  try {
    if (firstImage) {
      await ctx.replyWithPhoto(firstImage.url, {
        caption: text,
        parse_mode: "MarkdownV2",
        reply_markup: inlineKeyboard,
      });
    } else if (firstVideo) {
      await ctx.replyWithVideo(firstVideo.url, {
        caption: text,
        parse_mode: "MarkdownV2",
        reply_markup: inlineKeyboard,
      });
    } else {
      await ctx.reply(text, {
        parse_mode: "MarkdownV2",
        reply_markup: inlineKeyboard,
      });
    }
  } catch {
    await ctx.reply(text, {
      parse_mode: "MarkdownV2",
      reply_markup: inlineKeyboard,
    });
  }
}

async function showNextMatch(
  ctx: MyContext,
  env: Env,
  userId: string,
  lang: Language,
): Promise<void> {
  const queue = await getMatchQueue(env.KV, userId);
  if (!queue || queue.index >= queue.matches.length) {
    await ctx.reply(t("matchNoMatches", lang), {
      parse_mode: "Markdown",
      reply_markup: getMainMenuKeyboard(),
    });
    await clearMatchQueue(env.KV, userId);
    return;
  }

  const match = queue.matches[queue.index];

  // Defensive: skip own profile if it somehow ended up in the queue
  if (String(match.id) === userId) {
    queue.index++;
    await setMatchQueue(env.KV, userId, queue);
    await showNextMatch(ctx, env, userId, lang);
    return;
  }

  // Show referral prompt before the 3rd match (index 2)
  if (queue.index === 2) {
    const referralKeyboard = new InlineKeyboard()
      .text("🎁 Share & Earn", "referral:show")
      .row()
      .text("❌ Dismiss", "referral:dismiss");
    await ctx.reply(t("matchReferralPrompt", lang), {
      reply_markup: referralKeyboard,
    });
  }

  // Random premium ad for free users (not too often)
  if (queue.tier === "free" && queue.index > 0) {
    const adKey = `ad_last_shown:${userId}`;
    const adLastShown = await env.KV.get(adKey);
    const lastIndex = adLastShown ? Number(adLastShown) : -999;
    const minGap = 4;
    const maxGap = 7;
    // Use a deterministic but seemingly random gap based on userId hash
    const gap =
      minGap +
      (Array.from(userId).reduce((a, c) => a + c.charCodeAt(0), 0) %
        (maxGap - minGap + 1));

    if (queue.index - lastIndex >= gap) {
      await env.KV.put(adKey, String(queue.index), { expirationTtl: 600 });
      const adKeyboard = new InlineKeyboard()
        .text("👑 Upgrade to Premium", "premium:show")
        .row()
        .text(t("premiumAdDismiss", lang), "premium_ad:dismiss");
      await ctx.reply(t("premiumAdPrompt", lang), {
        parse_mode: "Markdown",
        reply_markup: adKeyboard,
      });
    }
  }

  await sendMatchCard(ctx, match, lang, queue.tier);
}

export const matchCommand = async (ctx: MyContext, env: Env): Promise<void> => {
  if (!ctx.from) {
    await ctx.reply("Could not identify you. Try again.");
    return;
  }

  const result = await ensureUserExists(ctx, env);
  if (!result) {
    await ctx.reply(t("genericError"));
    return;
  }

  const { user } = result;
  const lang = getLang(user);
  const { complete, missing } = getProfileCompleteness(user);

  if (!complete) {
    await ctx.reply(
      t("matchProfileIncomplete", lang, {
        missing: getMissingFieldsDisplay(missing),
      }),
    );
    return;
  }

  if (!isPhoneVerified(user)) {
    await promptPhoneVerification(ctx, env, lang);
    return;
  }

  const userId = String(ctx.from.id);
  const tier = (user.subscriptionTier as string) ?? "free";

  // Set default preferences if none exist
  await ensureDefaultPreferences(
    env,
    userId,
    user as unknown as Record<string, unknown>,
  );

  // Clear any existing queue to start fresh
  await clearMatchQueue(env.KV, userId);
  await clearLastAction(env.KV, userId);

  await ctx.reply(t("matchFinding", lang), {
    parse_mode: "Markdown",
    reply_markup: getMatchActionKeyboard(tier),
  });

  let { matches: users, relaxed } = await fetchPotentialMatches(env, userId, 5);
  // Defensive: filter out own profile if API somehow returns it
  users = users.filter((u) => String(u.id) !== userId);
  if (users.length === 0) {
    await ctx.reply(t("matchNoMatches", lang), {
      parse_mode: "Markdown",
      reply_markup: getMainMenuKeyboard(),
    });
    return;
  }

  // Show fallback notice if filters were relaxed
  if (relaxed) {
    const adjustKeyboard = new InlineKeyboard()
      .text("⚙️ Update Settings", "settings:show")
      .row()
      .text("❌ Dismiss", "referral:dismiss");
    await ctx.reply(
      t("matchFallbackNotice", lang) +
        "\n\n" +
        t("matchAdjustSettingsPrompt", lang),
      { parse_mode: "Markdown", reply_markup: adjustKeyboard },
    );
  }

  // Store queue and show first match only
  await setMatchQueue(env.KV, userId, {
    matches: users,
    index: 0,
    tier,
    relaxed,
  });
  await showNextMatch(ctx, env, userId, lang);
};

async function handleMatchAction(
  ctx: MyContext,
  env: Env,
  action: string,
  targetUserId: string,
) {
  if (!ctx.from) {
    await ctx.answerCallbackQuery("Could not identify you.").catch(() => {});
    return;
  }
  const userId = String(ctx.from.id);
  if (targetUserId === userId) {
    await ctx.reply("❌ You can't interact with your own profile.");
    await ctx.answerCallbackQuery().catch(() => {});
    return;
  }

  // Acquire action lock to prevent double-processing from rapid taps
  const locked = await acquireActionLock(env.KV, userId);
  if (!locked) {
    await ctx.answerCallbackQuery("Processing... please wait.").catch(() => {});
    return;
  }

  const myName = ctx.from.first_name ?? "Someone";
  const lang = await fetchUserLang(env, userId);

  try {
    const client = new ApiServiceClient(env.API_SERVICE);

    // Fetch current user profile for media URL to include in notifications
    let myMediaUrl: string | undefined;
    try {
      const myProfile = await client.getUser({ userId });
      const myMediaUrls = (myProfile.user?.mediaUrls ??
        []) as unknown as Array<{
        url: string;
        type: string;
      }>;
      myMediaUrl = myMediaUrls.find((m) => m.type === "image")?.url;
    } catch {
      // ignore — notification will be text-only
    }

    // Check interaction limits for free tier
    const status = await getInteractionStatus(env, userId);
    const tier = status?.tier ?? "free";

    // Only enforce limits when we have valid status data (fail-open on API errors)
    if (status && action === "skip" && tier === "free") {
      const keyboard = new InlineKeyboard()
        .text("👑 Get Premium", "premium:show")
        .row()
        .text("🎁 Share for Bonus", "referral:show");
      await ctx.reply(t("matchSkipGated", lang), {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    if (
      status &&
      (action === "like" || action === "dislike") &&
      tier === "free"
    ) {
      if (action === "like" && (status.likesRemaining ?? 0) <= 0) {
        const keyboard = new InlineKeyboard()
          .text("👑 Get Premium", "premium:show")
          .row()
          .text("🎁 Share for Bonus", "referral:show");
        await ctx.reply(t("matchLikeLimitReached", lang), {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
        await ctx.answerCallbackQuery().catch(() => {});
        return;
      }
      if (action === "dislike" && (status.dislikesRemaining ?? 0) <= 0) {
        const keyboard = new InlineKeyboard()
          .text("👑 Get Premium", "premium:show")
          .row()
          .text("🎁 Share for Bonus", "referral:show");
        await ctx.reply(t("matchDislikeLimitReached", lang), {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
        await ctx.answerCallbackQuery().catch(() => {});
        return;
      }
    }

    // Create match (normalized in API layer)
    const createRes = await client.createMatch({
      user1Id: userId,
      user2Id: targetUserId,
    });
    const matchId = createRes.match.id;

    if (action === "like") {
      const likeRes = await client.likeMatch({ matchId, userId });
      await client.recordLike(userId);

      if (likeRes.isMutual) {
        const otherUserRes = await client.getUser({ userId: targetUserId });
        const otherUser = otherUserRes.user as Record<string, unknown>;
        const name = (otherUser.displayName ??
          otherUser.first_name ??
          "Someone") as string;
        const username = otherUser.username as string | undefined;
        const pronoun = getGenderPronoun(otherUser.gender as string);
        const chatLink = buildChatLink(otherUser);

        await ctx.reply(t("matchItsAMatch", lang, { name }), {
          parse_mode: "Markdown",
        });

        await ctx.reply(
          `${chatLink}\n\n${t("matchSayHiTo", lang, { pronoun })}`,
          {
            parse_mode: "Markdown",
            link_preview_options: { is_disabled: false },
          },
        );

        await addNotification(env, targetUserId, {
          type: "mutual_match",
          matchId,
          otherUserId: userId,
          otherDisplayName: myName,
          otherUsername: ctx.from.username ?? undefined,
          timestamp: new Date().toISOString(),
        });
        await enqueueNotification(env, targetUserId, "mutual_match", {
          otherDisplayName: myName,
          otherUsername: ctx.from.username ?? undefined,
          otherMediaUrl: myMediaUrl,
        });
      } else {
        await addNotification(env, targetUserId, {
          type: "like",
          fromUserId: userId,
          fromDisplayName: myName,
          timestamp: new Date().toISOString(),
        });
        await enqueueNotification(env, targetUserId, "like", {
          fromDisplayName: myName,
          fromMediaUrl: myMediaUrl,
        });
      }
    } else if (action === "dislike") {
      const dislikeRes = await env.API_SERVICE.fetch(
        new Request(`http://api/matches/${matchId}/dislike`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }),
      );
      if (dislikeRes.ok) {
        await client.recordDislike(userId);
      }
    } else if (action === "skip") {
      await env.API_SERVICE.fetch(
        new Request(`http://api/matches/${matchId}/skip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        }),
      );
    }

    // Visual feedback
    if (action === "like") {
      await ctx.reply(t("matchLikeSuccess", lang), {
        reply_markup: getMatchActionKeyboard(tier),
      });
    } else if (action === "dislike") {
      await ctx.reply(t("matchDislikeSuccess", lang), {
        reply_markup: getMatchActionKeyboard(tier),
      });
    } else if (action === "skip") {
      await ctx.reply(t("matchSkipSuccess", lang), {
        reply_markup: getMatchActionKeyboard(tier),
      });
    }

    // Store last action for rollback
    await setLastAction(env.KV, userId, {
      matchId,
      targetUserId,
      action,
      timestamp: new Date().toISOString(),
    });

    // --- One-by-one flow: mark current match as acted and show next ---
    const queue = await getMatchQueue(env.KV, userId);
    if (queue) {
      try {
        await ctx.editMessageReplyMarkup({
          reply_markup: new InlineKeyboard(),
        });
      } catch {
        // Message might be too old or not editable; ignore
      }

      queue.index++;
      await setMatchQueue(env.KV, userId, queue);
      await showNextMatch(ctx, env, userId, lang);
    }
  } catch (error) {
    console.error("Match action error:", error);
    await ctx.reply(t("matchError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  } finally {
    await releaseActionLock(env.KV, userId);
  }
  await ctx.answerCallbackQuery().catch(() => {});
}

async function handleSendDM(ctx: MyContext, env: Env, targetUserId: string) {
  if (!ctx.from) {
    await ctx.answerCallbackQuery("Could not identify you.").catch(() => {});
    return;
  }
  const userId = String(ctx.from.id);
  const lang = await fetchUserLang(env, userId);

  try {
    const client = new ApiServiceClient(env.API_SERVICE);
    const dmStatus = await client.getDMStatus(userId);

    // Premium+: 100 DM bypass per day
    let bypassRemaining: number | undefined;
    if (dmStatus.tier === "premium_plus") {
      const bypassStatus = await getDMBypassStatus(env.KV, userId);
      bypassRemaining = Math.max(0, DM_BYPASS_LIMIT - bypassStatus.used);
    }

    const canSend =
      dmStatus.canSendDM &&
      (dmStatus.tier !== "premium_plus" || (bypassRemaining ?? 0) > 0);

    if (!canSend) {
      try {
        const bot = ctx.api;
        const invoiceLink = await bot.createInvoiceLink(
          "1 Direct Message",
          "Send a DM to any user without matching",
          `dm_credit_${userId}_1_${targetUserId}`,
          "",
          "XTR",
          [{ label: "1 DM", amount: 50 }],
        );
        const keyboard = new InlineKeyboard()
          .url("⭐ Pay 50 Stars", invoiceLink)
          .row()
          .text("👑 Get Premium", "premium:show")
          .row()
          .text("❌ Cancel", "dm:cancel");
        await ctx.reply(
          t("dmGated", lang) +
            "\n\nTap the button below to pay with Telegram Stars.",
          { parse_mode: "Markdown", reply_markup: keyboard },
        );
      } catch {
        await ctx.reply(t("dmError", lang), {
          reply_markup: getMainMenuKeyboard(),
        });
      }
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    // Load target user details BEFORE consuming credits
    const otherUserRes = await client.getUser({ userId: targetUserId });
    const otherUser = otherUserRes.user as Record<string, unknown>;
    const chatLink = buildChatLink(otherUser);
    const name = (otherUser.displayName ?? "Someone") as string;

    // Use bypass for Premium+
    if (dmStatus.tier === "premium_plus" && bypassRemaining !== undefined) {
      const bypassResult = await useDMBypass(env.KV, userId);
      bypassRemaining = bypassResult.remaining;
    }

    const result = await client.sendDM(userId);
    if (!result.success) {
      await ctx.reply(t("dmFailed", lang), {
        reply_markup: getMainMenuKeyboard(),
      });
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    let successText = t("dmSuccess", lang, { name }) + "\n\n" + chatLink;
    if (dmStatus.tier === "premium_plus" && bypassRemaining !== undefined) {
      successText += `\n\n📊 DM bypass: ${bypassRemaining}/${DM_BYPASS_LIMIT} remaining today.`;
    }

    await ctx.reply(successText, {
      parse_mode: "Markdown",
      link_preview_options: { is_disabled: false },
    });
    await ctx.answerCallbackQuery().catch(() => {});
  } catch (error) {
    console.error("Send DM error:", error);
    await ctx.reply(t("dmError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
    await ctx.answerCallbackQuery().catch(() => {});
  }
}

// --- Report feature ---

export async function startReportConversation(
  ctx: MyContext,
  env: Env,
  targetUserId: string,
): Promise<void> {
  if (!ctx.from) return;
  const userId = String(ctx.from.id);
  const lang = await fetchUserLang(env, userId);

  await setConversationState(env.KV, {
    userId,
    field: "report",
    step: 0,
    data: { targetUserId },
  });

  const cancelKeyboard = new Keyboard().text("Cancel").resized();
  await ctx.reply(t("reportPrompt", lang), {
    parse_mode: "Markdown",
    reply_markup: cancelKeyboard,
  });
}

export async function handleReportConversation(
  ctx: MyContext,
  env: Env,
  text: string,
  lang: Language,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);
  const state = await getConversationState(env.KV, userId);
  if (!state || state.field !== "report" || !state.data?.targetUserId)
    return false;

  const targetUserId = String(state.data.targetUserId);

  try {
    const client = new ApiServiceClient(env.API_SERVICE);
    await client.reportUser(targetUserId, userId, text);
    await ctx.reply(t("reportSubmitted", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  } catch (error) {
    console.error("Report error:", error);
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }

  await clearConversationState(env.KV, userId);
  return true;
}

// --- Rollback / Undo feature ---

async function handleRollback(ctx: MyContext, env: Env): Promise<void> {
  if (!ctx.from) return;
  const userId = String(ctx.from.id);
  const lang = await fetchUserLang(env, userId);

  try {
    // Check tier
    const client = new ApiServiceClient(env.API_SERVICE);
    const userRes = await client.getUser({ userId });
    const tier = (userRes.user?.subscriptionTier as string) ?? "free";

    if (tier !== "premium" && tier !== "premium_plus") {
      const keyboard = new InlineKeyboard()
        .text("👑 Get Premium", "premium:show")
        .row()
        .text("🎁 Share for Bonus", "referral:show");
      await ctx.reply(t("rollbackGated", lang), {
        parse_mode: "Markdown",
        reply_markup: keyboard,
      });
      return;
    }

    const lastAction = await getLastAction(env.KV, userId);
    if (!lastAction) {
      await ctx.reply(t("rollbackNoAction", lang), {
        reply_markup: getMatchActionKeyboard(tier),
      });
      return;
    }

    // Call undo API
    const undoRes = await client.undoMatch(lastAction.matchId, userId);
    if (!undoRes.restored) {
      await ctx.reply(t("rollbackNoAction", lang), {
        reply_markup: getMatchActionKeyboard(tier),
      });
      return;
    }

    // Restore previous match to front of queue
    const queue = await getMatchQueue(env.KV, userId);
    if (queue && queue.index > 0) {
      queue.index--;
      await setMatchQueue(env.KV, userId, queue);
    }

    await clearLastAction(env.KV, userId);
    await ctx.reply(t("rollbackSuccess", lang), {
      reply_markup: getMatchActionKeyboard(tier),
    });

    // Show the restored profile
    if (queue) {
      await showNextMatch(ctx, env, userId, lang);
    }
  } catch (error) {
    console.error("Rollback error:", error);
    await ctx.reply(t("genericError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }
}

// --- Like with Message feature ---

export async function startLikeMessageConversation(
  ctx: MyContext,
  env: Env,
  targetUserId: string,
): Promise<void> {
  if (!ctx.from) return;
  const userId = String(ctx.from.id);
  const lang = await fetchUserLang(env, userId);

  // Check interaction limits
  const status = await getInteractionStatus(env, userId);
  if ((status?.likesRemaining ?? 0) <= 0 && status?.tier === "free") {
    const keyboard = new InlineKeyboard()
      .text("👑 Get Premium", "premium:show")
      .row()
      .text("🎁 Share for Bonus", "referral:show");
    await ctx.reply(t("matchLikeLimitReached", lang), {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    return;
  }

  await setConversationState(env.KV, {
    userId,
    field: "like-message",
    step: 0,
    data: { targetUserId },
  });

  const skipKeyboard = new Keyboard()
    .text(t("likeMessageSkipButton", lang))
    .text("Cancel")
    .resized();
  await ctx.reply(t("likeMessagePrompt", lang), {
    parse_mode: "Markdown",
    reply_markup: skipKeyboard,
  });
}

export async function handleLikeMessageConversation(
  ctx: MyContext,
  env: Env,
  text: string,
  lang: Language,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);
  const state = await getConversationState(env.KV, userId);
  if (!state || state.field !== "like-message" || !state.data?.targetUserId)
    return false;

  const targetUserId = String(state.data.targetUserId);
  const myName = ctx.from.first_name ?? "Someone";

  try {
    const client = new ApiServiceClient(env.API_SERVICE);

    // Fetch current user profile for media URL to include in notifications
    let myMediaUrl: string | undefined;
    try {
      const myProfile = await client.getUser({ userId });
      const myMediaUrls = (myProfile.user?.mediaUrls ??
        []) as unknown as Array<{
        url: string;
        type: string;
      }>;
      myMediaUrl = myMediaUrls.find((m) => m.type === "image")?.url;
    } catch {
      // ignore
    }

    const createRes = await client.createMatch({
      user1Id: userId,
      user2Id: targetUserId,
    });
    const matchId = createRes.match.id;

    const message =
      text === t("likeMessageSkipButton", lang) ? undefined : { text };

    const likeRes = await client.likeMatch({ matchId, userId, message });
    await client.recordLike(userId);

    if (likeRes.isMutual) {
      const otherUserRes = await client.getUser({ userId: targetUserId });
      const otherUser = otherUserRes.user as Record<string, unknown>;
      const name = (otherUser.displayName ??
        otherUser.first_name ??
        "Someone") as string;
      const pronoun = getGenderPronoun(otherUser.gender as string);
      const chatLink = buildChatLink(otherUser);

      await ctx.reply(t("matchItsAMatch", lang, { name }), {
        parse_mode: "Markdown",
      });
      await ctx.reply(
        `${chatLink}\n\n${t("matchSayHiTo", lang, { pronoun })}`,
        {
          parse_mode: "Markdown",
          link_preview_options: { is_disabled: false },
        },
      );

      await addNotification(env, targetUserId, {
        type: "mutual_match",
        matchId,
        otherUserId: userId,
        otherDisplayName: myName,
        otherUsername: ctx.from.username ?? undefined,
        timestamp: new Date().toISOString(),
      });
      await enqueueNotification(env, targetUserId, "mutual_match", {
        otherDisplayName: myName,
        otherUsername: ctx.from.username ?? undefined,
        otherMediaUrl: myMediaUrl,
      });
    } else {
      await ctx.reply(t("likeMessageSent", lang), {
        reply_markup: getMatchActionKeyboard(
          (await getInteractionStatus(env, userId))?.tier ?? "free",
        ),
      });

      // Send notification with the message
      const notificationPayload: Record<string, unknown> = {
        fromDisplayName: myName,
        fromMediaUrl: myMediaUrl,
      };
      if (message?.text) {
        notificationPayload.messageText = message.text;
      }

      await addNotification(env, targetUserId, {
        type: "like",
        fromUserId: userId,
        fromDisplayName: myName,
        messageText: message?.text ?? undefined,
        timestamp: new Date().toISOString(),
      });
      await enqueueNotification(env, targetUserId, "like", notificationPayload);
    }

    // Advance queue
    const queue = await getMatchQueue(env.KV, userId);
    if (queue) {
      queue.index++;
      await setMatchQueue(env.KV, userId, queue);
      await showNextMatch(ctx, env, userId, lang);
    }
  } catch (error) {
    console.error("Like with message error:", error);
    await ctx.reply(t("matchError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }

  await clearConversationState(env.KV, userId);
  return true;
}

export async function handleLikeMessageMedia(
  ctx: MyContext,
  env: Env,
  mediaUrl: string,
  mediaType: "image" | "video",
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);
  const state = await getConversationState(env.KV, userId);
  if (!state || state.field !== "like-message" || !state.data?.targetUserId)
    return false;

  const targetUserId = String(state.data.targetUserId);
  const myName = ctx.from.first_name ?? "Someone";
  const lang = await fetchUserLang(env, userId);

  try {
    const client = new ApiServiceClient(env.API_SERVICE);

    // Fetch current user profile for media URL to include in notifications
    let myMediaUrl: string | undefined;
    try {
      const myProfile = await client.getUser({ userId });
      const myMediaUrls = (myProfile.user?.mediaUrls ??
        []) as unknown as Array<{
        url: string;
        type: string;
      }>;
      myMediaUrl = myMediaUrls.find((m) => m.type === "image")?.url;
    } catch {
      // ignore
    }

    const createRes = await client.createMatch({
      user1Id: userId,
      user2Id: targetUserId,
    });
    const matchId = createRes.match.id;

    const message = { mediaUrl };
    const likeRes = await client.likeMatch({ matchId, userId, message });
    await client.recordLike(userId);

    if (likeRes.isMutual) {
      const otherUserRes = await client.getUser({ userId: targetUserId });
      const otherUser = otherUserRes.user as Record<string, unknown>;
      const name = (otherUser.displayName ??
        otherUser.first_name ??
        "Someone") as string;
      const pronoun = getGenderPronoun(otherUser.gender as string);
      const chatLink = buildChatLink(otherUser);

      await ctx.reply(t("matchItsAMatch", lang, { name }), {
        parse_mode: "Markdown",
      });
      await ctx.reply(
        `${chatLink}\n\n${t("matchSayHiTo", lang, { pronoun })}`,
        {
          parse_mode: "Markdown",
          link_preview_options: { is_disabled: false },
        },
      );

      await addNotification(env, targetUserId, {
        type: "mutual_match",
        matchId,
        otherUserId: userId,
        otherDisplayName: myName,
        otherUsername: ctx.from.username ?? undefined,
        otherMediaUrl: myMediaUrl,
        timestamp: new Date().toISOString(),
      });
      await enqueueNotification(env, targetUserId, "mutual_match", {
        otherDisplayName: myName,
        otherUsername: ctx.from.username ?? undefined,
        otherMediaUrl: myMediaUrl,
      });
    } else {
      await ctx.reply(t("likeMessageSent", lang), {
        reply_markup: getMatchActionKeyboard(
          (await getInteractionStatus(env, userId))?.tier ?? "free",
        ),
      });

      await addNotification(env, targetUserId, {
        type: "like",
        fromUserId: userId,
        fromDisplayName: myName,
        mediaUrl,
        fromMediaUrl: myMediaUrl,
        timestamp: new Date().toISOString(),
      });
      await enqueueNotification(env, targetUserId, "like", {
        fromDisplayName: myName,
        mediaUrl,
        fromMediaUrl: myMediaUrl,
      });
    }

    const queue = await getMatchQueue(env.KV, userId);
    if (queue) {
      queue.index++;
      await setMatchQueue(env.KV, userId, queue);
      await showNextMatch(ctx, env, userId, lang);
    }
  } catch (error) {
    console.error("Like with media error:", error);
    await ctx.reply(t("matchError", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
  }

  await clearConversationState(env.KV, userId);
  return true;
}

// --- Gift feature ---

const GIFTS = [
  { id: "rose", emoji: "🌹", name: "Rose", stars: 10 },
  { id: "chocolate", emoji: "🍫", name: "Chocolate", stars: 25 },
  { id: "teddy", emoji: "🧸", name: "Teddy Bear", stars: 50 },
  { id: "diamond", emoji: "💎", name: "Diamond", stars: 100 },
];

export async function startGiftSelection(
  ctx: MyContext,
  env: Env,
  targetUserId: string,
): Promise<void> {
  if (!ctx.from) return;
  const userId = String(ctx.from.id);
  const lang = await fetchUserLang(env, userId);

  // Check tier
  const client = new ApiServiceClient(env.API_SERVICE);
  const userRes = await client.getUser({ userId });
  const tier = (userRes.user?.subscriptionTier as string) ?? "free";

  if (tier === "free") {
    const keyboard = new InlineKeyboard()
      .text("👑 Get Premium", "premium:show")
      .row()
      .text("🎁 Share for Bonus", "referral:show");
    await ctx.reply(t("giftGated", lang), {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    });
    return;
  }

  // Store gift selection state
  await setConversationState(env.KV, {
    userId,
    field: "gift",
    step: 0,
    data: { targetUserId },
  });

  const keyboard = new InlineKeyboard();
  for (const gift of GIFTS) {
    keyboard
      .text(
        `${gift.emoji} ${gift.name} (${gift.stars} ⭐)`,
        `gift:buy:${gift.id}:${targetUserId}`,
      )
      .row();
  }
  keyboard.text("❌ Cancel", "gift:cancel");

  await ctx.reply(`${t("giftTitle", lang)}\n\n${t("giftSelect", lang)}`, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

export async function handleGiftCallback(
  ctx: MyContext,
  env: Env,
  data: string,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);
  const lang = await fetchUserLang(env, userId);

  if (data === "gift:cancel") {
    await clearConversationState(env.KV, userId);
    await ctx.deleteMessage().catch(() => {});
    await ctx.reply(t("giftCancelled", lang), {
      reply_markup: getMainMenuKeyboard(),
    });
    await ctx.answerCallbackQuery().catch(() => {});
    return true;
  }

  if (data.startsWith("gift:buy:")) {
    const parts = data.split(":");
    const giftId = parts[2];
    const targetUserId = parts[3];
    const gift = GIFTS.find((g) => g.id === giftId);

    if (!gift || !targetUserId) {
      await ctx.answerCallbackQuery("Invalid gift.").catch(() => {});
      return true;
    }

    try {
      const bot = ctx.api;
      const invoiceLink = await bot.createInvoiceLink(
        `${gift.emoji} ${gift.name}`,
        `Send a ${gift.name} to your match`,
        `gift_${userId}_${targetUserId}_${gift.id}`,
        "",
        "XTR",
        [{ label: gift.name, amount: gift.stars }],
      );

      const keyboard = new InlineKeyboard()
        .url(`⭐ Pay ${gift.stars} Stars`, invoiceLink)
        .row()
        .text("❌ Cancel", "gift:cancel");

      await ctx.reply(
        `🎁 *Send a ${gift.emoji} ${gift.name}*\n\n` +
          `Tap the button below to pay with Telegram Stars.`,
        { parse_mode: "Markdown", reply_markup: keyboard },
      );
      await ctx.answerCallbackQuery().catch(() => {});
    } catch (error) {
      console.error("Gift invoice error:", error);
      await ctx.reply("❌ Could not create payment. Please try again later.");
      await ctx.answerCallbackQuery().catch(() => {});
    }
    return true;
  }

  return false;
}

export async function handleGiftPayment(
  ctx: MyContext,
  env: Env,
  payload: string,
): Promise<void> {
  if (!ctx.from) return;
  const userId = String(ctx.from.id);
  const lang = await fetchUserLang(env, userId);

  // Parse payload: gift_{userId}_{targetUserId}_{giftId}
  const parts = payload.split("_");
  if (parts.length < 4 || parts[0] !== "gift") return;

  const senderId = parts[1];
  const targetUserId = parts[2];
  const giftId = parts[3];
  const gift = GIFTS.find((g) => g.id === giftId);

  if (!gift || senderId !== userId) return;

  try {
    // Get sender name
    const client = new ApiServiceClient(env.API_SERVICE);
    const senderRes = await client.getUser({ userId: senderId });
    const senderName = (senderRes.user?.displayName ?? "Someone") as string;

    await ctx.reply(
      t("giftSent", lang, { gift: `${gift.emoji} ${gift.name}` }),
      { reply_markup: getMainMenuKeyboard() },
    );

    // Send notification to target user
    await addNotification(env, targetUserId, {
      type: "gift",
      fromUserId: senderId,
      fromDisplayName: senderName,
      giftEmoji: gift.emoji,
      giftName: gift.name,
      timestamp: new Date().toISOString(),
    });
    await enqueueNotification(env, targetUserId, "gift", {
      fromDisplayName: senderName,
      giftEmoji: gift.emoji,
      giftName: gift.name,
    });
  } catch (error) {
    console.error("Gift delivery error:", error);
    await ctx.reply(
      "❌ Payment processed but we could not deliver the gift. Please contact support.",
    );
  }
}

// --- Reply action handler ---

export async function handleMatchReplyAction(
  ctx: MyContext,
  env: Env,
  action: string,
): Promise<boolean> {
  if (!ctx.from) return false;
  const userId = String(ctx.from.id);

  const queue = await getMatchQueue(env.KV, userId);
  if (!queue || queue.index >= queue.matches.length) {
    await ctx.reply("Start matching first! Use /match or tap 🔍 Find Match.", {
      reply_markup: getMainMenuKeyboard(),
    });
    return true;
  }

  const targetUserId = String(queue.matches[queue.index].id);

  if (action === "report") {
    await startReportConversation(ctx, env, targetUserId);
    return true;
  }

  if (action === "undo") {
    await handleRollback(ctx, env);
    return true;
  }

  if (action === "like-message") {
    await startLikeMessageConversation(ctx, env, targetUserId);
    return true;
  }

  if (action === "gift") {
    await startGiftSelection(ctx, env, targetUserId);
    return true;
  }

  await handleMatchAction(ctx, env, action, targetUserId);
  return true;
}

// --- Callback handlers ---

export const matchCallbacks = async (
  ctx: MyContext,
  env: Env,
): Promise<void> => {
  if (!ctx.callbackQuery?.data) {
    await ctx.answerCallbackQuery().catch(() => {});
    return;
  }
  const data = ctx.callbackQuery.data;

  if (data.startsWith("match:like:")) {
    await handleMatchAction(ctx, env, "like", data.replace("match:like:", ""));
  } else if (data.startsWith("match:dislike:")) {
    await handleMatchAction(
      ctx,
      env,
      "dislike",
      data.replace("match:dislike:", ""),
    );
  } else if (data.startsWith("match:skip:")) {
    await handleMatchAction(ctx, env, "skip", data.replace("match:skip:", ""));
  } else if (data.startsWith("match:like-message:")) {
    await startLikeMessageConversation(
      ctx,
      env,
      data.replace("match:like-message:", ""),
    );
    await ctx.answerCallbackQuery().catch(() => {});
  } else if (data.startsWith("match:undo:")) {
    await handleRollback(ctx, env);
    await ctx.answerCallbackQuery().catch(() => {});
  } else if (data.startsWith("dm:send:")) {
    await handleSendDM(ctx, env, data.replace("dm:send:", ""));
  } else if (data.startsWith("dm:buy:")) {
    // Backward compatibility: directly show invoice for the target user
    await handleSendDM(ctx, env, data.replace("dm:buy:", ""));
  } else if (data === "dm:cancel") {
    await ctx.deleteMessage().catch(() => {});
    await ctx.answerCallbackQuery().catch(() => {});
  } else {
    await ctx.answerCallbackQuery("Unknown action.").catch(() => {});
  }
};

async function handleBuyDM(ctx: MyContext, env: Env, targetUserId: string) {
  // Deprecated: combined into handleSendDM for single-step flow
  await handleSendDM(ctx, env, targetUserId);
}
