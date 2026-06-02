import { Cause, Effect, Exit } from "effect";
import { describe, it, expect, vi } from "vitest";
import type { Queue, Fetcher, Message } from "@cloudflare/workers-types";
import {
  NotificationQueueProducer,
  NotificationQueueConsumer,
} from "../../notifications/queue.js";

function createMockD1(
  handler: (
    sql: string,
    values: unknown[],
  ) => { results?: Array<Record<string, unknown>> } = () => ({ results: [] }),
) {
  return {
    prepare: vi.fn((sql: string) => {
      return {
        bind: vi.fn((...values: unknown[]) => ({
          run: vi.fn(async () => ({ success: true })),
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

describe("NotificationQueueConsumer", () => {
  function createConsumer(
    dbRows: Array<Record<string, unknown>> = [],
    botResponse: { ok: boolean; text?: string } = { ok: true },
  ) {
    const db = createMockD1((sql, values) => {
      if (sql.includes("SELECT * FROM notifications WHERE id")) {
        return { results: dbRows };
      }
      if (sql.includes("UPDATE notifications SET status")) {
        return { results: [] };
      }
      return { results: [] };
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

  it("acks and marks failed when bot service returns 410 (permanent)", async () => {
    const botFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "chat not found" }), {
          status: 410,
        }),
    );
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT * FROM notifications WHERE id")) {
        return { results: [{ id: "n1", status: "pending" }] };
      }
      return { results: [] };
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
  });

  it("retries on unexpected error", async () => {
    const db = createMockD1(() => {
      throw new Error("DB down");
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

  it("handles invalid JSON gracefully", async () => {
    const { consumer } = createConsumer();
    const msg = {
      body: "not-json",
      ack: vi.fn(),
      retry: vi.fn(),
    } as unknown as Message;
    await consumer.processBatch({ messages: [msg] } as any);
    expect(msg.retry).toHaveBeenCalled();
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
    const db = createMockD1((sql) => {
      if (sql.includes("SELECT * FROM notifications WHERE id")) {
        return { results: [{ id: "n1", status: "pending" }] };
      }
      return { results: [] };
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
  });
});
