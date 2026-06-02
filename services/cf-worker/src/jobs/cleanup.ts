import { Cause, Effect, Exit } from "effect";
import type { Env } from "../index.js";
import { createLogger } from "@meetsmatch/cf-shared";
import {
  NotificationQueueProducer,
  persistAndEnqueue,
} from "../notifications/queue.js";

const log = createLogger("cf-worker.cleanup");

interface UserRow {
  id: string;
  hidden_from_matches: number;
  media_deleted_at: string | null;
  last_active: string | null;
  media_urls: string;
}

const dbRun = (
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Effect.Effect<D1Result, Error, never> =>
  Effect.tryPromise({
    try: () =>
      db
        .prepare(sql)
        .bind(...params)
        .run(),
    catch: (error) =>
      new Error(`${sql.split("\n")[0]?.trim() ?? "sql"}: ${String(error)}`),
  });

const dbAll = <T = Record<string, unknown>>(
  db: D1Database,
  sql: string,
  ...params: unknown[]
): Effect.Effect<D1Result<T>, Error, never> =>
  Effect.tryPromise({
    try: async () =>
      db
        .prepare(sql)
        .bind(...params)
        .all<T>(),
    catch: (error) =>
      new Error(`${sql.split("\n")[0]?.trim() ?? "sql"}: ${String(error)}`),
  });

/**
 * Cleanup job:
 * 1. Expire stale pending likes (>30 days) → reset liker's action to none
 * 2. Recycle old mutual matches (>14 days) → reset to pending
 * 3. Hide profiles from matches after 14 days of inactivity
 * 4. Delete media after 30 days of inactivity and notify user
 * 5. Clean old profile_views (>90 days)
 */
export async function runCleanupJob(env: Env): Promise<void> {
  const exit = await Effect.runPromiseExit(cleanupEffect(env));
  if (Exit.isFailure(exit)) {
    const failure = Cause.failureOption(exit.cause);
    if (failure._tag === "Some") {
      log.error("runCleanupJob", "Job failed", undefined, failure.value);
    } else {
      log.error("runCleanupJob", "Job failed (defect)", undefined, exit.cause);
    }
    throw failure._tag === "Some"
      ? failure.value
      : new Error(String(exit.cause));
  }
}

function cleanupEffect(env: Env): Effect.Effect<void, Error, never> {
  const producer = new NotificationQueueProducer(env.NOTIFICATION_QUEUE);
  const db = env.DB;
  return Effect.gen(function* () {
    const now = new Date();
    const likeExpireCutoff = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const matchRecycleCutoff = new Date(
      now.getTime() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const hideCutoff = new Date(
      now.getTime() - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const deleteCutoff = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const viewCutoff = new Date(
      now.getTime() - 90 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // 1. Expire stale pending likes (>30 days)
    const [likes1, likes2] = yield* Effect.all(
      [
        dbRun(
          db,
          `UPDATE matches
           SET user1_action = 'none', status = 'pending', updated_at = CURRENT_TIMESTAMP
           WHERE user1_action = 'like' AND user2_action = 'none' AND updated_at < ?`,
          likeExpireCutoff,
        ),
        dbRun(
          db,
          `UPDATE matches
           SET user2_action = 'none', status = 'pending', updated_at = CURRENT_TIMESTAMP
           WHERE user2_action = 'like' AND user1_action = 'none' AND updated_at < ?`,
          likeExpireCutoff,
        ),
      ],
      { concurrency: "unbounded" },
    );
    log.info(
      "runCleanupJob",
      `Expired ${(likes1.meta?.changes ?? 0) + (likes2.meta?.changes ?? 0)} stale pending likes`,
    );

    // 2. Recycle old mutual matches (>14 days)
    const recycled = yield* dbRun(
      db,
      `UPDATE matches
       SET status = 'pending', user1_action = 'none', user2_action = 'none',
           matched_at = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE status = 'matched' AND matched_at < ?`,
      matchRecycleCutoff,
    );
    log.info(
      "runCleanupJob",
      `Recycled ${recycled.meta?.changes ?? 0} old mutual matches`,
    );

    // 3. Hide profiles after 14 days of inactivity
    const hidden = yield* dbRun(
      db,
      `UPDATE users
       SET hidden_from_matches = 1
       WHERE hidden_from_matches = 0
         AND (last_active IS NULL OR last_active < ?)`,
      hideCutoff,
    );
    log.info(
      "runCleanupJob",
      `Hidden ${hidden.meta?.changes ?? 0} inactive profiles from matches`,
    );

    // 4. Delete media after 30 days of inactivity
    const usersToClean = yield* dbAll<UserRow>(
      db,
      `SELECT id, hidden_from_matches, media_deleted_at, last_active, media_urls
       FROM users
       WHERE media_deleted_at IS NULL
         AND media_urls IS NOT NULL
         AND media_urls != '[]'
         AND (last_active IS NULL OR last_active < ?)`,
      deleteCutoff,
    );

    const rows = (usersToClean.results ?? []) as UserRow[];
    let deletedCount = 0;
    let failures = 0;

    for (const row of rows) {
      const cleaned = yield* Effect.either(cleanUserMedia(env, producer, row));
      if (cleaned._tag === "Right") {
        if (cleaned.right) deletedCount++;
        else failures++;
      } else {
        failures++;
      }
    }

    log.info(
      "runCleanupJob",
      `Deleted media for ${deletedCount} inactive users (${failures} failed)`,
    );

    // 5. Clean old profile_views (>90 days)
    const viewCleanup = yield* dbRun(
      db,
      `DELETE FROM profile_views WHERE viewed_at < ?`,
      viewCutoff,
    );
    log.info(
      "runCleanupJob",
      `Removed ${viewCleanup.meta?.changes ?? 0} old profile view records`,
    );

    // Re-throw if any media deletions failed so Cloudflare can retry
    if (failures > 0) {
      return yield* Effect.fail(
        new Error(
          `[cleanup] ${failures}/${rows.length} users had media deletion failures. Cloudflare will retry.`,
        ),
      );
    }
  });
}

function cleanUserMedia(
  env: Env,
  producer: NotificationQueueProducer,
  row: UserRow,
): Effect.Effect<boolean, never, never> {
  return Effect.gen(function* () {
    let mediaUrls: Array<{ url: string; type: string }> = [];
    if (row.media_urls) {
      try {
        mediaUrls = JSON.parse(row.media_urls) as Array<{
          url: string;
          type: string;
        }>;
      } catch (error) {
        log.error(
          "cleanUserMedia",
          "Invalid JSON in media_urls",
          { userId: row.id },
          error,
        );
        return false;
      }
    }
    let allDeleted = true;

    for (const media of mediaUrls) {
      try {
        const url = new URL(media.url);
        const key = url.pathname.slice(1);
        if (key) {
          const exit = yield* Effect.either(
            Effect.tryPromise({
              try: () =>
                env.API_SERVICE.fetch(
                  new Request(`http://api/users/${row.id}/media`, {
                    method: "DELETE",
                    body: JSON.stringify({ url: media.url }),
                    headers: { "Content-Type": "application/json" },
                  }),
                ),
              catch: (error) => new Error(String(error)),
            }),
          );
          if (exit._tag === "Right") {
            const response = exit.right;
            if (!response.ok && response.status !== 404) {
              log.error(
                "cleanUserMedia",
                `R2 deletion returned ${response.status}`,
                { userId: row.id, url: media.url },
              );
              allDeleted = false;
            }
          } else {
            log.error(
              "cleanUserMedia",
              "R2 deletion threw",
              { userId: row.id, url: media.url },
              exit.left,
            );
            allDeleted = false;
          }
        }
      } catch (r2Error) {
        log.error(
          "cleanUserMedia",
          "Failed to delete R2 object",
          { userId: row.id, url: media.url },
          r2Error,
        );
        allDeleted = false;
      }
    }

    if (!allDeleted) {
      log.error("cleanUserMedia", "Skipping DB update due to R2 failures", {
        userId: row.id,
      });
      return false;
    }

    const dbExit = yield* Effect.either(
      Effect.tryPromise({
        try: () =>
          env.DB.prepare(
            `UPDATE users
             SET media_urls = '[]', media_deleted_at = CURRENT_TIMESTAMP, is_profile_complete = 0
             WHERE id = ?`,
          )
            .bind(row.id)
            .run(),
        catch: (error) => new Error(String(error)),
      }),
    );

    if (dbExit._tag === "Left") {
      log.error(
        "cleanUserMedia",
        "DB update failed after R2 deletion",
        { userId: row.id },
        dbExit.left,
      );
      return false;
    }

    yield* Effect.either(
      persistAndEnqueue(env.DB, producer, {
        notificationId: crypto.randomUUID(),
        userId: row.id,
        type: "CLEANUP_MEDIA_DELETED",
        payload: JSON.stringify({
          message:
            "📸 Your profile photos were removed after 30 days of inactivity. Upload new photos to start matching again!",
        }),
      }),
    );
    return true;
  });
}
