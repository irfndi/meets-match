import type { Env } from "../index.js";

const DLQ_ALERT_THRESHOLD = 100;

export async function runDLQHealthCheck(env: Env): Promise<void> {
  console.log("[dlq-health] Starting DLQ health check");

  try {
    const result = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM notifications WHERE status = 'dlq'`,
    ).first();

    const dlqCount = Number((result as Record<string, unknown>).c ?? 0);
    console.log(`[dlq-health] DLQ count: ${dlqCount}`);

    if (dlqCount > DLQ_ALERT_THRESHOLD) {
      console.error(
        `[dlq-health] ALERT: DLQ has ${dlqCount} messages (threshold: ${DLQ_ALERT_THRESHOLD})`,
      );
    }

    const expiredResult = await env.DB.prepare(
      `SELECT COUNT(*) as c FROM notifications
       WHERE status = 'dlq'
       AND dlq_at <= datetime('now', '-7 days')`,
    ).first();

    const expiredCount = Number(
      (expiredResult as Record<string, unknown>).c ?? 0,
    );
    if (expiredCount > 0) {
      console.log(
        `[dlq-health] ${expiredCount} expired DLQ messages (>7 days)`,
      );
    }

    console.log("[dlq-health] Check complete");
  } catch (error) {
    console.error("[dlq-health] Check failed:", error);
    throw error;
  }
}
