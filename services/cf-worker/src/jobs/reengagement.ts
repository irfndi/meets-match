import { Cause, Effect, Exit, pipe } from "effect";
import type { Env } from "../index.js";
import { createLogger } from "@meetsmatch/cf-shared";
import {
  NotificationQueueProducer,
  persistAndEnqueue,
} from "../notifications/queue.js";

const log = createLogger("cf-worker.reengagement");

// --- Stage configuration ---
// Each stage has a minimum inactivity period (cutoff), a cooldown before the
// same stage can fire again, and a NotificationType to send.

interface ReengagementStage {
  readonly stage: 1 | 2 | 3;
  readonly type:
    | "REENGAGEMENT_GENTLE"
    | "REENGAGEMENT_URGENT"
    | "REENGAGEMENT_LAST_CHANCE";
  readonly inactiveDaysMin: number;
  readonly inactiveDaysMax: number;
  readonly cooldownDays: number;
  readonly tone: string;
}

const STAGES: ReadonlyArray<ReengagementStage> = [
  {
    stage: 1,
    type: "REENGAGEMENT_GENTLE",
    inactiveDaysMin: 7,
    inactiveDaysMax: 13,
    cooldownDays: 5,
    tone: "warm",
  },
  {
    stage: 2,
    type: "REENGAGEMENT_URGENT",
    inactiveDaysMin: 14,
    inactiveDaysMax: 29,
    cooldownDays: 7,
    tone: "fomo",
  },
  {
    stage: 3,
    type: "REENGAGEMENT_LAST_CHANCE",
    inactiveDaysMin: 30,
    inactiveDaysMax: 365,
    cooldownDays: 14,
    tone: "pressure",
  },
];

const BATCH_SIZE = 100;

interface InactiveUser {
  id: string;
  first_name: string;
  gender: string | null;
  location: string | null;
  preferences: string | null;
  last_active: string;
  last_reengagement_stage: number | null;
  last_reengagement_at: string | null;
}

/** Generate a believable "marketing" count from the real DB count.
 *  Small communities get inflated numbers; large ones stay roughly truthful.
 */
function getMarketingCount(realCount: number): number {
  if (realCount < 3) {
    return Math.floor(Math.random() * 80) + 21; // 21–100
  }
  if (realCount < 10) {
    return Math.floor(Math.random() * 150) + 50; // 50–199
  }
  if (realCount < 50) {
    return (
      Math.floor(realCount * (2 + Math.random() * 2)) +
      Math.floor(Math.random() * 30)
    );
  }
  if (realCount < 200) {
    return (
      Math.floor(realCount * (1.5 + Math.random())) +
      Math.floor(Math.random() * 50)
    );
  }
  if (realCount < 1000) {
    return realCount + Math.floor(Math.random() * 200);
  }
  return Math.ceil(realCount / 100) * 100;
}

/** Escape MarkdownV2 special characters in a string. */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*\[\]`\.!#+\-={}|~()><\\]/g, "\\$&");
}

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

interface ParsedPreferences {
  genderPreference?: string[];
}

function parsePreferences(preferencesJson: string | null): ParsedPreferences {
  if (!preferencesJson) return {};
  try {
    return JSON.parse(preferencesJson) as ParsedPreferences;
  } catch {
    return {};
  }
}

function getGenderLabel(
  gender: string | null,
  prefs: ParsedPreferences,
): { plural: string; singular: string } {
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
  const g = (gender ?? "").toLowerCase();
  if (g === "male") return { plural: "women", singular: "woman" };
  if (g === "female") return { plural: "men", singular: "man" };
  return { plural: "people", singular: "person" };
}

// --- Per-stage message variants. Each stage has a distinct tone. ---

const GENTLE_VARIANTS: ReadonlyArray<
  (name: string, count: number, label: string, loc?: string | null) => string
> = [
  (name) =>
    `Hey ${name}, we miss you on MeetMatch! Come back and find your next match 💕`,
  (name) =>
    `Your perfect match could be just one swipe away, ${name}! Come back and find out ✨`,
  (name) =>
    `It's been a while, ${name}! Ready to find someone special today? 💑`,
  (name, count, label, loc) =>
    loc
      ? `${count} ${label} in ${loc} are looking for someone like you, ${name}!`
      : `${count} ${label} near you are looking for someone like you, ${name}!`,
  (name) =>
    `👀 Some really cool people have been checking out your profile. Come see who's new, ${name}!`,
];

const URGENT_VARIANTS: ReadonlyArray<
  (name: string, count: number, label: string, loc?: string | null) => string
> = [
  (name, count, label) =>
    `🔥 ${count} new ${label} joined MeetMatch near you. Don't miss out, ${name}!`,
  (name, count, label) =>
    `⏰ Your matches are expiring soon! ${count} ${label} still waiting, ${name}…`,
  (name, count, label, loc) =>
    loc
      ? `💬 Some ${label} from ${loc} want to chat with you right now, ${name}!`
      : `💬 ${count} ${label} want to chat with you right now, ${name}!`,
  (name, count, label) =>
    `💘 ${count} ${label} in your area haven't met you yet, ${name}. Let's fix that!`,
  (name) =>
    `Found your perfect match, ${name} — but they're about to expire. Tap to see who! 🎁`,
];

const LAST_CHANCE_VARIANTS: ReadonlyArray<
  (name: string, count: number, label: string, loc?: string | null) => string
> = [
  (name, count) =>
    `${name}, we're about to archive your profile. Tap in now to keep all ${count} of your matches!`,
  (name, count, label) =>
    `🚨 Last call, ${name}! ${count} ${label} will be removed from your queue tomorrow.`,
  (name) =>
    `We'll remove your photos in 24h, ${name} — reactivate now and we'll boost your visibility for 7 days 🎁`,
  (name) =>
    `${name}, come back today and we'll restore your full match list + 10 free likes 💎`,
  (name, count, label) =>
    `Your top ${count} ${label} are about to disappear forever, ${name}. Don't let them go! 👀`,
];

function pickVariant(
  variants: ReadonlyArray<
    (n: string, c: number, l: string, l2?: string | null) => string
  >,
  index?: number,
) {
  const idx = index ?? Math.floor(Math.random() * variants.length);
  return variants[idx % variants.length];
}

/** Compute days since `lastActiveIso` relative to `now`. */
function daysSince(lastActiveIso: string, now: Date): number {
  const last = new Date(lastActiveIso);
  if (Number.isNaN(last.getTime())) return 0;
  const diffMs = now.getTime() - last.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** Decide which stage (1/2/3) applies for a user based on inactivity. */
function stageFor(inactiveDays: number): ReengagementStage | null {
  for (const s of STAGES) {
    if (
      inactiveDays >= s.inactiveDaysMin &&
      inactiveDays <= s.inactiveDaysMax
    ) {
      return s;
    }
  }
  return null;
}

/** Count active, profile-complete users that match the user's gender preference. */
async function countNearbyUsers(
  db: D1Database,
  userId: string,
  gender: string | null,
  prefs: ParsedPreferences,
): Promise<number> {
  try {
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
    const g = (gender ?? "").toLowerCase();
    if (g === "male" || g === "female") {
      const oppositeGender = g === "male" ? "female" : "male";
      const { results } = await db
        .prepare(
          `SELECT COUNT(*) as c FROM users
           WHERE id != ?
             AND is_active = 1
             AND is_profile_complete = 1
             AND gender = ?`,
        )
        .bind(userId, oppositeGender)
        .all();
      return Number(
        (results?.[0] as Record<string, unknown> | undefined)?.c ?? 0,
      );
    }
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
      undefined,
      error,
    );
    return 0;
  }
}

/** Send a single reengagement notification. Effect-wrapped for typed errors. */
function enqueueReengagement(
  db: D1Database,
  producer: NotificationQueueProducer,
  notificationId: string,
  userId: string,
  type: ReengagementStage["type"],
  payload: Record<string, unknown>,
): Effect.Effect<void, Error, never> {
  return persistAndEnqueue(db, producer, {
    notificationId,
    userId,
    type,
    payload: JSON.stringify(payload),
  });
}

/** Run the 3-stage reengagement job. Picks one stage per user per run. */
export async function runReengagementJob(env: Env): Promise<void> {
  log.info("runReengagementJob", "Starting re-engagement job");

  const now = new Date();

  // Bound the query to [shortestMinDays, longestMaxDays] so stale rows
  // outside the stage window can't fill the batch and starve eligible users.
  const shortestMinDays = Math.min(...STAGES.map((s) => s.inactiveDaysMin));
  const longestMaxDays = Math.max(...STAGES.map((s) => s.inactiveDaysMax));
  const lowerCutoff = new Date(now);
  lowerCutoff.setDate(lowerCutoff.getDate() - shortestMinDays);
  const upperCutoff = new Date(now);
  upperCutoff.setDate(upperCutoff.getDate() - longestMaxDays);

  const effect = pipe(
    Effect.tryPromise({
      try: async () => {
        const { results } = await env.DB.prepare(
          `SELECT id, first_name, gender, location, preferences,
                  last_active, last_reengagement_stage, last_reengagement_at
           FROM users
           WHERE is_active = 1
             AND is_sleeping = 0
             AND is_profile_complete = 1
             AND last_active IS NOT NULL
             AND last_active <= ?
             AND last_active >= ?
           LIMIT ?`,
        )
          .bind(
            lowerCutoff.toISOString(),
            upperCutoff.toISOString(),
            BATCH_SIZE,
          )
          .all();
        return (results ?? []) as Array<Record<string, unknown>>;
      },
      catch: (error) => new Error(`fetchCandidates: ${String(error)}`),
    }),
    Effect.flatMap((candidates) =>
      Effect.sync(() => {
        log.info("runReengagementJob", `Found ${candidates.length} candidates`);
        return candidates;
      }),
    ),
    Effect.flatMap((candidates) =>
      Effect.forEach(candidates, (user) => processCandidate(env, user, now), {
        concurrency: 1,
        discard: true,
      }),
    ),
  );

  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    if (failure._tag === "Some") {
      log.error("runReengagementJob", "Job failed", undefined, failure.value);
    } else {
      log.error(
        "runReengagementJob",
        "Job failed (defect)",
        undefined,
        exit.cause,
      );
    }
    throw new Error(`Reengagement job failed: ${String(exit.cause)}`);
  }
  log.info("runReengagementJob", "Job complete");
}

/** Process a single reengagement candidate. */
function processCandidate(
  env: Env,
  user: Record<string, unknown>,
  now: Date,
): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    const id = String(user.id);
    const firstName = String(user.first_name || "there");
    const gender = user.gender ? String(user.gender) : null;
    const lastActiveRaw = user.last_active ? String(user.last_active) : null;
    const lastStage = user.last_reengagement_stage
      ? Number(user.last_reengagement_stage)
      : 0;
    const lastAt = user.last_reengagement_at
      ? String(user.last_reengagement_at)
      : null;

    if (!lastActiveRaw) {
      log.warn("processCandidate", "skipping user with no last_active", { id });
      return;
    }

    const inactiveDays = daysSince(lastActiveRaw, now);
    const stage = stageFor(inactiveDays);
    if (!stage) {
      return; // not yet eligible
    }

    // Cooldown: skip if same stage fired within its cooldown window
    if (lastStage === stage.stage && lastAt) {
      const sinceLastMs = now.getTime() - new Date(lastAt).getTime();
      const cooldownMs = stage.cooldownDays * 24 * 60 * 60 * 1000;
      if (sinceLastMs < cooldownMs) {
        return;
      }
    }

    const producer = new NotificationQueueProducer(env.NOTIFICATION_QUEUE);

    const nearbyCount = yield* Effect.promise(() =>
      countNearbyUsers(
        env.DB,
        id,
        gender,
        parsePreferences(user.preferences ? String(user.preferences) : null),
      ),
    );
    const marketingCount = getMarketingCount(nearbyCount);
    const genderLabel = getGenderLabel(
      gender,
      parsePreferences(user.preferences ? String(user.preferences) : null),
    );
    const safeName = escapeMarkdown(firstName);
    const city = extractCity(user.location ? String(user.location) : null);
    const safeCity = city ? escapeMarkdown(city) : null;

    const variant = pickVariant(
      stage.stage === 1
        ? GENTLE_VARIANTS
        : stage.stage === 2
          ? URGENT_VARIANTS
          : LAST_CHANCE_VARIANTS,
    );
    const message = variant(
      safeName,
      marketingCount,
      genderLabel.plural,
      safeCity,
    );

    const notificationId = crypto.randomUUID();
    const payload: Record<string, unknown> = {
      message,
      action: "find_match",
      stage: stage.stage,
      tone: stage.tone,
      marketingCount,
    };

    const enqueueResult = yield* enqueueReengagement(
      env.DB,
      producer,
      notificationId,
      id,
      stage.type,
      payload,
    ).pipe(Effect.either);

    if (enqueueResult._tag === "Left") {
      log.error(
        "processCandidate",
        `Failed to enqueue`,
        { id },
        enqueueResult.left,
      );
      return;
    }

    // Persist stage progress only after successful enqueue.
    yield* Effect.tryPromise({
      try: async () => {
        await env.DB.prepare(
          `UPDATE users
           SET last_reengagement_stage = ?,
               last_reengagement_at = ?,
               last_reminded_at = ?
           WHERE id = ?`,
        )
          .bind(stage.stage, now.toISOString(), now.toISOString(), id)
          .run();
      },
      catch: (error) => new Error(`updateLastReminded: ${String(error)}`),
    }).pipe(
      Effect.tapError((err) =>
        Effect.sync(() =>
          log.error(
            "processCandidate",
            "Failed to update stage progress",
            { id, stage: stage.stage },
            err,
          ),
        ),
      ),
      Effect.orElse(() => Effect.void),
    );

    log.info(
      "processCandidate",
      `Sent ${stage.type} to ${id} (inactive=${inactiveDays}d, real=${nearbyCount}, marketing=${marketingCount})`,
    );

    return enqueueResult.right;
  });
}
