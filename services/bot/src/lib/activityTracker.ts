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

// Constants for debouncing
const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 10000;

// In-memory cache to store last active timestamp for each user
// Key: userId, Value: timestamp (ms)
const lastActiveCache = new Map<string, number>();

/**
 * Middleware that updates user's last_active timestamp on every interaction.
 *
 * This is a fire-and-forget operation - we don't wait for it to complete
 * and errors are silently ignored. This ensures activity tracking doesn't
 * slow down the bot or cause failures.
 *
 * OPTIMIZATION: Debounces updates to avoid slamming the database.
 * Updates are only sent if the last update was > 5 minutes ago.
 */
export const activityTrackerMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  // Only track activity for messages from users (not groups/channels)
  if (ctx.from?.id) {
    const userId = String(ctx.from.id);
    const now = Date.now();
    const lastUpdate = lastActiveCache.get(userId);

    // Debounce: if updated recently, skip
    if (lastUpdate && now - lastUpdate < DEBOUNCE_WINDOW_MS) {
      // Skip update
    } else {
      // Update cache
      lastActiveCache.set(userId, now);

      // Prune cache if too large (simple strategy: clear all)
      if (lastActiveCache.size > MAX_CACHE_SIZE) {
        lastActiveCache.clear();
        // Add back current user to avoid immediate re-update
        lastActiveCache.set(userId, now);
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
