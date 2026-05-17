import type { Env } from "../index.js";

const NOTIFICATION_TTL_SECONDS = 3 * 24 * 60 * 60; // 3 days
const LEGACY_NOTIFICATION_KEY_PREFIX = "notifications";

export interface LikeNotification {
  id: string;
  type: "like";
  fromUserId: string;
  fromDisplayName: string;
  timestamp: string;
  messageText?: string;
  mediaUrl?: string;
  fromMediaUrl?: string;
}

export interface GiftNotification {
  id: string;
  type: "gift";
  fromUserId: string;
  fromDisplayName: string;
  giftEmoji: string;
  giftName: string;
  timestamp: string;
}

export interface GiftPremiumNotification {
  id: string;
  type: "gift_premium";
  fromUserId: string;
  fromDisplayName: string;
  tier: string;
  timestamp: string;
}

export interface MutualMatchNotification {
  id: string;
  type: "mutual_match";
  matchId: string;
  otherUserId: string;
  otherDisplayName: string;
  otherUsername?: string;
  timestamp: string;
  otherMediaUrl?: string;
}

export type Notification =
  | LikeNotification
  | MutualMatchNotification
  | GiftNotification
  | GiftPremiumNotification;

function notificationKey(userId: string, notificationId: string): string {
  return `notifications:${userId}:${notificationId}`;
}

function listKey(userId: string): string {
  return `notifications:list:${userId}`;
}

function legacyKey(userId: string): string {
  return `${LEGACY_NOTIFICATION_KEY_PREFIX}:${userId}`;
}

function generateNotificationId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function addNotification(
  env: Env,
  userId: string,
  notification: Omit<LikeNotification, "id">,
): Promise<void>;
export function addNotification(
  env: Env,
  userId: string,
  notification: Omit<MutualMatchNotification, "id">,
): Promise<void>;
export function addNotification(
  env: Env,
  userId: string,
  notification: Omit<GiftNotification, "id">,
): Promise<void>;
export function addNotification(
  env: Env,
  userId: string,
  notification: Omit<GiftPremiumNotification, "id">,
): Promise<void>;
export async function addNotification(
  env: Env,
  userId: string,
  notification: Omit<Notification, "id">,
): Promise<void> {
  const id = generateNotificationId();
  const key = notificationKey(userId, id);
  const list = listKey(userId);

  // Write notification body and append id to list concurrently
  await Promise.all([
    env.KV.put(key, JSON.stringify({ ...notification, id }), {
      expirationTtl: NOTIFICATION_TTL_SECONDS,
    }),
    env.KV.put(
      list,
      JSON.stringify([...(await getNotificationIds(env, userId)), id]),
      {
        expirationTtl: NOTIFICATION_TTL_SECONDS,
      },
    ),
  ]);
}

async function getNotificationIds(env: Env, userId: string): Promise<string[]> {
  const list = listKey(userId);
  const value = await env.KV.get(list);
  if (value) {
    try {
      return JSON.parse(value) as string[];
    } catch (error) {
      console.error("Failed to parse notification list:", error);
      return [];
    }
  }

  // Backward compatibility: migrate from legacy single-key storage
  const legacyValue = await env.KV.get(legacyKey(userId));
  if (!legacyValue) return [];

  try {
    const parsed = JSON.parse(legacyValue) as unknown;
    if (!Array.isArray(parsed)) return [];

    const ids: string[] = [];
    const writes: Promise<unknown>[] = [];

    for (const item of parsed) {
      const id = generateNotificationId();
      ids.push(id);
      writes.push(
        env.KV.put(notificationKey(userId, id), JSON.stringify({ ...item, id }), {
          expirationTtl: NOTIFICATION_TTL_SECONDS,
        }),
      );
    }

    writes.push(
      env.KV.put(list, JSON.stringify(ids), {
        expirationTtl: NOTIFICATION_TTL_SECONDS,
      }),
    );
    writes.push(env.KV.delete(legacyKey(userId)));

    await Promise.all(writes);
    return ids;
  } catch (error) {
    console.error("Failed to migrate legacy notifications:", error);
    return [];
  }
}

export async function getNotifications(
  env: Env,
  userId: string,
): Promise<Notification[]> {
  const ids = await getNotificationIds(env, userId);
  if (ids.length === 0) return [];

  const results = await Promise.all(
    ids.map(async (id) => {
      const value = await env.KV.get(notificationKey(userId, id));
      if (!value) return null;
      try {
        return JSON.parse(value) as Notification;
      } catch (error) {
        console.error("Failed to parse notification:", error);
        return null;
      }
    }),
  );

  return results.filter((n): n is Notification => n !== null);
}

export async function clearNotifications(
  env: Env,
  userId: string,
): Promise<void> {
  const ids = await getNotificationIds(env, userId);
  await Promise.all([
    ...ids.map((id) => env.KV.delete(notificationKey(userId, id))),
    env.KV.delete(listKey(userId)),
  ]);
}

export async function removeNotification(
  env: Env,
  userId: string,
  notificationId: string,
): Promise<void> {
  const ids = await getNotificationIds(env, userId);
  if (!ids.includes(notificationId)) return;

  const newIds = ids.filter((id) => id !== notificationId);

  await Promise.all([
    env.KV.delete(notificationKey(userId, notificationId)),
    env.KV.put(listKey(userId), JSON.stringify(newIds), {
      expirationTtl: NOTIFICATION_TTL_SECONDS,
    }),
  ]);
}
