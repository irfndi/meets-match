import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationQueueConsumer } from "../notifications/queue.js";

function mockD1(withNotification = false) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn(async () =>
          withNotification ? { id: "n1", status: "pending" } : null,
        ),
        run: vi.fn(async () => ({ success: true })),
        all: vi.fn(async () => ({ results: [] })),
      })),
    })),
  } as unknown as D1Database;
}

function mockMessage(body: Record<string, unknown>): Message {
  return {
    body: JSON.stringify(body),
    ack: vi.fn(),
    retry: vi.fn(),
  } as unknown as Message;
}

describe("NotificationQueueConsumer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should ack valid message when notification exists", async () => {
    const db = mockD1(true);
    const botService = {
      fetch: vi.fn().mockResolvedValue(new Response()),
    } as unknown as Fetcher;
    const consumer = new NotificationQueueConsumer(db, botService);

    const msg = mockMessage({
      notificationId: "n1",
      userId: "123",
      type: "WELCOME",
    });
    await consumer.processBatch({
      messages: [msg],
      queue: "test",
      retry: vi.fn(),
    });

    expect(msg.ack).toHaveBeenCalled();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("should still ack if notification not found (no-op)", async () => {
    const db = mockD1(false);
    const botService = { fetch: vi.fn() } as unknown as Fetcher;
    const consumer = new NotificationQueueConsumer(db, botService);

    const msg = mockMessage({
      notificationId: "n1",
      userId: "123",
      type: "WELCOME",
    });
    await consumer.processBatch({
      messages: [msg],
      queue: "test",
      retry: vi.fn(),
    });

    expect(msg.ack).toHaveBeenCalled();
  });

  it("should ack malformed JSON payload (retry won't fix bad JSON)", async () => {
    const db = mockD1(false);
    const botService = { fetch: vi.fn() } as unknown as Fetcher;
    const consumer = new NotificationQueueConsumer(db, botService);

    const ack = vi.fn();
    const retry = vi.fn();
    const msg = { body: "not-valid-json", ack, retry } as unknown as Message;
    await consumer.processBatch({
      messages: [msg],
      queue: "test",
      retry: vi.fn(),
    });

    expect(ack).toHaveBeenCalled();
    expect(retry).not.toHaveBeenCalled();
  });

  it("should process all messages in batch independently", async () => {
    const db = mockD1(true);
    const botService = {
      fetch: vi.fn().mockResolvedValue(new Response()),
    } as unknown as Fetcher;
    const consumer = new NotificationQueueConsumer(db, botService);

    const msg1 = mockMessage({
      notificationId: "n1",
      userId: "1",
      type: "WELCOME",
    });
    const msg2 = mockMessage({
      notificationId: "n2",
      userId: "2",
      type: "WELCOME",
    });
    await consumer.processBatch({
      messages: [msg1, msg2],
      queue: "test",
      retry: vi.fn(),
    });

    expect(msg1.ack).toHaveBeenCalled();
    expect(msg2.ack).toHaveBeenCalled();
  });
});
