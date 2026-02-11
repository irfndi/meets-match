/**
 * Activity Tracker Middleware
 *
 * Updates the user's last_active timestamp on every bot interaction.
 * This is fire-and-forget - we don't block the request on this update.
 */
import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';

import { userService } from '../services/userService.js';
import type { MyContext } from '../types.js';

// Cache to store the last time a user's activity was updated
// Key: userId, Value: timestamp (ms)
// Exported for testing purposes only
export const lastActiveCache = new Map<string, number>();

// Update last_active at most once every 5 minutes per user
export const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000;

// Maximum number of users to track in memory to prevent leaks
export const MAX_CACHE_SIZE = 10000;

/**
 * Middleware that updates user's last_active timestamp on every interaction.
 *
 * This is a fire-and-forget operation - we don't wait for it to complete
 * and errors are silently ignored. This ensures activity tracking doesn't
 * slow down the bot or cause failures.
 *
 * Uses an in-memory cache to debounce updates (max once per 5 minutes per user)
 * to prevent database spamming.
 */
export const activityTrackerMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  // Only track activity for messages from users (not groups/channels)
  if (ctx.from?.id) {
    const userId = String(ctx.from.id);
    const now = Date.now();
    const lastUpdate = lastActiveCache.get(userId);

    // Only update if enough time has passed since the last update
    if (!lastUpdate || now - lastUpdate > DEBOUNCE_WINDOW_MS) {
      // Prevent memory leaks by clearing cache if it gets too big
      // A simple clear is sufficient as this is just an optimization cache
      if (lastActiveCache.size >= MAX_CACHE_SIZE) {
        lastActiveCache.clear();
      }

      lastActiveCache.set(userId, now);

      // Fire-and-forget: run in the background without waiting
      Effect.runPromise(
        userService.updateLastActive(userId).pipe(
          Effect.catchAll(() => Effect.void), // Silently ignore all errors
        ),
      ).catch(() => {
        // Ignore promise rejection (extra safety)
      });
    }
  }

  // Continue to next middleware/handler
  await next();
};
