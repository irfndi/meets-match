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

// In-memory cache to throttle last_active updates
// Key: userId, Value: timestamp of last update
const lastActiveCache = new Map<string, number>();

const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 10000; // Limit memory usage to prevent leaks

/**
 * Middleware that updates user's last_active timestamp on every interaction.
 *
 * This is a fire-and-forget operation - we don't wait for it to complete
 * and errors are silently ignored. This ensures activity tracking doesn't
 * slow down the bot or cause failures.
 *
 * OPTIMIZATION: Debounced to update at most once every 5 minutes per user.
 */
export const activityTrackerMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  // Only track activity for messages from users (not groups/channels)
  if (ctx.from?.id) {
    const userId = String(ctx.from.id);
    const now = Date.now();
    const lastUpdate = lastActiveCache.get(userId);

    // Update if never updated or debounce window passed
    if (!lastUpdate || now - lastUpdate > DEBOUNCE_WINDOW_MS) {
      // Fire-and-forget: run in the background without waiting
      Effect.runPromise(
        userService.updateLastActive(userId).pipe(
          Effect.catchAll(() => Effect.void), // Silently ignore all errors
        ),
      ).catch(() => {
        // Ignore promise rejection (extra safety)
      });

      // Update cache
      // Delete first to refresh insertion order (LRU behavior)
      if (lastUpdate) {
        lastActiveCache.delete(userId);
      }
      lastActiveCache.set(userId, now);

      // Prune cache if it grows too large (simple LRU eviction)
      if (lastActiveCache.size > MAX_CACHE_SIZE) {
        const oldestKey = lastActiveCache.keys().next().value;
        if (oldestKey) {
          lastActiveCache.delete(oldestKey);
        }
      }
    }
  }

  // Continue to next middleware/handler
  await next();
};
