export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === "/health" || url.pathname === "/") {
      return new Response(JSON.stringify({ status: "ok", service: "cf-bot" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Telegram webhook endpoint
    if (url.pathname === "/webhook") {
      return new Response(JSON.stringify({ ok: true, service: "cf-bot" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
};

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}
