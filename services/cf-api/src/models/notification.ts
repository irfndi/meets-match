import { Effect } from "effect";
import type { D1Database, Queue } from "@cloudflare/workers-types";
import {
  Notification,
  NotificationStatus,
  type EnqueueNotificationRequest,
  type GetNotificationRequest,
  type GetQueueStatsRequest,
  type GetQueueStatsResponse,
  type GetDLQStatsRequest,
  type GetDLQStatsResponse,
  type ReplayDLQRequest,
  type ReplayDLQResponse,
  type LogNotificationResultRequest,
} from "@meetsmatch/cf-shared";
import { NotFoundError, DatabaseError } from "@meetsmatch/cf-shared";

export class NotificationRepository {
  constructor(private readonly db: D1Database) {}

  create(req: EnqueueNotificationRequest): Effect.Effect<typeof Notification.Type, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const id = crypto.randomUUID();
        await this.db.prepare(
          `INSERT INTO notifications (id, user_id, type, channel, payload, status, priority, attempt_count, max_attempts, created_at, scheduled_at)
           VALUES (?, ?, ?, ?, ?, 'pending', 0, 0, 5, CURRENT_TIMESTAMP, ?)`
        ).bind(id, req.userId, req.type, req.channel ?? "TELEGRAM", JSON.stringify(req.payload ?? {}), req.scheduledAt ?? null).run();
        return {
          id,
          userId: req.userId,
          type: req.type,
          channel: req.channel,
          status: "PENDING" as typeof NotificationStatus.Type,
          payload: req.payload,
          retryCount: 0,
          maxRetries: 5,
          createdAt: new Date().toISOString(),
        } as typeof Notification.Type;
      },
      catch: (error) => new DatabaseError("create", error),
    });
  }

  getById(req: GetNotificationRequest): Effect.Effect<typeof Notification.Type, NotFoundError | DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db.prepare("SELECT * FROM notifications WHERE id = ?").bind(req.notificationId).first();
        if (!result) throw new NotFoundError("Notification", req.notificationId);
        return this.toNotification(result);
      },
      catch: (error) => (error instanceof NotFoundError ? error : new DatabaseError("getById", error)),
    });
  }

  markDelivered(id: string): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db.prepare("UPDATE notifications SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
        return true;
      },
      catch: (error) => new DatabaseError("markDelivered", error),
    });
  }

  markFailed(id: string, errorMessage: string): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db.prepare("UPDATE notifications SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(errorMessage, id).run();
        return true;
      },
      catch: (error) => new DatabaseError("markFailed", error),
    });
  }

  moveToDLQ(id: string): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db.prepare("UPDATE notifications SET status = 'dlq', dlq_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
        return true;
      },
      catch: (error) => new DatabaseError("moveToDLQ", error),
    });
  }

  getQueueStats(): Effect.Effect<typeof GetQueueStatsResponse.Type, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const pending = await this.db.prepare("SELECT COUNT(*) as c FROM notifications WHERE status = 'pending'").first();
        const processing = await this.db.prepare("SELECT COUNT(*) as c FROM notifications WHERE status = 'processing'").first();
        const delivered = await this.db.prepare("SELECT COUNT(*) as c FROM notifications WHERE status = 'delivered'").first();
        const failed = await this.db.prepare("SELECT COUNT(*) as c FROM notifications WHERE status = 'failed'").first();
        const dlq = await this.db.prepare("SELECT COUNT(*) as c FROM notifications WHERE status = 'dlq'").first();
        return {
          pendingCount: Number((pending as Record<string, unknown>).c ?? 0),
          processingCount: Number((processing as Record<string, unknown>).c ?? 0),
          deliveredCount: Number((delivered as Record<string, unknown>).c ?? 0),
          failedCount: Number((failed as Record<string, unknown>).c ?? 0),
          dlqCount: Number((dlq as Record<string, unknown>).c ?? 0),
        };
      },
      catch: (error) => new DatabaseError("getQueueStats", error),
    });
  }

  getDLQStats(): Effect.Effect<typeof GetDLQStatsResponse.Type, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db.prepare("SELECT COUNT(*) as c FROM notifications WHERE status = 'dlq'").first();
        return { totalMessages: Number((result as Record<string, unknown>).c ?? 0) };
      },
      catch: (error) => new DatabaseError("getDLQStats", error),
    });
  }

  replayDLQ(req: ReplayDLQRequest): Effect.Effect<number, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const limit = req.limit ?? 100;
        const { results } = await this.db.prepare("SELECT id FROM notifications WHERE status = 'dlq' LIMIT ?").bind(String(limit)).all();
        const ids = (results ?? []).map((r) => String((r as Record<string, unknown>).id));
        for (const id of ids) {
          await this.db.prepare("UPDATE notifications SET status = 'pending', dlq_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
        }
        return ids.length;
      },
      catch: (error) => new DatabaseError("replayDLQ", error),
    });
  }

  createAttempt(notificationId: string, status: string, errorMessage?: string, errorCode?: string, durationMs?: number): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db.prepare(
          `INSERT INTO notification_delivery_attempts (notification_id, status, error_message, error_code, duration_ms)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(
          notificationId,
          status,
          errorMessage ?? null,
          errorCode ?? null,
          durationMs ?? null
        ).run();
        return true;
      },
      catch: (error) => new DatabaseError("createAttempt", error),
    });
  }

  private toNotification(row: Record<string, unknown>): typeof Notification.Type {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      type: String(row.type) as typeof Notification.Type,
      channel: row.channel ? String(row.channel) as typeof Notification.Type : undefined,
      status: String(row.status).toUpperCase() as typeof NotificationStatus.Type,
      payload: row.payload ? String(row.payload) : undefined,
      retryCount: row.attempt_count ? Number(row.attempt_count) : 0,
      maxRetries: row.max_attempts ? Number(row.max_attempts) : 5,
      createdAt: row.created_at ? String(row.created_at) : undefined,
      scheduledAt: row.scheduled_at ? String(row.scheduled_at) : undefined,
      deliveredAt: row.delivered_at ? String(row.delivered_at) : undefined,
      failedAt: row.failed_at ? String(row.failed_at) : undefined,
      errorMessage: row.last_error ? String(row.last_error) : undefined,
    };
  }
}
