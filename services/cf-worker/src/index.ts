import { runReengagementJob } from "./jobs/reengagement.js";
import { runDLQHealthCheck } from "./jobs/dlqHealth.js";
import { runBirthdayJob } from "./jobs/birthday.js";
import { runCleanupJob } from "./jobs/cleanup.js";
import { runSubscriptionExpiryJob } from "./jobs/subscriptionExpiry.js";
import { runIncompleteProfileReengagementJob } from "./jobs/incompleteProfileReengagement.js";
import { runDailyActiveStatesJob } from "./jobs/dailyActiveStates.js";
import { NotificationQueueConsumer } from "./notifications/queue.js";
import { getVersionInfo } from "./lib/version.js";

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  NOTIFICATION_QUEUE: Queue;
  API_SERVICE: Fetcher;
  BOT_SERVICE: Fetcher;
  REENGAGEMENT_SCHEDULE?: string;
  DLQ_PROCESSOR_SCHEDULE?: string;
  BIRTHDAY_SCHEDULE?: string;
  CLEANUP_SCHEDULE?: string;
  SUBSCRIPTION_EXPIRY_SCHEDULE?: string;
  INCOMPLETE_PROFILE_SCHEDULE?: string;
  DAILY_ACTIVE_STATES_SCHEDULE?: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "cf-worker",
        version: getVersionInfo(),
      }),
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
    const isDLQ = batch.queue.startsWith("dlq");
    if (isDLQ) {
      // DLQ messages: just mark them in DB and ack; no further delivery attempts.
      for (const message of batch.messages) {
        try {
          const body = JSON.parse(message.body as string) as Record<
            string,
            unknown
          >;
          const notificationId = String(body.notificationId);
          await processDLQMessage(env, notificationId, message);
        } catch (error) {
          console.error("[queue] Failed to process DLQ message:", error);
          message.ack();
        }
      }
      return;
    }
    const consumer = new NotificationQueueConsumer(env.DB, env.BOT_SERVICE);
    await consumer.processBatch(batch);
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
    const subscriptionExpirySchedule =
      env.SUBSCRIPTION_EXPIRY_SCHEDULE || "0 0 * * *";
    const incompleteProfileSchedule =
      env.INCOMPLETE_PROFILE_SCHEDULE || "0 12 * * *";
    const dailyActiveStatesSchedule =
      env.DAILY_ACTIVE_STATES_SCHEDULE || "0 8 * * *";

    if (event.cron === reengagementSchedule) {
      await runReengagementJob(env);
    } else if (event.cron === dlqSchedule) {
      await runDLQHealthCheck(env);
    } else if (event.cron === birthdaySchedule) {
      await runBirthdayJob(env);
    } else if (event.cron === cleanupSchedule) {
      await runCleanupJob(env);
    } else if (event.cron === subscriptionExpirySchedule) {
      await runSubscriptionExpiryJob(env);
    } else if (event.cron === incompleteProfileSchedule) {
      await runIncompleteProfileReengagementJob(env);
    } else if (event.cron === dailyActiveStatesSchedule) {
      await runDailyActiveStatesJob(env);
    } else {
      console.log(`[scheduled] Unknown cron: ${event.cron}`);
    }
  },
};

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
