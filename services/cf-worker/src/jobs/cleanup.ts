import type { Env } from "../index.js";
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-worker");

interface UserRow {
  id: string;
  hidden_from_matches: number;
  media_deleted_at: string | null;
  last_active: string | null;
  media_urls: string;
}

/**
 * Profile inactivity cleanup job:
 * 1. Hide profiles from matches after 14 days of inactivity
 * 2. Delete media after 30 days of inactivity and notify user
 */
export async function runCleanupJob(env: Env): Promise<void> {
  const now = new Date();

  // 1. Hide profiles after 14 days of inactivity
  const hideCutoff = new Date(
    now.getTime() - 14 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const hideResult = await env.DB.prepare(
    `UPDATE users
     SET hidden_from_matches = 1
     WHERE hidden_from_matches = 0
       AND (last_active IS NULL OR last_active < ?)`,
  )
    .bind(hideCutoff)
    .run();
  console.log(
    `[cleanup] Hidden ${hideResult.meta?.changes ?? 0} inactive profiles from matches`,
  );

  // 2. Delete media after 30 days of inactivity
  const deleteCutoff = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Find users whose media should be deleted
  const usersToClean = await env.DB.prepare(
    `SELECT id, hidden_from_matches, media_deleted_at, last_active, media_urls
     FROM users
     WHERE media_deleted_at IS NULL
       AND media_urls IS NOT NULL
       AND media_urls != '[]'
       AND (last_active IS NULL OR last_active < ?)`,
  )
    .bind(deleteCutoff)
    .all<UserRow>();

  const rows = usersToClean.results ?? [];
  let deletedCount = 0;

  for (const row of rows) {
    try {
      const mediaUrls = row.media_urls
        ? (JSON.parse(row.media_urls) as Array<{ url: string; type: string }>)
        : [];
      let allDeleted = true;

      for (const media of mediaUrls) {
        try {
          // Extract R2 key from public URL: https://media.meetsmatch.irfndi.workers.dev/{key}
          const url = new URL(media.url);
          const key = url.pathname.slice(1); // remove leading /
          if (key) {
            // Delete from R2 via API service (R2 is bound to cf-api)
            const response = await env.API_SERVICE.fetch(
              new Request(`http://api/users/${row.id}/media`, {
                method: "DELETE",
                body: JSON.stringify({ url: media.url }),
                headers: { "Content-Type": "application/json" },
              }),
            );
            if (!response.ok) {
              log.error(
                "cleanup",
                `R2 deletion returned ${response.status}`,
                { userId: row.id, url: media.url },
              );
              allDeleted = false;
            }
          }
        } catch (r2Error) {
          log.error(
            "cleanup",
            "Failed to delete R2 object",
            { userId: row.id, url: media.url },
            r2Error,
          );
          allDeleted = false;
        }
      }

      // Only mark media as deleted if all R2 deletions succeeded
      if (!allDeleted) {
        log.error("cleanup", "Skipping DB update due to R2 deletion failures", {
          userId: row.id,
        });
        continue;
      }

      // Mark media as deleted and profile incomplete
      await env.DB.prepare(
        `UPDATE users
         SET media_urls = '[]', media_deleted_at = CURRENT_TIMESTAMP, is_profile_complete = 0
         WHERE id = ?`,
      )
        .bind(row.id)
        .run();

      // Notify user
      await env.BOT_SERVICE.fetch(
        new Request("http://bot/send-notification", {
          method: "POST",
          body: JSON.stringify({
            userId: row.id,
            type: "CLEANUP_MEDIA_DELETED",
            payload: JSON.stringify({
              message:
                "📸 Your profile photos were removed after 30 days of inactivity. Upload new photos to start matching again!",
            }),
          }),
          headers: { "Content-Type": "application/json" },
        }),
      );

      deletedCount++;
    } catch (error) {
      console.error(`[cleanup] Failed to clean user ${row.id}:`, error);
    }
  }

  console.log(`[cleanup] Deleted media for ${deletedCount} inactive users`);
}
