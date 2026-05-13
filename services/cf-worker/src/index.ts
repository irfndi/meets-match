import { runReengagementJob } from './jobs/reengagement.js';
import { runDLQHealthCheck } from './jobs/dlqHealth.js';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  API_SERVICE: Fetcher;
  BOT_SERVICE: Fetcher;
  REENGAGEMENT_SCHEDULE?: string;
  DLQ_PROCESSOR_SCHEDULE?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return new Response(JSON.stringify({ status: "ok", service: "cf-worker" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  },

  async queue(batch: MessageBatch, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const message of batch.messages) {
      try {
        const body = JSON.parse(message.body as string) as Record<string, unknown>;
        const notificationId = String(body.notificationId);
        const userId = String(body.userId);
        const type = String(body.type);
        const payload = body.payload ? String(body.payload) : undefined;

        const notification = await env.DB.prepare(
          "SELECT * FROM notifications WHERE id = ?"
        ).bind(notificationId).first();

        if (!notification) {
          console.warn(`[queue] Notification ${notificationId} not found`);
          message.ack();
          continue;
        }

        const status = String((notification as Record<string, unknown>).status);
        if (status === "delivered" || status === "dlq") {
          message.ack();
          continue;
        }

        await env.DB.prepare(
          "UPDATE notifications SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).bind(notificationId).run();

        const startTime = Date.now();
        try {
          const response = await env.BOT_SERVICE.fetch(new Request("http://bot/send-notification", {
            method: "POST",
            body: JSON.stringify({ userId, type, payload }),
            headers: { "Content-Type": "application/json" },
          }));

          const durationMs = Date.now() - startTime;

          if (response.ok) {
            await env.DB.prepare(
              "UPDATE notifications SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = ?"
            ).bind(notificationId).run();
            await env.DB.prepare(
              `INSERT INTO notification_delivery_attempts (notification_id, status, duration_ms)
               VALUES (?, 'success', ?)`
            ).bind(notificationId, durationMs).run();
            console.log(`[queue] Delivered ${notificationId} in ${durationMs}ms`);
            message.ack();
          } else {
            const errorText = await response.text();
            await env.DB.prepare(
              "UPDATE notifications SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            ).bind(errorText, notificationId).run();
            await env.DB.prepare(
              `INSERT INTO notification_delivery_attempts (notification_id, status, error_message, duration_ms)
               VALUES (?, 'failed', ?, ?)`
            ).bind(notificationId, errorText, durationMs).run();
            console.error(`[queue] Failed ${notificationId}: ${errorText}`);
            message.retry();
          }
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : String(error);
          await env.DB.prepare(
            "UPDATE notifications SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
          ).bind(errorMessage, notificationId).run();
          await env.DB.prepare(
            `INSERT INTO notification_delivery_attempts (notification_id, status, error_message, duration_ms)
             VALUES (?, 'failed', ?, ?)`
          ).bind(notificationId, errorMessage, durationMs).run();
          console.error(`[queue] Error ${notificationId}:`, errorMessage);
          message.retry();
        }
      } catch (error) {
        console.error("[queue] Failed to process message:", error);
        message.retry();
      }
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const reengagementSchedule = env.REENGAGEMENT_SCHEDULE || "0 10 * * *";
    const dlqSchedule = env.DLQ_PROCESSOR_SCHEDULE || "*/5 * * * *";

    if (event.cron === reengagementSchedule) {
      await runReengagementJob(env);
    } else if (event.cron === dlqSchedule) {
      await runDLQHealthCheck(env);
    } else {
      console.log(`[scheduled] Unknown cron: ${event.cron}`);
    }
  }
};
