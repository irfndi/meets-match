import type { Env } from '../index.js';

const INACTIVE_DAYS_MIN = 7;
const INACTIVE_DAYS_MAX = 30;
const BATCH_SIZE = 100;

interface InactiveUser {
  id: string;
  first_name: string;
  gender: string | null;
  location: string | null;
}

const MESSAGE_VARIANTS = [
  (name: string, _count: number, _genderLabel: string) =>
    `Hey ${name}! We miss you on MeetMatch. Come back and find your next match! 💘`,
  (name: string, count: number, genderLabel: string) =>
    count > 0
      ? `${count} ${genderLabel} nearby are waiting to meet you! Want to see them? 💕`
      : `Someone special might be waiting for you, ${name}! Come back and find out! ✨`,
  (name: string, count: number, genderLabel: string) =>
    count > 0
      ? `🔥 ${count} new ${genderLabel} joined MeetMatch near you. Don't miss out!`
      : `New people joined MeetMatch since you were last here. Don't miss out! 🔥`,
  (name: string, _count: number, _genderLabel: string) =>
    `Your perfect match could be just one swipe away, ${name}! Come back and find out! ✨`,
  (name: string, _count: number, _genderLabel: string) =>
    `It's been a while, ${name}! Ready to find someone special today? 💑`,
  (name: string, count: number, genderLabel: string) =>
    count > 0
      ? `💘 ${count} ${genderLabel} in your area haven't met you yet. Let's fix that!`
      : `💘 People in your area haven't met you yet. Let's fix that!`,
];

function pickVariant(index?: number): (name: string, count: number, genderLabel: string) => string {
  const idx = index ?? Math.floor(Math.random() * MESSAGE_VARIANTS.length);
  return MESSAGE_VARIANTS[idx % MESSAGE_VARIANTS.length];
}

function getOppositeGenderLabel(gender: string | null): string {
  const g = (gender ?? '').toLowerCase();
  if (g === 'male') return 'women';
  if (g === 'female') return 'men';
  return 'people';
}

async function countNearbyUsers(
  db: D1Database,
  userId: string,
  gender: string | null
): Promise<number> {
  try {
    const oppositeGender = getOppositeGenderLabel(gender) === 'women' ? 'female' : 'male';
    // Count active, profile-complete users of opposite gender (same city if available)
    const { results } = await db.prepare(
      `SELECT COUNT(*) as c FROM users
       WHERE id != ?
         AND is_active = 1
         AND is_profile_complete = 1
         AND gender = ?`
    ).bind(userId, oppositeGender).all();
    return Number((results?.[0] as Record<string, unknown> | undefined)?.c ?? 0);
  } catch {
    return 0;
  }
}

export async function runReengagementJob(env: Env): Promise<void> {
  console.log('[reengagement] Starting re-engagement job');

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - INACTIVE_DAYS_MIN);
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() - INACTIVE_DAYS_MAX);

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, first_name, gender, location FROM users
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

    const candidates = (results ?? []) as Array<Record<string, unknown>>;
    console.log(`[reengagement] Found ${candidates.length} candidates`);

    for (const user of candidates) {
      const userId = String(user.id);
      const firstName = String(user.first_name || 'there');
      const gender = user.gender ? String(user.gender) : null;

      try {
        const nearbyCount = await countNearbyUsers(env.DB, userId, gender);
        const genderLabel = getOppositeGenderLabel(gender);
        const variant = pickVariant();
        const message = variant(firstName, nearbyCount, genderLabel);

        const response = await env.API_SERVICE.fetch(new Request('http://api/notifications', {
          method: 'POST',
          body: JSON.stringify({
            userId,
            type: 'REENGAGEMENT',
            channel: 'TELEGRAM',
            payload: JSON.stringify({
              message,
              action: 'find_match',
            }),
          }),
          headers: { 'Content-Type': 'application/json' },
        }));

        if (response.ok) {
          await env.DB.prepare(
            'UPDATE users SET last_reminded_at = CURRENT_TIMESTAMP WHERE id = ?'
          ).bind(userId).run();
          console.log(`[reengagement] Sent to ${userId} (nearby=${nearbyCount})`);
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
