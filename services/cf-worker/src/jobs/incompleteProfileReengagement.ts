import { Cause, Effect, Exit, pipe } from "effect";
import type { Env } from "../index.js";
import { createLogger } from "@meetsmatch/cf-shared";
import {
  NotificationQueueProducer,
  persistAndEnqueue,
} from "../notifications/queue.js";

const log = createLogger("cf-worker.incompleteProfileReengagement");

// 3-stage escalation for users with incomplete profiles.
// Stage triggers are based on days since account creation; cooldowns prevent
// the same stage from firing too often.

interface IncompleteStage {
  readonly stage: 1 | 2 | 3;
  readonly type:
    | "INCOMPLETE_PROFILE_GENTLE"
    | "INCOMPLETE_PROFILE_URGENT"
    | "INCOMPLETE_PROFILE_LAST_CHANCE";
  readonly accountAgeDaysMin: number;
  readonly accountAgeDaysMax: number;
  readonly cooldownDays: number;
}

const STAGES: ReadonlyArray<IncompleteStage> = [
  {
    stage: 1,
    type: "INCOMPLETE_PROFILE_GENTLE",
    accountAgeDaysMin: 3,
    accountAgeDaysMax: 6,
    cooldownDays: 2,
  },
  {
    stage: 2,
    type: "INCOMPLETE_PROFILE_URGENT",
    accountAgeDaysMin: 7,
    accountAgeDaysMax: 13,
    cooldownDays: 4,
  },
  {
    stage: 3,
    type: "INCOMPLETE_PROFILE_LAST_CHANCE",
    accountAgeDaysMin: 14,
    accountAgeDaysMax: 365,
    cooldownDays: 7,
  },
];

const BATCH_SIZE = 100;

function escapeMarkdown(text: string): string {
  return text.replace(/[_*\[\]`\.!#+\-={}|~()><\\]/g, "\\$&");
}

const GENTLE_VARIANTS: ReadonlyArray<(name: string) => string> = [
  (name) =>
    `Hey ${name}! Your profile is almost ready. Finish it up to start finding matches! 💕`,
  (name) =>
    `${name}, you're so close! Complete your profile and unlock your first match ✨`,
  (name) =>
    `Don't leave us hanging, ${name}! Finish your profile and see who's waiting for you 👀`,
];

const URGENT_VARIANTS: ReadonlyArray<(name: string) => string> = [
  (name) =>
    `Hey ${name}, other people are matching right now. Complete your profile to join in! 🔥`,
  (name) =>
    `${name}, your perfect match is waiting! Just finish a few more profile details 💘`,
  (name) =>
    `Quick one, ${name} — complete your profile and we'll show you your first match! 🎁`,
];

const LAST_CHANCE_VARIANTS: ReadonlyArray<(name: string) => string> = [
  (name) =>
    `${name}, we'll archive incomplete profiles in 7 days to keep our community active. Tap to complete yours now!`,
  (name) =>
    `${name}, your spot is being held — but only for a few more days. Finish your profile and start meeting people today!`,
  (name) =>
    `Last reminder, ${name}! Complete your profile in the next 7 days or we'll have to say goodbye 💔`,
];

function pickVariant(
  variants: ReadonlyArray<(n: string) => string>,
  index?: number,
) {
  const idx = index ?? Math.floor(Math.random() * variants.length);
  return variants[idx % variants.length];
}

function daysSince(iso: string, now: Date): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
}

function stageFor(ageDays: number): IncompleteStage | null {
  for (const s of STAGES) {
    if (ageDays >= s.accountAgeDaysMin && ageDays <= s.accountAgeDaysMax) {
      return s;
    }
  }
  return null;
}

interface IncompleteUser {
  id: string;
  first_name: string | null;
  language: string | null;
  created_at: string | null;
  last_reminded_at: string | null;
  last_reengagement_stage: number | null;
  last_reengagement_at: string | null;
}

export async function runIncompleteProfileReengagementJob(
  env: Env,
): Promise<void> {
  log.info("incompleteProfileReengagement", "Starting job");

  const now = new Date();
  const shortestMin = Math.min(...STAGES.map((s) => s.accountAgeDaysMin));
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - shortestMin);

  const effect = pipe(
    Effect.tryPromise({
      try: async () => {
        const { results } = await env.DB.prepare(
          `SELECT id, first_name, language, created_at,
                  last_reminded_at, last_reengagement_stage, last_reengagement_at
           FROM users
           WHERE is_active = 1
             AND is_sleeping = 0
             AND is_profile_complete = 0
             AND created_at <= ?
           LIMIT ?`,
        )
          .bind(cutoff.toISOString(), BATCH_SIZE)
          .all();
        return (results ?? []) as Array<Record<string, unknown>>;
      },
      catch: (error) => new Error(`fetchCandidates: ${String(error)}`),
    }),
    Effect.flatMap((candidates) =>
      Effect.sync(() => {
        log.info(
          "incompleteProfileReengagement",
          `Found ${candidates.length} candidates`,
        );
        return candidates;
      }),
    ),
    Effect.flatMap((candidates) =>
      Effect.forEach(
        candidates,
        (user) => processIncompleteCandidate(env, user, now),
        { concurrency: 1, discard: true },
      ),
    ),
  );

  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    if (failure._tag === "Some") {
      log.error(
        "incompleteProfileReengagement",
        "Job failed",
        undefined,
        failure.value,
      );
    } else {
      log.error(
        "incompleteProfileReengagement",
        "Job failed (defect)",
        undefined,
        exit.cause,
      );
    }
    throw new Error(`Incomplete-profile job failed: ${String(exit.cause)}`);
  }
  log.info("incompleteProfileReengagement", "Job complete");
}

function processIncompleteCandidate(
  env: Env,
  user: Record<string, unknown>,
  now: Date,
): Effect.Effect<void, never, never> {
  return Effect.gen(function* () {
    const id = String(user.id);
    const firstName = user.first_name ? String(user.first_name) : null;
    const lang = String(user.language || "en") as "en" | "id";
    const createdRaw = user.created_at ? String(user.created_at) : null;
    const lastStage = user.last_reengagement_stage
      ? Number(user.last_reengagement_stage)
      : 0;
    const lastAt = user.last_reengagement_at
      ? String(user.last_reengagement_at)
      : null;

    if (!createdRaw) {
      log.warn(
        "incompleteProfileReengagement",
        "skipping user with no created_at",
        { id },
      );
      return;
    }

    const accountAge = daysSince(createdRaw, now);
    const stage = stageFor(accountAge);
    if (!stage) return;

    // Cooldown: skip if same stage fired within its cooldown window
    if (lastStage === stage.stage && lastAt) {
      const sinceMs = now.getTime() - new Date(lastAt).getTime();
      const cooldownMs = stage.cooldownDays * 86_400_000;
      if (sinceMs < cooldownMs) {
        return;
      }
    }

    const displayName = firstName
      ? escapeMarkdown(firstName)
      : lang === "id"
        ? "Kamu"
        : "There";

    const variant = pickVariant(
      stage.stage === 1
        ? GENTLE_VARIANTS
        : stage.stage === 2
          ? URGENT_VARIANTS
          : LAST_CHANCE_VARIANTS,
    );
    const message = variant(displayName);

    const producer = new NotificationQueueProducer(env.NOTIFICATION_QUEUE);
    const notificationId = crypto.randomUUID();
    const payload: Record<string, unknown> = {
      message,
      action: "complete_profile",
      language: lang,
      stage: stage.stage,
    };

    const enqueueResult = yield* persistAndEnqueue(env.DB, producer, {
      notificationId,
      userId: id,
      type: stage.type,
      payload: JSON.stringify(payload),
    }).pipe(Effect.either);

    if (enqueueResult._tag === "Left") {
      log.error(
        "incompleteProfileReengagement",
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
            "incompleteProfileReengagement",
            "Failed to update stage progress",
            { id, stage: stage.stage },
            err,
          ),
        ),
      ),
      Effect.orElse(() => Effect.void),
    );

    log.info(
      "incompleteProfileReengagement",
      `Sent ${stage.type} to ${id} (age=${accountAge}d)`,
    );
  });
}
