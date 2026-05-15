import type { MiddlewareFn } from "grammy";
import type { MyContext } from "../types.js";
import type { Env } from "../index.js";
import { ApiServiceClient } from "../services/api-client.js";
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-bot");

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
          const client = new ApiServiceClient(env.API_SERVICE);
          await client.updateLastActive({ userId });
        } catch (error) {
          log.error("activityTracker", "Failed to update last active", { userId }, error);
        }
      }
    }

    await next();
  };
}
