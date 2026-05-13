import type { MiddlewareFn } from 'grammy';
import type { MyContext } from '../types.js';
import type { Env } from '../index.js';

const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000;
const MAX_CACHE_SIZE = 10000;

export const lastActiveCache = new Map<string, number>();

export function activityTrackerMiddleware(env: Env): MiddlewareFn<MyContext> {
  return async (ctx, next) => {
    if (ctx.from?.id) {
      const userId = String(ctx.from.id);
      const now = Date.now();
      const lastUpdate = lastActiveCache.get(userId);

      if (!lastUpdate || now - lastUpdate > DEBOUNCE_WINDOW_MS) {
        if (lastActiveCache.size >= MAX_CACHE_SIZE) {
          lastActiveCache.clear();
        }
        lastActiveCache.set(userId, now);

        try {
          await env.API_SERVICE.fetch(new Request('http://api/users/' + userId + '/last-active', {
            method: 'POST',
          }));
        } catch {
        }
      }
    }

    await next();
  };
}
