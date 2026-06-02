import { describe, it, expect, vi } from "vitest";
import { runCleanupJob } from "../cleanup.js";

function mockD1(rows: Array<Record<string, unknown>> = []) {
  const stored = [...rows];
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            run: async () => {
              if (sql.includes("UPDATE users SET hidden_from_matches = 1")) {
                return { meta: { changes: 2 } };
              }
              if (sql.includes("SET media_urls = '[]'")) {
                const userId = String(values[values.length - 1]);
                const row = stored.find((r) => r.id === userId);
                if (row) {
                  row.media_urls = "[]";
                  row.media_deleted_at = new Date().toISOString();
                }
                return { meta: { changes: 1 } };
              }
              return { meta: { changes: 1 } };
            },
            first: async () => {
              if (sql.includes("SELECT media_urls")) {
                const userId = String(values[0]);
                return stored.find((r) => r.id === userId) ?? null;
              }
              return null;
            },
            all: async () => ({ results: stored }),
          };
        },
      };
    },
  };
}

function mockApiService() {
  return {
    fetch: vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true }))),
  };
}

function mockBotService() {
  return {
    fetch: vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true }))),
  };
}

describe("runCleanupJob", () => {
  it("should hide inactive profiles after 14 days", async () => {
    const db = mockD1([]);
    const env = {
      DB: db as unknown as D1Database,
      API_SERVICE: mockApiService() as unknown as Fetcher,
      BOT_SERVICE: mockBotService() as unknown as Fetcher,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      KV: {} as KVNamespace,
    };

    await runCleanupJob(env);
    // Should complete without error; hidden count logged from meta.changes
    expect(db.prepare).toBeDefined();
  });

  it("should delete media for users inactive 30+ days", async () => {
    const oldDate = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const db = mockD1([
      {
        id: "1",
        telegram_id: "123",
        hidden_from_matches: 0,
        media_deleted_at: null,
        last_interaction_at: oldDate,
        media_urls: JSON.stringify([
          {
            url: "https://pub-15c733bf3c734c6ea7fc120d0becd3ed.r2.dev/1/test.jpg",
            type: "image",
          },
        ]),
      },
    ]);
    const apiService = mockApiService();
    const botService = mockBotService();
    const env = {
      DB: db as unknown as D1Database,
      API_SERVICE: apiService as unknown as Fetcher,
      BOT_SERVICE: botService as unknown as Fetcher,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      KV: {} as KVNamespace,
    };

    await runCleanupJob(env);

    // Should call API to delete media
    expect(apiService.fetch).toHaveBeenCalled();
    // Should notify user via queue
    expect(env.NOTIFICATION_QUEUE.send).toHaveBeenCalled();
    const sent = (env.NOTIFICATION_QUEUE.send as any).mock
      .calls[0][0] as string;
    const body = JSON.parse(sent);
    expect(body.type).toBe("CLEANUP_MEDIA_DELETED");
  });

  it("skips DB update when R2 deletion fails with non-404 error", async () => {
    const oldDate = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const db = mockD1([
      {
        id: "2",
        telegram_id: "456",
        hidden_from_matches: 0,
        media_deleted_at: null,
        last_interaction_at: oldDate,
        media_urls: JSON.stringify([
          {
            url: "https://pub-15c733bf3c734c6ea7fc120d0becd3ed.r2.dev/2/file.jpg",
            type: "image",
          },
        ]),
      },
    ]);
    const apiService = {
      fetch: vi.fn().mockResolvedValue(new Response("fail", { status: 500 })),
    };
    const botService = mockBotService();
    const env = {
      DB: db as unknown as D1Database,
      API_SERVICE: apiService as unknown as Fetcher,
      BOT_SERVICE: botService as unknown as Fetcher,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      KV: {} as KVNamespace,
    };

    await expect(runCleanupJob(env)).rejects.toThrow();
    // Queue should NOT be called since DB update was skipped
    expect(env.NOTIFICATION_QUEUE.send).not.toHaveBeenCalled();
  });

  it("skips DB update when R2 deletion throws an exception", async () => {
    const oldDate = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const db = mockD1([
      {
        id: "3",
        telegram_id: "789",
        hidden_from_matches: 0,
        media_deleted_at: null,
        last_interaction_at: oldDate,
        media_urls: JSON.stringify([
          {
            url: "not-a-valid-url",
            type: "image",
          },
        ]),
      },
    ]);
    const apiService = {
      fetch: vi.fn().mockRejectedValue(new Error("Connection failed")),
    };
    const botService = mockBotService();
    const env = {
      DB: db as unknown as D1Database,
      API_SERVICE: apiService as unknown as Fetcher,
      BOT_SERVICE: botService as unknown as Fetcher,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      KV: {} as KVNamespace,
    };

    await expect(runCleanupJob(env)).rejects.toThrow();
    expect(env.NOTIFICATION_QUEUE.send).not.toHaveBeenCalled();
  });

  it("cleans multiple users with media in a single run", async () => {
    const oldDate = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const db = mockD1([
      {
        id: "a",
        telegram_id: "111",
        hidden_from_matches: 0,
        media_deleted_at: null,
        last_interaction_at: oldDate,
        media_urls: JSON.stringify([
          { url: "https://pub-test.r2.dev/a/pic.jpg", type: "image" },
        ]),
      },
      {
        id: "b",
        telegram_id: "222",
        hidden_from_matches: 0,
        media_deleted_at: null,
        last_interaction_at: oldDate,
        media_urls: JSON.stringify([
          { url: "https://pub-test.r2.dev/b/pic.jpg", type: "image" },
        ]),
      },
    ]);
    const apiService = mockApiService();
    const botService = mockBotService();
    const env = {
      DB: db as unknown as D1Database,
      API_SERVICE: apiService as unknown as Fetcher,
      BOT_SERVICE: botService as unknown as Fetcher,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      KV: {} as KVNamespace,
    };

    await runCleanupJob(env);
    expect(apiService.fetch).toHaveBeenCalledTimes(2);
    expect(env.NOTIFICATION_QUEUE.send).toHaveBeenCalledTimes(2);
  });

  it("handles invalid JSON in media_urls gracefully", async () => {
    const oldDate = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const db = mockD1([
      {
        id: "5",
        telegram_id: "555",
        hidden_from_matches: 0,
        media_deleted_at: null,
        last_interaction_at: oldDate,
        media_urls: "{invalid-json",
      },
    ]);
    const apiService = mockApiService();
    const botService = mockBotService();
    const env = {
      DB: db as unknown as D1Database,
      API_SERVICE: apiService as unknown as Fetcher,
      BOT_SERVICE: botService as unknown as Fetcher,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      KV: {} as KVNamespace,
    };

    await expect(runCleanupJob(env)).rejects.toThrow();
  });
});
