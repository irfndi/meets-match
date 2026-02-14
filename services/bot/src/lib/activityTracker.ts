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

// Cache to store last active timestamps (userId -> timestamp)
// Exported for testing purposes
export const lastActiveCache = new Map<string, number>();

// Constants for caching behavior
export const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_CACHE_SIZE = 10000;

/**
 * Middleware that updates user's last_active timestamp on every interaction.
 *
 * This is a fire-and-forget operation - we don't wait for it to complete
 * and errors are silently ignored. This ensures activity tracking doesn't
 * slow down the bot or cause failures.
 */
export const activityTrackerMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  // Only track activity for messages from users (not groups/channels)
  if (ctx.from?.id) {
    const userId = String(ctx.from.id);
    const now = Date.now();
    const lastActive = lastActiveCache.get(userId);

    // Debounce: Only update if cache entry is missing or older than DEBOUNCE_WINDOW_MS
    if (lastActive === undefined || now - lastActive > DEBOUNCE_WINDOW_MS) {
      // Refresh or add entry (delete first to ensure it moves to the end of the Map)
      lastActiveCache.delete(userId);
      lastActiveCache.set(userId, now);

      // Simple cache eviction if size exceeds limit
      if (lastActiveCache.size > MAX_CACHE_SIZE) {
        // Remove the oldest entry (first inserted)
        const oldestKey = lastActiveCache.keys().next().value;
        if (oldestKey !== undefined) {
          lastActiveCache.delete(oldestKey);
        }
      }

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
