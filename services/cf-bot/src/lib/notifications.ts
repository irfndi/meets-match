import type { Env } from "../index.js";

const NOTIFICATION_TTL_SECONDS = 3 * 24 * 60 * 60; // 3 days

export interface LikeNotification {
  type: "like";
  fromUserId: string;
  fromDisplayName: string;
  timestamp: string;
  messageText?: string;
  mediaUrl?: string;
  fromMediaUrl?: string;
}

export interface GiftNotification {
  type: "gift";
  fromUserId: string;
  fromDisplayName: string;
  giftEmoji: string;
  giftName: string;
  timestamp: string;
}

export interface GiftPremiumNotification {
  type: "gift_premium";
  fromUserId: string;
  fromDisplayName: string;
  tier: string;
  timestamp: string;
}

export interface MutualMatchNotification {
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

function generateNotificationId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export async function addNotification(
  env: Env,
  userId: string,
  notification: Notification,
): Promise<void> {
  const id = generateNotificationId();
  const key = notificationKey(userId, id);
  const list = listKey(userId);

  // Write notification body and append id to list concurrently
  await Promise.all([
    env.KV.put(key, JSON.stringify(notification), {
      expirationTtl: NOTIFICATION_TTL_SECONDS,
    }),
    env.KV.put(list, JSON.stringify([...(await getNotificationIds(env, userId)), id]), {
      expirationTtl: NOTIFICATION_TTL_SECONDS,
    }),
  ]);
}

async function getNotificationIds(env: Env, userId: string): Promise<string[]> {
  const value = await env.KV.get(listKey(userId));
  if (!value) return [];
  try {
    return JSON.parse(value) as string[];
  } catch (error) {
    console.error("Failed to parse notification list:", error);
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
  index: number,
): Promise<void> {
  const ids = await getNotificationIds(env, userId);
  if (index < 0 || index >= ids.length) return;

  const removedId = ids[index];
  const newIds = ids.filter((_, i) => i !== index);

  await Promise.all([
    env.KV.delete(notificationKey(userId, removedId)),
    env.KV.put(listKey(userId), JSON.stringify(newIds), {
      expirationTtl: NOTIFICATION_TTL_SECONDS,
    }),
  ]);
}
