import { Cause, Effect, Exit } from "effect";
import { describe, it, expect, vi } from "vitest";
import type { Queue, Fetcher, Message } from "@cloudflare/workers-types";
import {
  NotificationQueueProducer,
  NotificationQueueConsumer,
  persistAndEnqueue,
} from "../../notifications/queue.js";

interface MockD1Options {
  handler?: (
    sql: string,
    values: unknown[],
  ) => { results?: Array<Record<string, unknown>> };
  /** Return value for each `.run()` call. Defaults to `{ changes: 1 }`. */
  runResult?:
    | { changes: number }
    | ((sql: string, values: unknown[]) => { changes: number });
}

function createMockD1(options: MockD1Options = {}) {
  const handler =
    options.handler ??
    (() => ({ results: [] as Array<Record<string, unknown>> }));
  return {
    prepare: vi.fn((sql: string) => {
      return {
        bind: vi.fn((...values: unknown[]) => ({
          run: vi.fn(async () => {
            const changes =
              typeof options.runResult === "function"
                ? options.runResult(sql, values)
                : (options.runResult ?? { changes: 1 });
            return {
              success: true,
              meta: { changes: changes.changes, last_row_id: 0, duration: 0 },
            };
          }),
          first: vi.fn(async () => {
            const result = await handler(sql, values);
            return result.results?.[0] ?? null;
          }),
          all: vi.fn(async () => {
            const result = await handler(sql, values);
            return { results: result.results ?? [] };
          }),
        })),
      };
    }),
  } as unknown as import("@cloudflare/workers-types").D1Database;
}

async function runEffect<A, E>(effect: Effect.Effect<A, E, never>): Promise<A> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  const failure = Cause.failureOption(exit.cause);
  if (failure._tag === "Some") throw failure.value;
  throw new Error(String(exit.cause));
}

describe("NotificationQueueProducer", () => {
  it("enqueues a message", async () => {
    const queue = { send: vi.fn(async () => {}) } as unknown as Queue;
    const producer = new NotificationQueueProducer(queue);
    await runEffect(
      producer.enqueue({ notificationId: "n1", userId: "u1", type: "LIKE" }),
    );
    expect(queue.send).toHaveBeenCalledWith(
      JSON.stringify({ notificationId: "n1", userId: "u1", type: "LIKE" }),
    );
  });

  it("returns error on queue failure", async () => {
    const queue = {
      send: vi.fn(() => Promise.reject(new Error("queue full"))),
    } as unknown as Queue;
    const producer = new NotificationQueueProducer(queue);
    await expect(
      runEffect(
        producer.enqueue({ notificationId: "n1", userId: "u1", type: "LIKE" }),
      ),
    ).rejects.toThrow("queue full");
  });
});

describe("persistAndEnqueue", () => {
  it("inserts the row then enqueues when both succeed", async () => {
    const db = createMockD1();
    const queue = { send: vi.fn(async () => {}) } as unknown as Queue;
    const producer = new NotificationQueueProducer(queue);

    await runEffect(
      persistAndEnqueue(db, producer, {
        notificationId: "n1",
        userId: "u1",
        type: "LIKE",
      }),
    );

    expect(db.prepare).toHaveBeenCalled();
    expect(queue.send).toHaveBeenCalledTimes(1);
  });

  it("rolls back the persisted row when enqueue fails (no orphan)", async () => {
    const db = createMockD1();
    const queue = {
      send: vi.fn(() => Promise.reject(new Error("queue full"))),
    } as unknown as Queue;
    const producer = new NotificationQueueProducer(queue);

    await expect(
      runEffect(
        persistAndEnqueue(db, producer, {
          notificationId: "n1",
          userId: "u1",
          type: "LIKE",
        }),
      ),
    ).rejects.toThrow("queue full");

    const sqls = (db.prepare as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      (c[0] as string).trim().split(/\s+/)[0]?.toUpperCase(),
    );
    expect(sqls).toContain("INSERT");
    expect(sqls).toContain("DELETE");
  });
});

describe("NotificationQueueConsumer", () => {
  function createConsumer(
    dbRows: Array<Record<string, unknown>> = [],
    botResponse: { ok: boolean; text?: string } = { ok: true },
    runResult?:
      | { changes: number }
      | ((sql: string, values: unknown[]) => { changes: number }),
  ) {
    const db = createMockD1({
      handler: (sql) => {
        if (sql.includes("SELECT * FROM notifications WHERE id")) {
          return { results: dbRows };
        }
        return { results: [] };
      },
      runResult,
    });

    const bot = {
      fetch: vi.fn(async () => ({
        ok: botResponse.ok,
        text: async () => botResponse.text ?? "ok",
      })),
    } as unknown as Fetcher;

    return { consumer: new NotificationQueueConsumer(db, bot), db, bot };
  }

  function createMessage(body: Record<string, unknown>): Message {
    return {
      body: JSON.stringify(body),
      ack: vi.fn(),
      retry: vi.fn(),
    } as unknown as Message;
  }

  it("processes and acks a pending message", async () => {
    const { consumer, bot } = createConsumer([{ id: "n1", status: "pending" }]);
    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(bot.fetch).toHaveBeenCalledTimes(1);
    expect(msg.ack).toHaveBeenCalled();
  });

  it("skips already delivered notifications", async () => {
    const { consumer, bot } = createConsumer([
      { id: "n1", status: "delivered" },
    ]);
    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(bot.fetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("retries when bot service returns transient error (non-410)", async () => {
    const { consumer, bot } = createConsumer(
      [{ id: "n1", status: "pending" }],
      { ok: false, text: "bot error" },
    );
    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(bot.fetch).toHaveBeenCalledTimes(1);
    expect(msg.retry).toHaveBeenCalled();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it("acks and marks dlq when bot service returns 410 (permanent)", async () => {
    const botFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "chat not found" }), {
          status: 410,
        }),
    );
    const db = createMockD1({
      handler: (sql) => {
        if (sql.includes("SELECT * FROM notifications WHERE id")) {
          return { results: [{ id: "n1", status: "pending" }] };
        }
        return { results: [] };
      },
    });
    const consumer = new NotificationQueueConsumer(db, {
      fetch: botFetch,
    } as unknown as Fetcher);
    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(msg.ack).toHaveBeenCalled();
    expect(msg.retry).not.toHaveBeenCalled();

    // 410 must persist as terminal 'dlq' (not retryable 'failed').
    const dlqUpdate = (db.prepare as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("status = 'dlq'"),
    );
    expect(dlqUpdate).toBeDefined();
  });

  it("bails out (acks without delivering) when atomic claim finds zero rows", async () => {
    // Conditional UPDATE WHERE status IN ('pending', 'failed') returns
    // meta.changes=0 once a sibling consumer already moved the row out
    // of a retryable status — so the bot must not be called.
    const { consumer, bot } = createConsumer(
      [{ id: "n1", status: "pending" }],
      { ok: true },
      { changes: 0 },
    );
    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(bot.fetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("retries on unexpected error", async () => {
    const db = createMockD1({
      handler: () => {
        throw new Error("DB down");
      },
    });
    const consumer = new NotificationQueueConsumer(db, {
      fetch: vi.fn(),
    } as unknown as Fetcher);
    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(msg.retry).toHaveBeenCalled();
  });

  it("acks invalid JSON (retry won't fix bad JSON)", async () => {
    const { consumer } = createConsumer();
    const msg = {
      body: "not-json",
      ack: vi.fn(),
      retry: vi.fn(),
    } as unknown as Message;
    await consumer.processBatch({ messages: [msg] } as any);
    expect(msg.ack).toHaveBeenCalled();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("returns early when notification not found in DB", async () => {
    const { consumer, bot } = createConsumer([]);
    const msg = createMessage({
      notificationId: "n-missing",
      userId: "u1",
      type: "LIKE",
    });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(bot.fetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("skips DLQ notifications", async () => {
    const { consumer, bot } = createConsumer([{ id: "n1", status: "dlq" }]);
    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(bot.fetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("retries when bot service fetch throws", async () => {
    const db = createMockD1({
      handler: (sql) => {
        if (sql.includes("SELECT * FROM notifications WHERE id")) {
          return { results: [{ id: "n1", status: "pending" }] };
        }
        return { results: [] };
      },
    });

    const bot = {
      fetch: vi.fn(async () => {
        throw new Error("network down");
      }),
    } as unknown as Fetcher;

    const consumer = new NotificationQueueConsumer(db, bot);
    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });
    await consumer.processBatch({ messages: [msg] } as any);

    // Network/transport errors should trigger a retry, not an ack.
    expect(msg.retry).toHaveBeenCalled();
    expect(msg.ack).not.toHaveBeenCalled();

    const failedUpdate = (
      db.prepare as ReturnType<typeof vi.fn>
    ).mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("status = 'failed'"),
    );
    expect(failedUpdate).toBeDefined();
  });
});
