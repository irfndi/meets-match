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

// Cache to store last active timestamp for each user
// key: userId, value: timestamp (ms)
const lastActiveCache = new Map<string, number>();

// Update frequency (5 minutes)
const UPDATE_INTERVAL_MS = 5 * 60 * 1000;

// Max cache size to prevent memory leaks
const MAX_CACHE_SIZE = 10000;

/**
 * Middleware that updates user's last_active timestamp on every interaction.
 *
 * This is a fire-and-forget operation - we don't wait for it to complete
 * and errors are silently ignored. This ensures activity tracking doesn't
 * slow down the bot or cause failures.
 *
 * Uses an in-memory cache to debounce updates to reduce database load.
 */
export const activityTrackerMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  // Only track activity for messages from users (not groups/channels)
  if (ctx.from?.id) {
    const userId = String(ctx.from.id);
    const now = Date.now();
    const lastActive = lastActiveCache.get(userId);

    // Only update if never seen or older than interval
    if (!lastActive || now - lastActive > UPDATE_INTERVAL_MS) {
      // Memory cleanup: simple approach
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
