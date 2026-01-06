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

    // Fire-and-forget: run in the background without waiting.
    // Effect.catchAll handles all Effect errors, converting them to void.
    // This ensures the promise never rejects.
    void Effect.runPromise(
      userService.updateLastActive(userId).pipe(
        Effect.catchAll(() => Effect.void), // Silently ignore all errors
      ),
    );
  }

  // Continue to next middleware/handler
  await next();
};
