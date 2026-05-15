import type { Env } from '../index.js';

interface UserRow {
  id: string;
  telegram_id: string;
  hidden_from_matches: number;
  media_deleted_at: string | null;
  last_interaction_at: string;
}

/**
 * Profile inactivity cleanup job:
 * 1. Hide profiles from matches after 14 days of inactivity
 * 2. Delete media after 30 days of inactivity and notify user
 */
export async function runCleanupJob(env: Env): Promise<void> {
  const now = new Date();

  // 1. Hide profiles after 14 days of inactivity
  const hideCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const hideResult = await env.DB.prepare(
    `UPDATE users
     SET hidden_from_matches = 1
     WHERE hidden_from_matches = 0
       AND (last_interaction_at IS NULL OR last_interaction_at < ?)
       AND (media_deleted_at IS NULL OR media_deleted_at IS NOT NULL)`
  ).bind(hideCutoff).run();
  console.log(`[cleanup] Hidden ${hideResult.meta?.changes ?? 0} inactive profiles from matches`);

  // 2. Delete media after 30 days of inactivity
  const deleteCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Find users whose media should be deleted
  const usersToClean = await env.DB.prepare(
    `SELECT id, telegram_id, hidden_from_matches, media_deleted_at, last_interaction_at
     FROM users
     WHERE media_deleted_at IS NULL
       AND (last_interaction_at IS NULL OR last_interaction_at < ?)`
  ).bind(deleteCutoff).all<UserRow>();

  const rows = usersToClean.results ?? [];
  let deletedCount = 0;

  for (const row of rows) {
    try {
      // Get user's media URLs to delete from R2
      const mediaRow = await env.DB.prepare(
        'SELECT media_urls FROM users WHERE id = ?'
      ).bind(row.id).first() as { media_urls: string } | null;

      if (mediaRow && mediaRow.media_urls) {
        const mediaUrls = JSON.parse(mediaRow.media_urls) as Array<{ url: string; type: string }>;
        for (const media of mediaUrls) {
          try {
            // Extract R2 key from public URL: https://media.meetsmatch.irfndi.workers.dev/{key}
            const url = new URL(media.url);
            const key = url.pathname.slice(1); // remove leading /
            if (key) {
              // Delete from R2 via API service (R2 is bound to cf-api)
              await env.API_SERVICE.fetch(
                new Request(`http://api/users/${row.id}/media`, {
                  method: 'DELETE',
                  body: JSON.stringify({ url: media.url }),
                  headers: { 'Content-Type': 'application/json' },
                })
              );
            }
          } catch (r2Error) {
            console.error(`[cleanup] Failed to delete R2 object for user ${row.id}:`, r2Error);
          }
        }
      }

      // Mark media as deleted and profile incomplete
      await env.DB.prepare(
        `UPDATE users
         SET media_urls = '[]', media_deleted_at = CURRENT_TIMESTAMP, is_profile_complete = 0
         WHERE id = ?`
      ).bind(row.id).run();

      // Notify user
      await env.BOT_SERVICE.fetch(
        new Request('http://bot/send-notification', {
          method: 'POST',
          body: JSON.stringify({
            userId: row.telegram_id,
            type: 'CLEANUP_MEDIA_DELETED',
            payload: JSON.stringify({
              message: '📸 Your profile photos were removed after 30 days of inactivity. Upload new photos to start matching again!',
            }),
          }),
          headers: { 'Content-Type': 'application/json' },
        })
      );

      deletedCount++;
    } catch (error) {
      console.error(`[cleanup] Failed to clean user ${row.id}:`, error);
    }
  }

  console.log(`[cleanup] Deleted media for ${deletedCount} inactive users`);
}
