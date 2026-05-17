import { describe, it, expect, vi } from "vitest";
import {
  NotificationQueueProducer,
  NotificationQueueConsumer,
} from "../../notifications/queue.js";
import { createMockD1, runEffect } from "../../../../../packages/cf-shared/src/__tests__/__helpers__/test-utils.js";

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
      runEffect(producer.enqueue({ notificationId: "n1", userId: "u1", type: "LIKE" })),
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
      return { results: [] };
    });

    const botService = {
      fetch: vi.fn(async () => ({
        ok: botResponse.ok,
        text: async () => botResponse.text ?? "ok",
      })),
    } as unknown as Fetcher;

    return { consumer: new NotificationQueueConsumer(db, botService), db, botService };
  }

  function createMessage(body: Record<string, unknown>) {
    return {
      body: JSON.stringify(body),
      ack: vi.fn(),
      retry: vi.fn(),
    } as unknown as Message;
  }

  it("processes and acks a delivered message", async () => {
    const { consumer } = createConsumer([{ id: "n1", status: "pending" }]);
    const msg = createMessage({ notificationId: "n1", userId: "u1", type: "LIKE" });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(msg.ack).toHaveBeenCalled();
  });

  it("skips already delivered notifications", async () => {
    const { consumer, botService } = createConsumer([{ id: "n1", status: "delivered" }]);
    const msg = createMessage({ notificationId: "n1", userId: "u1", type: "LIKE" });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(botService.fetch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalled();
  });

  it("marks failed when bot service returns error", async () => {
    const { consumer } = createConsumer(
      [{ id: "n1", status: "pending" }],
      { ok: false, text: "bot error" },
    );
    const msg = createMessage({ notificationId: "n1", userId: "u1", type: "LIKE" });
    await consumer.processBatch({ messages: [msg] } as any);
    expect(msg.ack).toHaveBeenCalled();
  });

  it("retries on unexpected error", async () => {
    const db = createMockD1(() => {
      throw new Error("DB down");
    });
    const consumer = new NotificationQueueConsumer(db, { fetch: vi.fn() } as any);
    const msg = createMessage({ notificationId: "n1", userId: "u1", type: "LIKE" });
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
});
