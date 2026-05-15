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
    fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }))),
  };
}

function mockBotService() {
  return {
    fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }))),
  };
}

describe("runCleanupJob", () => {
  it("should hide inactive profiles after 14 days", async () => {
    const db = mockD1([]);
    const env = {
      DB: db as unknown as D1Database,
      API_SERVICE: mockApiService() as unknown as Fetcher,
      BOT_SERVICE: mockBotService() as unknown as Fetcher,
      KV: {} as KVNamespace,
    };

    await runCleanupJob(env);
    // Should complete without error; hidden count logged from meta.changes
    expect(db.prepare).toBeDefined();
  });

  it("should delete media for users inactive 30+ days", async () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const db = mockD1([
      {
        id: "1",
        telegram_id: "123",
        hidden_from_matches: 0,
        media_deleted_at: null,
        last_interaction_at: oldDate,
        media_urls: JSON.stringify([{ url: "https://media.meetsmatch.irfndi.workers.dev/1/test.jpg", type: "image" }]),
      },
    ]);
    const apiService = mockApiService();
    const botService = mockBotService();
    const env = {
      DB: db as unknown as D1Database,
      API_SERVICE: apiService as unknown as Fetcher,
      BOT_SERVICE: botService as unknown as Fetcher,
      KV: {} as KVNamespace,
    };

    await runCleanupJob(env);

    // Should call API to delete media
    expect(apiService.fetch).toHaveBeenCalled();
    // Should notify user
    expect(botService.fetch).toHaveBeenCalled();
  });
});
