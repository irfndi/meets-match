import { ApiRouter } from "./http/router.js";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const router = new ApiRouter(env);
    return router.route(request);
  },
};

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  NOTIFICATION_QUEUE: Queue;
  MEDIA_BUCKET: R2Bucket;
  /**
   * Shared secret required via the `x-api-secret` header on all routes except
   * `/health`. Set via `wrangler secret put API_SECRET` in production. When
   * unset (local dev / tests), requests are allowed through so unmodified
   * service-binding callers keep working.
   */
  API_SECRET?: string;
}
