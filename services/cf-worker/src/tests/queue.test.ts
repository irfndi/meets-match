import { describe, it, expect, vi } from "vitest";
import worker from "../index.js";

function createMockD1(notification: Record<string, unknown> | null = null) {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...values: unknown[]) => {
        queries.push({ sql, values });
        return {
          run: vi.fn(async () => ({ success: true })),
          first: vi.fn(async () => notification),
          all: vi.fn(async () => ({ results: [] })),
        };
      }),
    })),
    _queries: queries,
  } as unknown as D1Database & {
    _queries: Array<{ sql: string; values: unknown[] }>;
  };
}

function createMockFetcher(response: Response) {
  return {
    fetch: vi.fn(async () => response),
  } as unknown as Fetcher;
}

function createMockMessage(body: Record<string, unknown>): Message {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date(),
    body: JSON.stringify(body),
    ack: vi.fn(),
    retry: vi.fn(),
    attempts: 1,
  } as unknown as Message;
}

function createMockBatch(queue: string, messages: Message[]): MessageBatch {
  return {
    queue,
    messages,
    retryAll: vi.fn(),
    ackAll: vi.fn(),
  } as unknown as MessageBatch;
}

describe("cf-worker queue handler", () => {
  it("delivers notification successfully", async () => {
    const notification = {
      id: "notif-1",
      status: "pending",
      user_id: "user-1",
      type: "like",
    };
    const mockD1 = createMockD1(notification);
    const mockBot = createMockFetcher(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const message = createMockMessage({
      notificationId: "notif-1",
      userId: "user-1",
      type: "like",
    });
    const batch = createMockBatch("notification-queue", [message]);

    await worker.queue(
      batch,
      { DB: mockD1, BOT_SERVICE: mockBot } as any,
      {} as any,
    );

    expect(message.ack).toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();

    const updateDelivered = mockD1._queries.find((q) =>
      q.sql.includes("status = 'delivered'"),
    );
    expect(updateDelivered).toBeDefined();
  });

  it("retries on bot service failure", async () => {
    const notification = {
      id: "notif-2",
      status: "pending",
      user_id: "user-2",
      type: "match",
    };
    const mockD1 = createMockD1(notification);
    const mockBot = createMockFetcher(
      new Response(JSON.stringify({ error: "Bot error" }), { status: 500 }),
    );

    const message = createMockMessage({
      notificationId: "notif-2",
      userId: "user-2",
      type: "match",
    });
    const batch = createMockBatch("notification-queue", [message]);

    await worker.queue(
      batch,
      { DB: mockD1, BOT_SERVICE: mockBot } as any,
      {} as any,
    );

    expect(message.retry).toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();

    const updateFailed = mockD1._queries.find((q) =>
      q.sql.includes("status = 'failed'"),
    );
    expect(updateFailed).toBeDefined();
  });

  it("moves DLQ messages to dlq status in DB", async () => {
    const notification = {
      id: "notif-3",
      status: "failed",
      user_id: "user-3",
      type: "like",
    };
    const mockD1 = createMockD1(notification);
    const mockBot = createMockFetcher(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const message = createMockMessage({
      notificationId: "notif-3",
      userId: "user-3",
      type: "like",
    });
    const batch = createMockBatch("dlq", [message]);

    await worker.queue(
      batch,
      { DB: mockD1, BOT_SERVICE: mockBot } as any,
      {} as any,
    );

    expect(message.ack).toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();

    const updateDlq = mockD1._queries.find((q) =>
      q.sql.includes("status = 'dlq'"),
    );
    expect(updateDlq).toBeDefined();

    const attempt = mockD1._queries.find((q) =>
      q.sql.includes("notification_delivery_attempts"),
    );
    expect(attempt).toBeDefined();
    expect(attempt?.values).toContain("Moved to DLQ after max retries");
  });

  it("acks DLQ message when notification not found", async () => {
    const mockD1 = createMockD1(null);
    const mockBot = createMockFetcher(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const message = createMockMessage({
      notificationId: "missing",
      userId: "user-4",
      type: "like",
    });
    const batch = createMockBatch("dlq-dev", [message]);

    await worker.queue(
      batch,
      { DB: mockD1, BOT_SERVICE: mockBot } as any,
      {} as any,
    );

    expect(message.ack).toHaveBeenCalled();
  });

  it("acks already delivered notification without re-delivering", async () => {
    const notification = {
      id: "notif-5",
      status: "delivered",
      user_id: "user-5",
      type: "like",
    };
    const mockD1 = createMockD1(notification);
    const mockBot = createMockFetcher(
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );

    const message = createMockMessage({
      notificationId: "notif-5",
      userId: "user-5",
      type: "like",
    });
    const batch = createMockBatch("notification-queue", [message]);

    await worker.queue(
      batch,
      { DB: mockD1, BOT_SERVICE: mockBot } as any,
      {} as any,
    );

    expect(message.ack).toHaveBeenCalled();
    expect(mockBot.fetch).not.toHaveBeenCalled();
  });
});
