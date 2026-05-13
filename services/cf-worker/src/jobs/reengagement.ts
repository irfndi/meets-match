import type { Env } from '../index.js';

const INACTIVE_DAYS_MIN = 7;
const INACTIVE_DAYS_MAX = 30;
const BATCH_SIZE = 100;

export async function runReengagementJob(env: Env): Promise<void> {
  console.log('[reengagement] Starting re-engagement job');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - INACTIVE_DAYS_MIN);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() - INACTIVE_DAYS_MAX);

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, username, first_name FROM users
       WHERE is_active = 1
       AND is_sleeping = 0
       AND (last_active <= ? OR last_active IS NULL)
       AND (last_reminded_at IS NULL OR last_reminded_at <= ?)
       LIMIT ?`
    ).bind(
      cutoffDate.toISOString(),
      maxDate.toISOString(),
      BATCH_SIZE
    ).all();

    const candidates = results ?? [];
    console.log(`[reengagement] Found ${candidates.length} candidates`);

    for (const user of candidates) {
      const userId = String((user as Record<string, unknown>).id);
      const firstName = String((user as Record<string, unknown>).first_name || 'there');

      try {
        const response = await env.API_SERVICE.fetch(new Request('http://api/notifications', {
          method: 'POST',
          body: JSON.stringify({
            userId,
            type: 'REENGAGEMENT',
            channel: 'TELEGRAM',
            payload: JSON.stringify({ message: `Hey ${firstName}! We miss you on MeetMatch. Come back and find your next match! 💘` }),
          }),
          headers: { 'Content-Type': 'application/json' },
        }));

        if (response.ok) {
          await env.DB.prepare(
            'UPDATE users SET last_reminded_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(userId).run();
          console.log(`[reengagement] Sent to ${userId}`);
        } else {
          console.error(`[reengagement] Failed to enqueue for ${userId}: ${response.status}`);
        }
      } catch (error) {
        console.error(`[reengagement] Error for ${userId}:`, error);
      }
    }

    console.log('[reengagement] Job complete');
  } catch (error) {
    console.error('[reengagement] Job failed:', error);
  }
}
