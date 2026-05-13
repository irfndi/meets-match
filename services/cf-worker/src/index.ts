export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return new Response(JSON.stringify({ status: "ok", service: "cf-worker" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  },

  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      console.log(`Processing queue message: ${message.id}`);
      message.ack();
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`Scheduled event: ${event.cron}`);
  }
};

interface Env {
  DB: D1Database;
  KV: KVNamespace;
  API_SERVICE: Fetcher;
  BOT_SERVICE: Fetcher;
}
