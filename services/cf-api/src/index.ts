import { ApiRouter } from "./http/router.js";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const router = new ApiRouter(env);
    return router.route(request);
  }
};

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  NOTIFICATION_QUEUE: Queue;
  MEDIA_BUCKET: R2Bucket;
}
