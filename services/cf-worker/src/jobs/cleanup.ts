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

interface CleanupRow {
  c?: number;
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

const dbAll = <T = CleanupRow>(
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
    const failure = Cause.findErrorOption(exit.cause);
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
    const nowTime = Date.now();
    const likeExpireCutoff = new Date(
      nowTime - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const matchRecycleCutoff = new Date(
      nowTime - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const hideCutoff = new Date(
      nowTime - 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const deleteCutoff = new Date(
      nowTime - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const viewCutoff = new Date(
      nowTime - 90 * 24 * 60 * 60 * 1000,
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
      const cleaned = yield* Effect.result(cleanUserMedia(env, producer, row));
      if (cleaned._tag === "Success") {
        if (cleaned.success) deletedCount++;
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
        const parsed = JSON.parse(row.media_urls) as unknown;
        if (!Array.isArray(parsed)) {
          // Valid JSON but not an array (e.g. "null", "{}", or a quoted
          // string) is invalid stored data — flag it for repair and skip the
          // DB update / notification for this user.
          log.error(
            "cleanUserMedia",
            "media_urls is not an array; skipping user",
            { userId: row.id, mediaUrls: row.media_urls },
          );
          return false;
        }
        mediaUrls = parsed as Array<{ url: string; type: string }>;
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
          const exit = yield* Effect.result(
            Effect.tryPromise({
              try: () =>
                env.API_SERVICE.fetch(
                  new Request(`http://api/users/${row.id}/media`, {
                    method: "DELETE",
                    body: JSON.stringify({ url: media.url }),
                    headers: (() => {
                      const headers = new Headers({
                        "Content-Type": "application/json",
                      });
                      if (env.API_SECRET)
                        headers.set("x-api-secret", env.API_SECRET);
                      return headers;
                    })(),
                  }),
                ),
              catch: (error) => new Error(String(error)),
            }),
          );
          if (exit._tag === "Success") {
            const response = exit.success;
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
              exit.failure,
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

    const dbExit = yield* Effect.result(
      Effect.tryPromise({
        try: () =>
          env.DB.prepare(
            `UPDATE users
             SET media_urls = '[]', media_deleted_at = CURRENT_TIMESTAMP, is_profile_complete = 0
             WHERE id = ? AND media_urls = ?`,
          )
            .bind(row.id, row.media_urls)
            .run(),
        catch: (error) => new Error(String(error)),
      }),
    );

    if (dbExit._tag === "Failure") {
      log.error(
        "cleanUserMedia",
        "DB update failed after R2 deletion",
        { userId: row.id },
        dbExit.failure,
      );
      return false;
    }

    if ((dbExit.success.meta?.changes ?? 0) === 0) {
      // Another request changed media_urls concurrently, so this row was
      // already cleaned up. Skip the notification to avoid a duplicate.
      log.info(
        "cleanUserMedia",
        "Skipping notification — media_urls changed concurrently",
        { userId: row.id },
      );
      return false;
    }

    const enqueueExit = yield* Effect.result(
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
    if (enqueueExit._tag === "Failure") {
      log.error(
        "cleanUserMedia",
        "Failed to enqueue cleanup notification",
        { userId: row.id },
        enqueueExit.failure,
      );
    }
    return true;
  });
}
