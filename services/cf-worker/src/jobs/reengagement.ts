import type { Env } from "../index.js";
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-worker");

const INACTIVE_DAYS_MIN = 7;
const INACTIVE_DAYS_MAX = 30;
const BATCH_SIZE = 100;

interface InactiveUser {
  id: string;
  first_name: string;
  gender: string | null;
  location: string | null;
  preferences: string | null;
}

/** Generate a believable "marketing" count from the real DB count.
 *  Small communities get inflated numbers; large ones stay roughly truthful.
 */
function getMarketingCount(realCount: number): number {
  if (realCount < 3) {
    // Fabricate a believable number for small communities
    return Math.floor(Math.random() * 80) + 21; // 21–100
  }
  if (realCount < 10) {
    return Math.floor(Math.random() * 150) + 50; // 50–199
  }
  if (realCount < 50) {
    return (
      Math.floor(realCount * (2 + Math.random() * 2)) +
      Math.floor(Math.random() * 30)
    ); // 2–4x + jitter
  }
  if (realCount < 200) {
    return (
      Math.floor(realCount * (1.5 + Math.random())) +
      Math.floor(Math.random() * 50)
    ); // 1.5–2.5x + jitter
  }
  if (realCount < 1000) {
    return realCount + Math.floor(Math.random() * 200); // slight boost
  }
  // Large numbers — round to nearest 100
  return Math.ceil(realCount / 100) * 100;
}

/** Extract a human-readable city from the JSON location column. */
function extractCity(locationJson: string | null): string | null {
  if (!locationJson) return null;
  try {
    const loc = JSON.parse(locationJson) as Record<string, unknown>;
    const city = loc.city ?? loc.name;
    if (typeof city === "string" && city.trim().length > 0) {
      return city.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Build gender label(s) from the user's stored preferences.
 *  Falls back to opposite gender when no preference is set.
 */
function getGenderLabel(
  gender: string | null,
  preferencesJson: string | null,
): { plural: string; singular: string } {
  try {
    const prefs = preferencesJson ? JSON.parse(preferencesJson) : {};
    const gp = prefs.genderPreference;
    if (Array.isArray(gp) && gp.length > 0) {
      if (gp.length === 1) {
        if (gp[0] === "female") return { plural: "women", singular: "woman" };
        if (gp[0] === "male") return { plural: "men", singular: "man" };
        return { plural: "people", singular: "person" };
      }
      if (gp.includes("male") && gp.includes("female") && gp.length === 2) {
        return { plural: "men and women", singular: "person" };
      }
      return { plural: "people", singular: "person" };
    }
  } catch {
    // fall through to fallback
  }

  const g = (gender ?? "").toLowerCase();
  if (g === "male") return { plural: "women", singular: "woman" };
  if (g === "female") return { plural: "men", singular: "man" };
  return { plural: "people", singular: "person" };
}

const MESSAGE_VARIANTS = [
  // Direct count + CTA (competitor-style)
  (name: string, count: number, label: string, _loc?: string | null) =>
    `Found ${count} ${label} near you. Show? 👀`,

  // FOMO / new joiners
  (name: string, count: number, label: string, _loc?: string | null) =>
    `🔥 ${count} new ${label} joined MeetMatch near you. Don't miss out!`,

  // Chat urgency
  (name: string, count: number, label: string, loc?: string | null) =>
    loc
      ? `💬 Some ${label} from ${loc} want to chat with you right now!`
      : `💬 ${count} ${label} want to chat with you right now!`,

  // Profile attention
  (name: string, count: number, label: string, _loc?: string | null) =>
    `⚡ ${name}, your profile is getting attention! ${count} ${label} are interested 👀`,

  // Hidden matches
  (name: string, count: number, label: string, _loc?: string | null) =>
    `🎁 You have hidden matches waiting! Discover ${count} ${label} now.`,

  // Area / haven't met
  (name: string, count: number, label: string, _loc?: string | null) =>
    `💘 ${count} ${label} in your area haven't met you yet. Let's fix that!`,

  // Location-based
  (name: string, count: number, label: string, loc?: string | null) =>
    loc
      ? `🏙️ ${count} ${label} in ${loc} are looking for someone like you, ${name}!`
      : `${count} ${label} near you are looking for someone like you, ${name}!`,

  // Expiring soon
  (name: string, count: number, label: string, _loc?: string | null) =>
    `⏰ Your matches are expiring soon! ${count} ${label} still waiting...`,

  // Social proof
  (name: string, count: number, label: string, _loc?: string | null) =>
    `🌟 You're popular, ${name}! ${count} ${label} viewed your profile recently.`,

  // Curiosity gap
  (name: string, count: number, label: string, _loc?: string | null) =>
    `👀 Someone special checked you out. See who among ${count} ${label}!`,

  // Warm / personal
  (name: string, count: number, label: string, _loc?: string | null) =>
    `Hey ${name}, we miss you! ${count} ${label} are waiting to meet you 💕`,

  // Miss-you simple
  (name: string, _count: number, _label: string, _loc?: string | null) =>
    `Hey ${name}! We miss you on MeetMatch. Come back and find your next match! 💘`,

  // Perfect match
  (name: string, _count: number, _label: string, _loc?: string | null) =>
    `Your perfect match could be just one swipe away, ${name}! Come back and find out! ✨`,

  // Been a while
  (name: string, _count: number, _label: string, _loc?: string | null) =>
    `It's been a while, ${name}! Ready to find someone special today? 💑`,
];

function pickVariant(
  index?: number,
): (name: string, count: number, label: string, loc?: string | null) => string {
  const idx = index ?? Math.floor(Math.random() * MESSAGE_VARIANTS.length);
  return MESSAGE_VARIANTS[idx % MESSAGE_VARIANTS.length];
}

/** Count active, profile-complete users that match the user's gender preference. */
async function countNearbyUsers(
  db: D1Database,
  userId: string,
  preferencesJson: string | null,
): Promise<number> {
  try {
    let prefs: Record<string, unknown> = {};
    try {
      prefs = preferencesJson ? JSON.parse(preferencesJson) : {};
    } catch {
      /* ignore */
    }

    const gp = prefs.genderPreference;
    if (Array.isArray(gp) && gp.length > 0 && gp.length < 4) {
      const placeholders = gp.map(() => "?").join(",");
      const { results } = await db
        .prepare(
          `SELECT COUNT(*) as c FROM users
           WHERE id != ?
             AND is_active = 1
             AND is_profile_complete = 1
             AND gender IN (${placeholders})`,
        )
        .bind(userId, ...gp)
        .all();
      return Number(
        (results?.[0] as Record<string, unknown> | undefined)?.c ?? 0,
      );
    }

    // No preference or "all" selected — count everyone
    const { results } = await db
      .prepare(
        `SELECT COUNT(*) as c FROM users
         WHERE id != ?
           AND is_active = 1
           AND is_profile_complete = 1`,
      )
      .bind(userId)
      .all();
    return Number(
      (results?.[0] as Record<string, unknown> | undefined)?.c ?? 0,
    );
  } catch (error) {
    log.error(
      "countNearbyUsers",
      "Failed to count potential matches",
      { userId },
      error,
    );
    return 0;
  }
}

export async function runReengagementJob(env: Env): Promise<void> {
  console.log("[reengagement] Starting re-engagement job");

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - INACTIVE_DAYS_MIN);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() - INACTIVE_DAYS_MAX);

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, first_name, gender, location, preferences FROM users
       WHERE is_active = 1
       AND is_sleeping = 0
       AND (last_active <= ? OR last_active IS NULL)
       AND (last_reminded_at IS NULL OR last_reminded_at <= ?)
       LIMIT ?`,
    )
      .bind(cutoffDate.toISOString(), maxDate.toISOString(), BATCH_SIZE)
      .all();

    const candidates = (results ?? []) as Array<Record<string, unknown>>;
    console.log(`[reengagement] Found ${candidates.length} candidates`);

    for (const user of candidates) {
      const userId = String(user.id);
      const firstName = String(user.first_name || "there");
      const gender = user.gender ? String(user.gender) : null;
      const preferences = user.preferences ? String(user.preferences) : null;

      try {
        const nearbyCount = await countNearbyUsers(env.DB, userId, preferences);
        const marketingCount = getMarketingCount(nearbyCount);
        const genderLabel = getGenderLabel(gender, preferences);
        const variant = pickVariant();
        const safeName = firstName.replace(
          /[_*\[\]`\.!#+\-={}|~()><\\]/g,
          "\\$&",
        );
        const city = extractCity(user.location ? String(user.location) : null);
        const safeCity = city
          ? city.replace(/[_*\[\]`\.!#+\-={}|~()><\\]/g, "\\$&")
          : null;

        const message = variant(
          safeName,
          marketingCount,
          genderLabel.plural,
          safeCity,
        );

        const response = await env.API_SERVICE.fetch(
          new Request("http://api/notifications", {
            method: "POST",
            body: JSON.stringify({
              userId,
              type: "REENGAGEMENT",
              channel: "TELEGRAM",
              payload: JSON.stringify({
                message,
                action: "find_match",
              }),
            }),
            headers: { "Content-Type": "application/json" },
          }),
        );

        if (response.ok) {
          await env.DB.prepare(
            "UPDATE users SET last_reminded_at = CURRENT_TIMESTAMP WHERE id = ?",
          )
            .bind(userId)
            .run();
          console.log(
            `[reengagement] Sent to ${userId} (real=${nearbyCount}, marketing=${marketingCount})`,
          );
        } else {
          console.error(
            `[reengagement] Failed to enqueue for ${userId}: ${response.status}`,
          );
        }
      } catch (error) {
        console.error(`[reengagement] Error for ${userId}:`, error);
      }
    }

    console.log("[reengagement] Job complete");
  } catch (error) {
    console.error("[reengagement] Job failed:", error);
    throw error;
  }
}
