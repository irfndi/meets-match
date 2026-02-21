/**
 * Activity Tracker Middleware
 *
 * Updates the user's last_active timestamp on bot interactions.
 * This is fire-and-forget - we don't block the request on this update.
 */
import { Effect } from 'effect';
import type { MiddlewareFn } from 'grammy';

import { userService } from '../services/userService.js';
import type { MyContext } from '../types.js';

// Cache to debounce last_active updates
// Exported for testing purposes
export const lastActiveCache = new Map<string, number>();

// Constants for cache management
export const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_CACHE_SIZE = 10000;

/**
 * Middleware that updates user's last_active timestamp on interactions.
 *
 * This uses an in-memory cache to debounce updates. Users are only updated
 * once every DEBOUNCE_WINDOW_MS to reduce database load.
 *
 * This is a fire-and-forget operation - we don't wait for it to complete
 * and errors are silently ignored.
 */
export const activityTrackerMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  // Only track activity for messages from users (not groups/channels)
  if (ctx.from?.id) {
    const userId = String(ctx.from.id);
    const now = Date.now();
    const lastActive = lastActiveCache.get(userId);

    // If not in cache or updated longer than debounce window ago
    if (lastActive === undefined || now - lastActive >= DEBOUNCE_WINDOW_MS) {
      // Prevent cache from growing indefinitely
      // Only clear if adding a new user and cache is full
      if (lastActive === undefined && lastActiveCache.size >= MAX_CACHE_SIZE) {
        lastActiveCache.clear();
      }

      // Update local cache
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
