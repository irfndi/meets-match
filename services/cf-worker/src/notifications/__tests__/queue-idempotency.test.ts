import { describe, it, expect, vi } from "vitest";
import { NotificationQueueConsumer } from "../../notifications/queue.js";
import type { Message } from "@cloudflare/workers-types";
import {
  createRacingMockD1,
  createRaceBarrier,
} from "@meetsmatch/cf-shared/testing/race-mocks";

function createMessage(body: Record<string, unknown>): Message {
  return {
    body: JSON.stringify(body),
    ack: vi.fn(),
    retry: vi.fn(),
  } as unknown as Message;
}

describe("NotificationQueueConsumer idempotency", () => {
  it("does not re-deliver a notification that is already delivered", async () => {
    const store = new Map<string, Record<string, unknown>>([
      [
        "n1",
        {
          id: "n1",
          status: "delivered",
          user_id: "u1",
          type: "LIKE",
        },
      ],
    ]);

    const db = createRacingMockD1({ initialRows: store });
    const botFetch = vi.fn(async () => new Response("ok"));
    const consumer = new NotificationQueueConsumer(
      db as unknown as import("@cloudflare/workers-types").D1Database,
      {
        fetch: botFetch,
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    );

    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });

    await consumer.processBatch({ messages: [msg] } as any);

    // Should ack without calling bot service
    expect(botFetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("does not re-deliver a notification that is in DLQ", async () => {
    const store = new Map<string, Record<string, unknown>>([
      [
        "n1",
        {
          id: "n1",
          status: "dlq",
          user_id: "u1",
          type: "LIKE",
        },
      ],
    ]);

    const db = createRacingMockD1({ initialRows: store });
    const botFetch = vi.fn(async () => new Response("ok"));
    const consumer = new NotificationQueueConsumer(
      db as unknown as import("@cloudflare/workers-types").D1Database,
      {
        fetch: botFetch,
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    );

    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });

    await consumer.processBatch({ messages: [msg] } as any);

    expect(botFetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("processes a batch of 10 messages independently", async () => {
    const store = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < 10; i++) {
      store.set(`n${i}`, {
        id: `n${i}`,
        status: "pending",
        user_id: "u1",
        type: "LIKE",
      });
    }

    const db = createRacingMockD1({ initialRows: store });
    const botFetch = vi.fn(async () => new Response("ok"));
    const consumer = new NotificationQueueConsumer(
      db as unknown as import("@cloudflare/workers-types").D1Database,
      {
        fetch: botFetch,
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    );

    const messages = Array.from({ length: 10 }, (_, i) =>
      createMessage({
        notificationId: `n${i}`,
        userId: "u1",
        type: "LIKE",
      }),
    );

    await consumer.processBatch({ messages } as any);

    expect(botFetch).toHaveBeenCalledTimes(10);
    for (const msg of messages) {
      expect(msg.ack).toHaveBeenCalled();
    }
  });

  it("acks delivered messages and retries failed ones in a mixed batch", async () => {
    const store = new Map<string, Record<string, unknown>>([
      ["n1", { id: "n1", status: "pending", user_id: "u1", type: "LIKE" }],
      ["n2", { id: "n2", status: "delivered", user_id: "u1", type: "LIKE" }],
      ["n3", { id: "n3", status: "pending", user_id: "u1", type: "LIKE" }],
    ]);

    const db = createRacingMockD1({ initialRows: store });
    let callCount = 0;
    const botFetch = vi.fn(async () => {
      callCount++;
      if (callCount === 2) {
        return new Response("bot error", { status: 500 });
      }
      return new Response("ok");
    });

    const consumer = new NotificationQueueConsumer(
      db as unknown as import("@cloudflare/workers-types").D1Database,
      {
        fetch: botFetch,
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    );

    const msgs = [
      createMessage({ notificationId: "n1", userId: "u1", type: "LIKE" }),
      createMessage({ notificationId: "n2", userId: "u1", type: "LIKE" }),
      createMessage({ notificationId: "n3", userId: "u1", type: "LIKE" }),
    ];

    await consumer.processBatch({ messages: msgs } as any);

    expect(botFetch).toHaveBeenCalledTimes(2); // n1 and n3 (n2 skipped)
    expect(msgs[0].ack).toHaveBeenCalled(); // n1 succeeded
    expect(msgs[1].ack).toHaveBeenCalled(); // n2 was already delivered
    expect(msgs[2].ack).toHaveBeenCalled(); // n3 failed but acked (code acks on failure too)
  });

  it("documents race when two workers process the same pending notification", async () => {
    // Simulates: Worker A reads notification as "pending", starts bot fetch.
    // Worker B reads same notification as "pending", also starts bot fetch.
    // Both deliver the same notification twice.
    const barrier = createRaceBarrier();

    const store = new Map<string, Record<string, unknown>>([
      [
        "n1",
        {
          id: "n1",
          status: "pending",
          user_id: "u1",
          type: "LIKE",
        },
      ],
    ]);

    let updateCount = 0;
    const db = createRacingMockD1({
      initialRows: store,
      pauseBeforeRun: (sql) => {
        // Pause Worker A at the UPDATE to 'processing' so Worker B can
        // also read "pending" and process before A resumes.
        if (
          sql.includes("UPDATE notifications SET status = 'processing'") &&
          updateCount === 0
        ) {
          updateCount++;
          return barrier.promise;
        }
        return undefined;
      },
    });

    const botFetch = vi.fn(async () => new Response("ok"));
    const consumer = new NotificationQueueConsumer(
      db as unknown as import("@cloudflare/workers-types").D1Database,
      {
        fetch: botFetch,
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    );

    const msg = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });

    // Start Worker A — pauses at SELECT
    const p1 = consumer.processBatch({ messages: [msg] } as any);
    // Wait until Worker A is actually paused at the UPDATE.
    for (let i = 0; i < 100 && updateCount === 0; i++) {
      await Promise.resolve();
    }
    expect(updateCount).toBe(1);

    // Worker B processes same message — reads "pending" because A hasn't updated yet
    const msg2 = createMessage({
      notificationId: "n1",
      userId: "u1",
      type: "LIKE",
    });
    await consumer.processBatch({ messages: [msg2] } as any);

    // Release Worker A
    barrier.resolve();
    await p1;

    // BUG: bot service was called twice for the same notification
    expect(botFetch).toHaveBeenCalledTimes(2);
    expect(msg.ack).toHaveBeenCalled();
    expect(msg2.ack).toHaveBeenCalled();
  });
});
