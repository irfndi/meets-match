import { describe, it, expect, vi } from "vitest";
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
  } as unknown as D1Database;
}

async function runEffect<A, E>(
  effect: import("effect").Effect.Effect<A, E, never>,
): Promise<A> {
  const { Effect, Exit, Cause } = await import("effect");
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
      if (sql.includes("INSERT INTO notification_logs")) {
        return { results: [] };
      }
      return { results: [] };
    });

    const bot = {
      fetch: vi.fn(
        async () => new Response(JSON.stringify(botResponse), { status: 200 }),
      ),
      connect: vi.fn(),
    } as unknown as import("@cloudflare/workers-types").Fetcher;

    return { db, bot };
  }

  it("processes a notification successfully", async () => {
    const { db, bot } = createConsumer([
      {
        id: "n1",
        user_id: "u1",
        type: "LIKE",
        status: "pending",
        payload: "{}",
      },
    ]);
    const consumer = new NotificationQueueConsumer(db, bot);
    await runEffect(
      consumer.process({ notificationId: "n1", userId: "u1", type: "LIKE" }),
    );
    expect(bot.fetch).toHaveBeenCalledTimes(1);
  });

  it("skips missing notifications", async () => {
    const { db, bot } = createConsumer([]);
    const consumer = new NotificationQueueConsumer(db, bot);
    await runEffect(
      consumer.process({ notificationId: "n1", userId: "u1", type: "LIKE" }),
    );
    expect(bot.fetch).not.toHaveBeenCalled();
  });

  it("retries on bot failure", async () => {
    const { db, bot } = createConsumer(
      [
        {
          id: "n1",
          user_id: "u1",
          type: "LIKE",
          status: "pending",
          payload: "{}",
        },
      ],
      { ok: false, text: "timeout" },
    );
    const consumer = new NotificationQueueConsumer(db, bot);
    await expect(
      runEffect(
        consumer.process({ notificationId: "n1", userId: "u1", type: "LIKE" }),
      ),
    ).rejects.toThrow();
  });
});
