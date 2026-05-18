import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiRouter } from "../router.js";

function createMockD1(
  handler: (
    sql: string,
    values: unknown[],
  ) => {
    results?: Array<Record<string, unknown>>;
    success?: boolean;
    meta?: Record<string, unknown>;
  } = () => ({
    results: [],
  }),
) {
  function makeStmt(sql: string, values: unknown[]) {
    return {
      run: vi.fn(async () => {
        const result = await handler(sql, values);
        return { success: result.success ?? true, meta: result.meta ?? {} };
      }),
      first: vi.fn(async () => {
        const result = await handler(sql, values);
        return result.results?.[0] ?? null;
      }),
      all: vi.fn(async () => {
        const result = await handler(sql, values);
        return { results: result.results ?? [] };
      }),
      bind: vi.fn((...newValues: unknown[]) => makeStmt(sql, newValues)),
    };
  }

  return {
    prepare: vi.fn((sql: string) => makeStmt(sql, [])),
    batch: vi.fn(async () => ({ success: true })),
  } as unknown as import("@cloudflare/workers-types").D1Database;
}

function createMockKV(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => store.set(key, value)),
    delete: vi.fn(async (key: string) => store.delete(key)),
    list: vi.fn(async () => ({
      keys: Array.from(store.keys()).map((name) => ({ name })),
    })),
  } as unknown as import("@cloudflare/workers-types").KVNamespace;
}

function createMockQueue() {
  return {
    send: vi.fn(async () => {}),
    sendBatch: vi.fn(async () => {}),
  } as unknown as import("@cloudflare/workers-types").Queue;
}

function createMockR2() {
  const objects = new Map<
    string,
    { body: ReadableStream; httpMetadata?: { contentType?: string } }
  >();
  return {
    put: vi.fn(
      async (
        key: string,
        value: ReadableStream | ArrayBuffer,
        opts?: { httpMetadata?: { contentType?: string } },
      ) => {
        const body =
          value instanceof ReadableStream ? value : new Blob([value]).stream();
        objects.set(key, { body, httpMetadata: opts?.httpMetadata });
      },
    ),
    get: vi.fn(async (key: string) => {
      const obj = objects.get(key);
      if (!obj) return null;
      return {
        body: obj.body,
        httpMetadata: obj.httpMetadata,
        writeHttpMetadata: vi.fn(),
        httpEtag: `"${key}"`,
        size: 0,
        uploaded: new Date(),
        checksums: {},
      };
    }),
    delete: vi.fn(async (key: string) => objects.delete(key)),
  } as unknown as import("@cloudflare/workers-types").R2Bucket;
}

describe("ApiRouter", () => {
  let router: ApiRouter;
  let mockQueue: ReturnType<typeof createMockQueue>;
  let mockR2: ReturnType<typeof createMockR2>;

  beforeEach(() => {
    const db = createMockD1((sql, values) => {
      if (sql.includes("SELECT * FROM users WHERE id")) {
        return {
          results: [
            {
              id: values[0],
              first_name: "Test",
              age: 25,
              gender: "female",
              interests: "[]",
              media_urls: "[]",
              location: "{}",
              preferences: "{}",
              is_active: 1,
              is_profile_complete: 1,
              subscription_tier: "free",
            },
          ],
        };
      }
      if (sql.includes("SELECT referral_code FROM users WHERE id")) {
        return { results: [{ referral_code: "REF123" }] };
      }
      if (sql.includes("SELECT * FROM matches WHERE id")) {
        return {
          results: [
            {
              id: values[0],
              user1_id: "u1",
              user2_id: "u2",
              status: "pending",
              score: "{}",
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
              user1_action: "none",
              user2_action: "none",
            },
          ],
        };
      }
      if (sql.includes("COUNT(*)")) {
        return { results: [{ c: 0 }] };
      }
      if (sql.includes("INSERT INTO")) {
        return { results: [], success: true };
      }
      if (sql.includes("UPDATE")) {
        return { results: [], success: true };
      }
      return { results: [] };
    });

    mockQueue = createMockQueue();
    mockR2 = createMockR2();

    router = new ApiRouter({
      DB: db,
      KV: createMockKV(),
      NOTIFICATION_QUEUE: mockQueue,
      MEDIA_BUCKET: mockR2,
    });
  });

  describe("routing", () => {
    it("returns 404 for unknown routes", async () => {
      const response = await router.route(new Request("http://api/unknown"));
      expect(response.status).toBe(404);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toBe("Not Found");
    });

    it("returns health status", async () => {
      const response = await router.route(new Request("http://api/health"));
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.status).toBe("ok");
      expect(body.service).toBe("cf-api");
    });

    it("routes GET /users/:id", async () => {
      const response = await router.route(new Request("http://api/users/123"));
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.user).toBeDefined();
    });

    it("routes POST /users", async () => {
      const response = await router.route(
        new Request("http://api/users", {
          method: "POST",
          body: JSON.stringify({
            user: { id: "123", displayName: "Test", age: 25, gender: "female" },
          }),
        }),
      );
      expect(response.status).toBe(201);
    });

    it("routes GET /users/:id/potential-matches", async () => {
      const response = await router.route(
        new Request("http://api/users/123/potential-matches?limit=5"),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(Array.isArray(body.potentialMatches)).toBe(true);
    });

    it("validates potential-matches limit", async () => {
      const response = await router.route(
        new Request("http://api/users/123/potential-matches?limit=100"),
      );
      expect(response.status).toBe(400);
    });

    it("routes GET /matches", async () => {
      const response = await router.route(
        new Request("http://api/matches?userId=123"),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(Array.isArray(body.matches)).toBe(true);
    });

    it("validates match status parameter", async () => {
      const response = await router.route(
        new Request("http://api/matches?userId=123&status=invalid"),
      );
      expect(response.status).toBe(400);
    });

    it("routes GET /matches/:id", async () => {
      const response = await router.route(new Request("http://api/matches/m1"));
      expect(response.status).toBe(200);
    });

    it("routes POST /matches/:id/like", async () => {
      const response = await router.route(
        new Request("http://api/matches/m1/like", {
          method: "POST",
          body: JSON.stringify({ userId: "u1" }),
        }),
      );
      expect(response.status).toBe(200);
    });

    it("routes POST /notifications", async () => {
      const response = await router.route(
        new Request("http://api/notifications", {
          method: "POST",
          body: JSON.stringify({ userId: "u1", type: "LIKE" }),
        }),
      );
      expect(response.status).toBe(202);
      expect(mockQueue.send).toHaveBeenCalled();
    });

    it("routes GET /queue-stats", async () => {
      const response = await router.route(
        new Request("http://api/queue-stats"),
      );
      expect(response.status).toBe(200);
    });

    it("routes POST /feedback", async () => {
      const response = await router.route(
        new Request("http://api/feedback", {
          method: "POST",
          body: JSON.stringify({ userId: "u1", type: "bug", message: "test" }),
        }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
    });

    it("rejects feedback without userId", async () => {
      const response = await router.route(
        new Request("http://api/feedback", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
    });

    it("routes POST /users/:id/block", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/block", {
          method: "POST",
          body: JSON.stringify({ blockedId: "u2" }),
        }),
      );
      expect(response.status).toBe(200);
    });

    it("rejects block without blockedId", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/block", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
    });

    it("routes POST /users/:id/unblock", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/unblock", {
          method: "POST",
          body: JSON.stringify({ blockedId: "u2" }),
        }),
      );
      expect(response.status).toBe(200);
    });

    it("routes POST /users/:id/interact", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/interact", { method: "POST" }),
      );
      expect(response.status).toBe(200);
    });

    it("routes POST /users/:id/report", async () => {
      const response = await router.route(
        new Request("http://api/users/u2/report", {
          method: "POST",
          body: JSON.stringify({ reporterId: "u1", reason: "spam" }),
        }),
      );
      expect(response.status).toBe(200);
    });

    it("routes GET /users/:id/referral", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/referral"),
      );
      expect(response.status).toBe(200);
    });

    it("routes POST /users/:id/last-active", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/last-active", { method: "POST" }),
      );
      expect(response.status).toBe(200);
    });

    it("routes POST /cron/downgrade-expired-subscriptions", async () => {
      const response = await router.route(
        new Request("http://api/cron/downgrade-expired-subscriptions", {
          method: "POST",
        }),
      );
      expect(response.status).toBe(200);
    });

    it("routes POST /matches/:id/dislike", async () => {
      const response = await router.route(
        new Request("http://api/matches/m1/dislike", {
          method: "POST",
          body: JSON.stringify({ userId: "u1" }),
        }),
      );
      expect(response.status).toBe(200);
    });

    it("routes POST /matches/:id/skip", async () => {
      const response = await router.route(
        new Request("http://api/matches/m1/skip", {
          method: "POST",
          body: JSON.stringify({ userId: "u1" }),
        }),
      );
      expect(response.status).toBe(200);
    });

    it("routes POST /matches/:id/undo", async () => {
      const response = await router.route(
        new Request("http://api/matches/m1/undo", {
          method: "POST",
          body: JSON.stringify({ userId: "u1" }),
        }),
      );
      expect(response.status).toBe(200);
    });

    it("rejects error-reports with invalid JSON", async () => {
      const response = await router.route(
        new Request("http://api/error-reports", {
          method: "POST",
          body: "not-json",
        }),
      );
      expect(response.status).toBe(400);
    });

    it("routes PATCH /error-reports/:id/status", async () => {
      const db = createMockD1((sql) => {
        if (sql.includes("UPDATE error_reports SET status")) {
          return { results: [], success: true, meta: { changes: 1 } };
        }
        return {
          results: [
            {
              id: "r1",
              reporterId: "u1",
              traceId: null,
              message: null,
              journey: null,
              status: "reviewed",
              severity: "low",
              alertSent: 0,
              source: null,
              botVersion: null,
              apiVersion: null,
              workerVersion: null,
              errorStack: null,
              userLanguage: null,
              userTier: null,
              triggerInput: null,
              kvSession: null,
              cfMetadata: null,
              createdAt: "2025-01-01T00:00:00Z",
            },
          ],
        };
      });
      const router = new ApiRouter({
        DB: db,
        KV: createMockKV(),
        NOTIFICATION_QUEUE: createMockQueue(),
        MEDIA_BUCKET: createMockR2(),
      });
      const response = await router.route(
        new Request("http://api/error-reports/r1/status", {
          method: "PATCH",
          body: JSON.stringify({ status: "reviewed" }),
        }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        success: boolean;
        report: { status: string };
      };
      expect(body.success).toBe(true);
      expect(body.report.status).toBe("reviewed");
    });

    it("returns 400 for invalid status on PATCH /error-reports/:id/status", async () => {
      const response = await router.route(
        new Request("http://api/error-reports/r1/status", {
          method: "PATCH",
          body: JSON.stringify({ status: "invalid" }),
        }),
      );
      expect(response.status).toBe(400);
    });

    it("returns 404 for nonexistent report on PATCH /error-reports/:id/status", async () => {
      const db = createMockD1((sql) => {
        if (sql.includes("UPDATE error_reports SET status")) {
          return { results: [], success: true, meta: { changes: 0 } };
        }
        if (sql.includes("FROM error_reports WHERE id")) {
          return { results: [] };
        }
        return { results: [] };
      });
      const router = new ApiRouter({
        DB: db,
        KV: createMockKV(),
        NOTIFICATION_QUEUE: createMockQueue(),
        MEDIA_BUCKET: createMockR2(),
      });
      const response = await router.route(
        new Request("http://api/error-reports/nonexistent/status", {
          method: "PATCH",
          body: JSON.stringify({ status: "reviewed" }),
        }),
      );
      expect(response.status).toBe(404);
    });

    it("routes GET /geocode with query", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              {
                lat: "-6.2",
                lon: "106.8",
                address: { city: "Jakarta", country: "Indonesia" },
              },
            ]),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ) as unknown as typeof fetch;
      const response = await router.route(
        new Request("http://api/geocode?q=jakarta&limit=5"),
      );
      globalThis.fetch = originalFetch;
      expect(response.status).toBe(200);
    });

    it("routes GET /geocode with lat/lon", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              lat: "-6.2",
              lon: "106.8",
              address: { city: "Jakarta", country: "Indonesia" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ) as unknown as typeof fetch;
      const response = await router.route(
        new Request("http://api/geocode?lat=-6.2&lon=106.8"),
      );
      globalThis.fetch = originalFetch;
      expect(response.status).toBe(200);
    });

    it("routes GET /users/:id/pending-likes", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/pending-likes"),
      );
      expect(response.status).toBe(200);
    });
  });

  describe("error handling", () => {
    it("handles unhandled errors gracefully", async () => {
      const badRouter = new ApiRouter({
        DB: createMockD1(() => {
          throw new Error("DB explosion");
        }),
        KV: createMockKV(),
        NOTIFICATION_QUEUE: createMockQueue(),
        MEDIA_BUCKET: createMockR2(),
      });

      const response = await badRouter.route(
        new Request("http://api/users/123"),
      );
      expect(response.status).toBe(500);
    });

    it("returns 404 when user not found", async () => {
      const db = createMockD1((sql) => {
        if (sql.includes("FROM users WHERE id")) {
          return { results: [] };
        }
        return { results: [] };
      });
      const router = new ApiRouter({
        DB: db,
        KV: createMockKV(),
        NOTIFICATION_QUEUE: createMockQueue(),
        MEDIA_BUCKET: createMockR2(),
      });
      const response = await router.route(new Request("http://api/users/999"));
      expect(response.status).toBe(404);
    });

    it("returns 404 when match not found", async () => {
      const db = createMockD1((sql) => {
        if (sql.includes("FROM matches WHERE id")) {
          return { results: [] };
        }
        return { results: [] };
      });
      const router = new ApiRouter({
        DB: db,
        KV: createMockKV(),
        NOTIFICATION_QUEUE: createMockQueue(),
        MEDIA_BUCKET: createMockR2(),
      });
      const response = await router.route(
        new Request("http://api/matches/m999"),
      );
      expect(response.status).toBe(404);
    });

    it("returns 400 for invalid match action", async () => {
      const response = await router.route(
        new Request("http://api/matches/m1/invalid", {
          method: "POST",
          body: JSON.stringify({ userId: "u1" }),
        }),
      );
      expect(response.status).toBe(400);
    });
  });
});
