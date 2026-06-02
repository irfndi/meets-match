import { Cause, Effect, Exit, pipe } from "effect";
import type { Env } from "../index.js";
import { createLogger } from "@meetsmatch/cf-shared";
import {
  NotificationQueueProducer,
  persistAndEnqueue,
} from "../notifications/queue.js";

const log = createLogger("cf-worker.dailyActiveStates");

// One daily message per active user. The state determines the message type:
// - has pending likes  -> DAILY_LIKES_REMINDER
// - no swipes today    -> DAILY_EXPLORE_PROMPT
// - default            -> DAILY_ACTIVE_HAPPY

const BATCH_SIZE = 100;
const ONE_DAY_MS = 86_400_000;

function escapeMarkdown(text: string): string {
  return text.replace(/[_*\[\]`\.!#+\-={}|~()><\\]/g, "\\$&");
}

const LIKES_REMINDER_VARIANTS: ReadonlyArray<(name: string) => string> = [
  (name) =>
    `${name}, ${`\${count}`} people are waiting for you to like them back! 💕 Tap My Matches to see who.`,
  (name) =>
    `Hey ${name} — you've got new likes! Check them out before they expire ⏰`,
  (name) =>
    `${name}, someone special is hoping you'll notice them. See your new likes now 👀`,
];

const EXPLORE_PROMPT_VARIANTS: ReadonlyArray<(name: string) => string> = [
  (name) =>
    `${name}, fresh matches are waiting today! Take a quick look and find your spark ✨`,
  (name) =>
    `New profiles in your area, ${name} — don't miss out! Tap to see who's new 🔥`,
  (name) =>
    `Hey ${name}! Your daily recommendations are ready. Tap to discover someone new 💘`,
];

const HAPPY_VARIANTS: ReadonlyArray<(name: string) => string> = [
  (name) =>
    `Good to see you active, ${name}! Keep the streak going — there are great matches waiting 💪`,
  (name) =>
    `${name}, you showed up. That's the hardest part. Now go find your match! 🎯`,
  (name) =>
    `Hey ${name}! Quick reminder: your perfect match could be one swipe away 💫`,
];

function pickVariant(
  variants: ReadonlyArray<(n: string) => string>,
  index?: number,
) {
  const idx = index ?? Math.floor(Math.random() * variants.length);
  return variants[idx % variants.length];
}

interface ActiveUser {
  id: string;
  first_name: string | null;
  language: string | null;
  last_active: string | null;
  last_daily_message_at: string | null;
  last_daily_message_type: string | null;
  daily_swipes_used: number | null;
  daily_likes_used: number | null;
}

interface ApiStateSnapshot {
  hasPendingLikes: boolean;
  swipesUsedToday: number;
}

async function fetchUserState(
  env: Env,
  userId: string,
): Promise<ApiStateSnapshot> {
  const defaultState: ApiStateSnapshot = {
    hasPendingLikes: false,
    swipesUsedToday: 0,
  };
  try {
    const res = await env.API_SERVICE.fetch(
      new Request(
        `http://api/users/${encodeURIComponent(userId)}/pending-likes`,
      ),
    );
    if (!res.ok) return defaultState;
    const data = (await res.json()) as { pendingLikes?: unknown[] };
    return {
      hasPendingLikes: Array.isArray(data.pendingLikes)
        ? data.pendingLikes.length > 0
        : false,
      swipesUsedToday: 0, // pending-likes endpoint doesn't expose this
    };
  } catch (error) {
    log.error(
      "fetchUserState",
      `Failed to fetch state for ${userId}`,
      undefined,
      error,
    );
    return defaultState;
  }
}

export async function runDailyActiveStatesJob(env: Env): Promise<void> {
  log.info("dailyActiveStates", "Starting job");

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - ONE_DAY_MS);
  const oneDayAgoIso = oneDayAgo.toISOString();

  const effect = pipe(
    Effect.tryPromise({
      try: async () => {
        const { results } = await env.DB.prepare(
          `SELECT id, first_name, language, last_active,
                  last_daily_message_at, last_daily_message_type,
                  daily_swipes_used, daily_likes_used
           FROM users
           WHERE is_active = 1
             AND is_sleeping = 0
             AND is_profile_complete = 1
             AND last_active >= ?
             AND (last_daily_message_at IS NULL OR last_daily_message_at <= ?)
           LIMIT ?`,
        )
          .bind(oneDayAgoIso, oneDayAgoIso, BATCH_SIZE)
          .all();
        return (results ?? []) as Array<Record<string, unknown>>;
      },
      catch: (error) => new Error(`fetchCandidates: ${String(error)}`),
    }),
    Effect.flatMap((candidates) =>
      Effect.sync(() => {
        log.info(
          "dailyActiveStates",
          `Found ${candidates.length} active candidates`,
        );
        return candidates;
      }),
    ),
    Effect.flatMap((candidates) =>
      Effect.forEach(
        candidates,
        (user) => processDailyCandidate(env, user, now),
        { concurrency: 5, discard: true },
      ),
    ),
  );

  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    if (failure._tag === "Some") {
      log.error("dailyActiveStates", "Job failed", undefined, failure.value);
    } else {
      log.error(
        "dailyActiveStates",
        "Job failed (defect)",
        undefined,
        exit.cause,
      );
    }
    throw new Error(`Daily active states job failed: ${String(exit.cause)}`);
  }
  log.info("dailyActiveStates", "Job complete");
}

function pickType(state: ApiStateSnapshot): {
  type: "DAILY_LIKES_REMINDER" | "DAILY_EXPLORE_PROMPT" | "DAILY_ACTIVE_HAPPY";
  message: (name: string) => string;
} {
  if (state.hasPendingLikes) {
    return {
      type: "DAILY_LIKES_REMINDER",
      message: pickVariant(LIKES_REMINDER_VARIANTS),
    };
  }
  if (state.swipesUsedToday === 0) {
    return {
      type: "DAILY_EXPLORE_PROMPT",
      message: pickVariant(EXPLORE_PROMPT_VARIANTS),
    };
  }
  return {
    type: "DAILY_ACTIVE_HAPPY",
    message: pickVariant(HAPPY_VARIANTS),
  };
}

function processDailyCandidate(
  env: Env,
  user: Record<string, unknown>,
  now: Date,
): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    const id = String(user.id);
    const firstName = user.first_name ? String(user.first_name) : null;
    const lang = String(user.language || "en") as "en" | "id";

    const state = yield* Effect.promise(() => fetchUserState(env, id));
    const { type, message: variant } = pickType(state);

    const displayName = firstName
      ? escapeMarkdown(firstName)
      : lang === "id"
        ? "Kamu"
        : "There";
    const message = variant(displayName);

    const producer = new NotificationQueueProducer(env.NOTIFICATION_QUEUE);
    const notificationId = crypto.randomUUID();
    const payload: Record<string, unknown> = {
      message,
      action: type === "DAILY_LIKES_REMINDER" ? "view_matches" : "find_match",
      state: type,
    };

    const enqueueResult = yield* persistAndEnqueue(env.DB, producer, {
      notificationId,
      userId: id,
      type,
      payload: JSON.stringify(payload),
    }).pipe(Effect.either);

    if (enqueueResult._tag === "Left") {
      log.error(
        "dailyActiveStates",
        `Failed to enqueue`,
        { id },
        enqueueResult.left,
      );
      return;
    }

    yield* Effect.tryPromise({
      try: async () => {
        await env.DB.prepare(
          `UPDATE users
           SET last_daily_message_at = ?,
               last_daily_message_type = ?
           WHERE id = ?`,
        )
          .bind(now.toISOString(), type, id)
          .run();
      },
      catch: (error) => new Error(`updateLastDailyMessage: ${String(error)}`),
    }).pipe(Effect.orElse(() => Effect.void));

    log.info("dailyActiveStates", `Sent ${type} to ${id}`);
  });
}
