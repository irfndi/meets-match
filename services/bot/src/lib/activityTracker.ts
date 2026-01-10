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

// Cache for last active timestamp
const lastActiveCache = new Map<string, number>();
const UPDATE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 10000;

// Reset cache for testing
export const _resetCache = () => lastActiveCache.clear();

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
    const lastUpdate = lastActiveCache.get(userId);

    // Simple cache eviction strategy: clear if too big
    if (lastActiveCache.size > MAX_CACHE_SIZE) {
      lastActiveCache.clear();
    }

    // Only update if never updated or interval has passed
    if (!lastUpdate || now - lastUpdate > UPDATE_INTERVAL_MS) {
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
