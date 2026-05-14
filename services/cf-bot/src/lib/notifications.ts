import type { Env } from '../index.js';

const NOTIFICATION_TTL_SECONDS = 3 * 24 * 60 * 60; // 3 days

export interface LikeNotification {
  type: 'like';
  fromUserId: string;
  fromDisplayName: string;
  timestamp: string;
}

export interface MutualMatchNotification {
  type: 'mutual_match';
  matchId: string;
  otherUserId: string;
  otherDisplayName: string;
  otherUsername?: string;
  timestamp: string;
}

export type Notification = LikeNotification | MutualMatchNotification;

export async function addNotification(env: Env, userId: string, notification: Notification): Promise<void> {
  const key = `notifications:${userId}`;
  const existing = await env.KV.get(key);
  const list: Notification[] = existing ? JSON.parse(existing) : [];
  list.push(notification);
  await env.KV.put(key, JSON.stringify(list), { expirationTtl: NOTIFICATION_TTL_SECONDS });
}

export async function getNotifications(env: Env, userId: string): Promise<Notification[]> {
  const key = `notifications:${userId}`;
  const value = await env.KV.get(key);
  return value ? JSON.parse(value) : [];
}

export async function clearNotifications(env: Env, userId: string): Promise<void> {
  await env.KV.delete(`notifications:${userId}`);
}

export async function removeNotification(env: Env, userId: string, index: number): Promise<void> {
  const key = `notifications:${userId}`;
  const value = await env.KV.get(key);
  if (!value) return;
  const list: Notification[] = JSON.parse(value);
  list.splice(index, 1);
  if (list.length === 0) {
    await env.KV.delete(key);
  } else {
    await env.KV.put(key, JSON.stringify(list), { expirationTtl: NOTIFICATION_TTL_SECONDS });
  }
}
