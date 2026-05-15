import { runReengagementJob } from "./jobs/reengagement.js";
import { runDLQHealthCheck } from "./jobs/dlqHealth.js";
import { runBirthdayJob } from "./jobs/birthday.js";
import { runCleanupJob } from "./jobs/cleanup.js";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  API_SERVICE: Fetcher;
  BOT_SERVICE: Fetcher;
  REENGAGEMENT_SCHEDULE?: string;
  DLQ_PROCESSOR_SCHEDULE?: string;
  BIRTHDAY_SCHEDULE?: string;
  CLEANUP_SCHEDULE?: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return new Response(
      JSON.stringify({ status: "ok", service: "cf-worker" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  },

  async queue(
    batch: MessageBatch,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const isDLQ = batch.queue.endsWith("-dlq");

    for (const message of batch.messages) {
      try {
        const body = JSON.parse(message.body as string) as Record<
          string,
          unknown
        >;
        const notificationId = String(body.notificationId);

        const notification = await env.DB.prepare(
          "SELECT * FROM notifications WHERE id = ?",
        )
          .bind(notificationId)
          .first();

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

        if (isDLQ) {
          await processDLQMessage(env, notificationId, message);
        } else {
          await processNotificationMessage(env, body, notificationId, message);
        }
      } catch (error) {
        console.error("[queue] Failed to process message:", error);
        if (isDLQ) {
          message.ack();
        } else {
          message.retry();
        }
      }
    }
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const reengagementSchedule = env.REENGAGEMENT_SCHEDULE || "0 10 * * *";
    const dlqSchedule = env.DLQ_PROCESSOR_SCHEDULE || "*/5 * * * *";
    const birthdaySchedule = env.BIRTHDAY_SCHEDULE || "0 9 * * *";
    const cleanupSchedule = env.CLEANUP_SCHEDULE || "0 11 * * *";

    if (event.cron === reengagementSchedule) {
      await runReengagementJob(env);
    } else if (event.cron === dlqSchedule) {
      await runDLQHealthCheck(env);
    } else if (event.cron === birthdaySchedule) {
      await runBirthdayJob(env);
    } else if (event.cron === cleanupSchedule) {
      await runCleanupJob(env);
    } else {
      console.log(`[scheduled] Unknown cron: ${event.cron}`);
    }
  },
};

async function processNotificationMessage(
  env: Env,
  body: Record<string, unknown>,
  notificationId: string,
  message: Message,
): Promise<void> {
  const userId = String(body.userId);
  const type = String(body.type);
  const payload = body.payload ? String(body.payload) : undefined;

  await env.DB.prepare(
    "UPDATE notifications SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  )
    .bind(notificationId)
    .run();

  const startTime = Date.now();
  try {
    const response = await env.BOT_SERVICE.fetch(
      new Request("http://bot/send-notification", {
        method: "POST",
        body: JSON.stringify({ userId, type, payload }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    const durationMs = Date.now() - startTime;

    if (response.ok) {
      await env.DB.prepare(
        "UPDATE notifications SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
        .bind(notificationId)
        .run();
      await env.DB.prepare(
        `INSERT INTO notification_delivery_attempts (notification_id, status, duration_ms)
         VALUES (?, 'success', ?)`,
      )
        .bind(notificationId, durationMs)
        .run();
      console.log(`[queue] Delivered ${notificationId} in ${durationMs}ms`);
      message.ack();
    } else {
      const errorText = await response.text();
      await env.DB.prepare(
        "UPDATE notifications SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
        .bind(errorText, notificationId)
        .run();
      await env.DB.prepare(
        `INSERT INTO notification_delivery_attempts (notification_id, status, error_message, duration_ms)
         VALUES (?, 'failed', ?, ?)`,
      )
        .bind(notificationId, errorText, durationMs)
        .run();
      console.error(`[queue] Failed ${notificationId}: ${errorText}`);
      message.retry();
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(
      "UPDATE notifications SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
      .bind(errorMessage, notificationId)
      .run();
    await env.DB.prepare(
      `INSERT INTO notification_delivery_attempts (notification_id, status, error_message, duration_ms)
       VALUES (?, 'failed', ?, ?)`,
    )
      .bind(notificationId, errorMessage, durationMs)
      .run();
    console.error(`[queue] Error ${notificationId}:`, errorMessage);
    message.retry();
  }
}

async function processDLQMessage(
  env: Env,
  notificationId: string,
  message: Message,
): Promise<void> {
  const startTime = Date.now();

  await env.DB.prepare(
    "UPDATE notifications SET status = 'dlq', dlq_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
  )
    .bind(notificationId)
    .run();

  await env.DB.prepare(
    `INSERT INTO notification_delivery_attempts (notification_id, status, error_message, duration_ms)
     VALUES (?, 'failed', ?, ?)`,
  )
    .bind(
      notificationId,
      "Moved to DLQ after max retries",
      Date.now() - startTime,
    )
    .run();

  console.log(`[dlq] Moved notification ${notificationId} to DLQ`);
  message.ack();
}
