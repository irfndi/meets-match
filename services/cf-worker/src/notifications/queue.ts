import { Cause, Effect, Exit } from "effect";
import type { Queue, Fetcher } from "@cloudflare/workers-types";
import { createLogger } from "@meetsmatch/cf-shared";

const log = createLogger("cf-worker.queue-consumer");

export interface NotificationMessage {
  notificationId: string;
  userId: string;
  type: string;
  payload?: string;
}

export class NotificationQueueProducer {
  constructor(private readonly queue: Queue) {}

  enqueue(message: NotificationMessage): Effect.Effect<void, Error, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.queue.send(JSON.stringify(message));
      },
      catch: (error) =>
        error instanceof Error ? error : new Error(String(error)),
    });
  }
}

type Db = D1Database;

const dbRun = (
  db: Db,
  sql: string,
  ...params: unknown[]
): Effect.Effect<void, Error, never> =>
  Effect.tryPromise({
    try: async () => {
      await db
        .prepare(sql)
        .bind(...params)
        .run();
    },
    catch: (error) =>
      new Error(`${sql.split("\n")[0]?.trim() ?? "sql"}: ${String(error)}`),
  });

/** Like dbRun but returns `meta.changes` so the caller can gate on a successful
 *  atomic claim (e.g. `WHERE status IN (...)` for "pending" / "failed" rows). */
const dbRunWithChanges = (
  db: Db,
  sql: string,
  ...params: unknown[]
): Effect.Effect<{ changes: number }, Error, never> =>
  Effect.tryPromise({
    try: async () => {
      const result = await db
        .prepare(sql)
        .bind(...params)
        .run<{ changes: number }>();
      return { changes: Number(result.meta?.changes ?? 0) };
    },
    catch: (error) =>
      new Error(`${sql.split("\n")[0]?.trim() ?? "sql"}: ${String(error)}`),
  });

const dbFirst = <T = Record<string, unknown>>(
  db: Db,
  sql: string,
  ...params: unknown[]
): Effect.Effect<T | null, Error, never> =>
  Effect.tryPromise({
    try: async () => {
      const row = await db
        .prepare(sql)
        .bind(...params)
        .first<T>();
      return row ?? null;
    },
    catch: (error) =>
      new Error(`${sql.split("\n")[0]?.trim() ?? "sql"}: ${String(error)}`),
  });

const ack = (message: Message): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    message.ack();
  });

const retry = (message: Message): Effect.Effect<void, never, never> =>
  Effect.sync(() => {
    message.retry();
  });

export function persistAndEnqueue(
  db: D1Database,
  producer: NotificationQueueProducer,
  message: NotificationMessage,
): Effect.Effect<void, Error, never> {
  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () =>
        db
          .prepare(
            `INSERT INTO notifications (id, user_id, type, channel, payload, status, priority, attempt_count, max_attempts, created_at)
             VALUES (?, ?, ?, ?, ?, 'pending', 0, 0, 5, CURRENT_TIMESTAMP)`,
          )
          .bind(
            message.notificationId,
            message.userId,
            message.type,
            "TELEGRAM",
            message.payload ?? "{}",
          )
          .run(),
      catch: (error) => new Error(`persistNotification: ${String(error)}`),
    });

    // If enqueue fails the persisted row would be orphaned (status='pending'
    // forever with no queue message left to drive delivery). Compensate by
    // deleting the row so a future enqueue can recreate it cleanly.
    const enqueueResult = yield* producer.enqueue(message).pipe(Effect.either);

    if (enqueueResult._tag === "Left") {
      yield* Effect.tryPromise({
        try: () =>
          db
            .prepare("DELETE FROM notifications WHERE id = ?")
            .bind(message.notificationId)
            .run(),
        catch: (error) =>
          new Error(`rollbackPersistedNotification: ${String(error)}`),
      }).pipe(
        Effect.tapError((err) =>
          Effect.sync(() =>
            log.error(
              "persistAndEnqueue",
              `Failed to rollback orphaned notification ${message.notificationId}`,
              { userId: message.userId },
              err,
            ),
          ),
        ),
        Effect.orElse(() => Effect.void),
      );
      return yield* Effect.fail(enqueueResult.left);
    }
  });
}

export class NotificationQueueConsumer {
  constructor(
    private readonly db: Db,
    private readonly botService: Fetcher,
  ) {}

  async processBatch(batch: MessageBatch): Promise<void> {
    for (const message of batch.messages) {
      const exit = await Effect.runPromiseExit(this.processOne(message));
      if (Exit.isSuccess(exit)) continue;
      const failure = Cause.failureOption(exit.cause);
      const detail =
        failure._tag === "Some" ? String(failure.value) : String(exit.cause);
      log.error("processBatch", `defect processing message: ${detail}`);
      message.retry();
    }
  }

  private processOne(message: Message): Effect.Effect<void, Error, never> {
    const db = this.db;
    const botService = this.botService;
    return Effect.gen(function* () {
      const raw = typeof message.body === "string" ? message.body : "{}";
      let body: NotificationMessage;
      try {
        body = JSON.parse(raw) as NotificationMessage;
      } catch {
        log.warn("processOne", "Invalid JSON in message body, discarding");
        return yield* ack(message);
      }
      const notificationId = String(body.notificationId);

      const notification = yield* dbFirst<Record<string, unknown>>(
        db,
        "SELECT * FROM notifications WHERE id = ?",
        notificationId,
      );

      if (!notification) {
        log.warn("processOne", `Notification ${notificationId} not found`);
        return yield* ack(message);
      }

      const status = String(notification.status);
      if (status === "delivered" || status === "dlq") {
        return yield* ack(message);
      }

      const result = yield* Effect.either(
        deliverOrMarkFailed(db, botService, body, notificationId),
      );

      if (result._tag === "Right") {
        return yield* ack(message);
      }

      log.error(
        "processOne",
        `delivery failed for ${notificationId}: ${result.left.message}`,
      );
      return yield* retry(message);
    });
  }
}

function deliverOrMarkFailed(
  db: Db,
  botService: Fetcher,
  body: NotificationMessage,
  notificationId: string,
): Effect.Effect<void, Error, never> {
  return Effect.gen(function* () {
    // Atomic claim: only one consumer can transition a row from a retryable
    // status ('pending' or 'failed') into 'processing'. Any concurrent
    // consumer sees zero rows affected and bails out.
    const claim = yield* dbRunWithChanges(
      db,
      "UPDATE notifications SET status = 'processing', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('pending', 'failed')",
      notificationId,
    );

    if (claim.changes === 0) {
      // Another consumer has already claimed this row, or it's no longer in a
      // retryable state. Acknowledge the duplicate delivery so it isn't retried.
      log.info(
        "deliverOrMarkFailed",
        `Skipping ${notificationId} — already claimed by another consumer`,
      );
      return;
    }

    const startTime = Date.now();
    const response = yield* Effect.tryPromise({
      try: () =>
        botService.fetch(
          new Request("http://bot/send-notification", {
            method: "POST",
            body: JSON.stringify({
              userId: body.userId,
              type: body.type,
              payload: body.payload,
            }),
            headers: { "Content-Type": "application/json" },
          }),
        ),
      catch: (error) => new Error(String(error)),
    });

    const durationMs = Date.now() - startTime;
    const errorText: string | null = response.ok
      ? null
      : yield* Effect.tryPromise({
          try: () => response.text(),
          catch: (e) => new Error(String(e)),
        });

    if (response.ok) {
      yield* Effect.all(
        [
          dbRun(
            db,
            "UPDATE notifications SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP WHERE id = ?",
            notificationId,
          ),
          dbRun(
            db,
            `INSERT INTO notification_delivery_attempts (notification_id, status, duration_ms)
             VALUES (?, 'success', ?)`,
            notificationId,
            durationMs,
          ),
        ],
        { concurrency: "unbounded" },
      );
      log.info(
        "deliverOrMarkFailed",
        `Delivered ${notificationId} in ${durationMs}ms`,
      );
      return;
    }

    if (response.status === 410) {
      // Terminal: 'dlq' (not 'failed') so processOne's delivered|dlq short-circuit
      // stops redelivery on subsequent redeliveries of the same message.
      yield* Effect.all(
        [
          dbRun(
            db,
            "UPDATE notifications SET status = 'dlq', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            errorText ?? "permanent failure",
            notificationId,
          ),
          dbRun(
            db,
            `INSERT INTO notification_delivery_attempts (notification_id, status, error_message, duration_ms)
             VALUES (?, 'dlq', ?, ?)`,
            notificationId,
            errorText ?? "permanent failure",
            durationMs,
          ),
        ],
        { concurrency: "unbounded" },
      );
      log.warn(
        "deliverOrMarkFailed",
        `Permanent failure ${notificationId}: ${errorText ?? ""}`,
      );
      return;
    }

    // Transient failure: mark failed and bubble up so the caller retries.
    yield* Effect.all(
      [
        dbRun(
          db,
          "UPDATE notifications SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          errorText ?? "transient failure",
          notificationId,
        ),
        dbRun(
          db,
          `INSERT INTO notification_delivery_attempts (notification_id, status, error_message, duration_ms)
           VALUES (?, 'failed', ?, ?)`,
          notificationId,
          errorText ?? "transient failure",
          durationMs,
        ),
      ],
      { concurrency: "unbounded" },
    );
    log.error(
      "deliverOrMarkFailed",
      `Failed ${notificationId}: ${errorText ?? "unknown"}`,
    );
    return yield* Effect.fail(
      new Error(errorText ?? `bot returned ${response.status}`),
    );
  });
}
