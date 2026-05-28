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

function makeUserResult(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    first_name: "Test",
    username: "testuser",
    last_name: "User",
    bio: "Hello",
    age: 25,
    birth_date: null,
    gender: "female",
    interests: "[]",
    media_urls: "[]",
    location: "{}",
    preferences: "{}",
    is_active: 1,
    is_sleeping: 0,
    is_profile_complete: 1,
    phone_number: null,
    language: "en",
    subscription_tier: "free",
    subscription_expires_at: null,
    daily_swipes_used: 3,
    daily_swipes_reset_at: "2025-06-01T00:00:00.000Z",
    daily_likes_used: 5,
    daily_likes_reset_at: "2025-06-01T00:00:00.000Z",
    daily_dislikes_used: 10,
    daily_dislikes_reset_at: "2025-06-01T00:00:00.000Z",
    daily_media_used: 2,
    daily_media_reset_at: "2025-06-01T00:00:00.000Z",
    referral_code: "REF123",
    referred_by: null,
    referral_count: 5,
    referral_bonus_swipes: 0,
    dm_credits: 5,
    hidden_from_matches: 0,
    media_deleted_at: null,
    last_interaction_at: "2025-01-01T00:00:00.000Z",
    created_at: "2025-01-01T00:00:00.000Z",
    updated_at: "2025-01-01T00:00:00.000Z",
    last_active: "2025-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ApiRouter extended routes", () => {
  let router: ApiRouter;

  function createRouter(overrides?: {
    handler?: (
      sql: string,
      values: unknown[],
    ) => {
      results?: Array<Record<string, unknown>>;
      success?: boolean;
      meta?: Record<string, unknown>;
    };
  }) {
    const db = createMockD1(
      overrides?.handler ??
        ((sql, values) => {
          if (sql.includes("SELECT * FROM users WHERE id")) {
            return { results: [makeUserResult(String(values[0]))] };
          }
          if (sql.includes("SELECT id FROM users WHERE id")) {
            return { results: [{ id: values[0] }] };
          }
          if (sql.includes("SELECT referral_code FROM users")) {
            return { results: [{ referral_code: "REF123" }] };
          }
          if (sql.includes("SELECT subscription_tier, daily_swipes_used")) {
            return {
              results: [
                {
                  subscription_tier: "free",
                  daily_swipes_used: 3,
                  daily_swipes_reset_at: "2025-06-01T00:00:00.000Z",
                  referral_bonus_swipes: 0,
                },
              ],
            };
          }
          if (sql.includes("SELECT subscription_tier, daily_likes_used")) {
            return {
              results: [
                {
                  subscription_tier: "free",
                  daily_likes_used: 5,
                  daily_likes_reset_at: "2025-06-01T00:00:00.000Z",
                  daily_dislikes_used: 10,
                  daily_dislikes_reset_at: "2025-06-01T00:00:00.000Z",
                  referral_bonus_swipes: 0,
                },
              ],
            };
          }
          if (sql.includes("SELECT subscription_tier, daily_dislikes_used")) {
            return {
              results: [
                {
                  subscription_tier: "free",
                  daily_dislikes_used: 10,
                  daily_dislikes_reset_at: "2025-06-01T00:00:00.000Z",
                  referral_bonus_swipes: 0,
                },
              ],
            };
          }
          if (sql.includes("SELECT subscription_tier, dm_credits FROM users")) {
            return { results: [{ subscription_tier: "free", dm_credits: 5 }] };
          }
          if (sql.includes("SELECT dm_credits FROM users")) {
            return { results: [{ dm_credits: 5 }] };
          }
          if (sql.includes("SELECT subscription_tier, daily_media_used")) {
            return {
              results: [
                {
                  subscription_tier: "free",
                  daily_media_used: 2,
                  daily_media_reset_at: "2025-06-01T00:00:00.000Z",
                },
              ],
            };
          }
          if (sql.includes("SELECT media_urls FROM users")) {
            return { results: [{ media_urls: "[]" }] };
          }
          if (sql.includes("SELECT blocked_id FROM blocks")) {
            return { results: [] };
          }
          if (sql.includes("SELECT * FROM notifications WHERE id")) {
            return {
              results: [
                {
                  id: "n1",
                  user_id: "u1",
                  type: "NEW_LIKE",
                  channel: "TELEGRAM",
                  status: "pending",
                  attempt_count: 0,
                  max_attempts: 5,
                  created_at: "2026-01-01",
                },
              ],
            };
          }
          if (sql.includes("COUNT(*)")) {
            return { results: [{ c: 0 }] };
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
                  created_at: "2026-01-01",
                  updated_at: "2026-01-01",
                  user1_action: "none",
                  user2_action: "none",
                },
              ],
            };
          }
          if (sql.includes("SELECT id, reporter_id as reporterId")) {
            return { results: [] };
          }
          return { results: [], success: true, meta: {} };
        }),
    );

    return new ApiRouter({
      DB: db,
      KV: createMockKV(),
      NOTIFICATION_QUEUE: createMockQueue(),
      MEDIA_BUCKET: createMockR2(),
    });
  }

  beforeEach(() => {
    router = createRouter();
  });

  // -----------------------------------------------------------------------
  // User routes
  // -----------------------------------------------------------------------

  describe("PUT /users/:id", () => {
    it("updates user and returns 200", async () => {
      const response = await router.route(
        new Request("http://api/users/u1", {
          method: "PUT",
          body: JSON.stringify({
            user: { id: "u1", bio: "Updated" },
            updateMask: ["bio"],
          }),
        }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.user).toBeDefined();
    });
  });

  describe("GET /users/:id/swipe-status", () => {
    it("returns swipe status", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/swipe-status"),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.remaining).toBeDefined();
      expect(body.total).toBeDefined();
    });
  });

  describe("POST /users/:id/record-swipe", () => {
    it("records swipe and returns remaining", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/record-swipe", { method: "POST" }),
      );
      expect(response.status).toBe(200);
    });
  });

  describe("GET /users/:id/interaction-status", () => {
    it("returns interaction status for valid user", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/interaction-status"),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.likesRemaining).toBeDefined();
      expect(body.dislikesRemaining).toBeDefined();
    });
  });

  describe("POST /users/:id/record-like", () => {
    it("records a like", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/record-like", { method: "POST" }),
      );
      expect(response.status).toBe(200);
    });
  });

  describe("POST /users/:id/record-dislike", () => {
    it("records a dislike", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/record-dislike", { method: "POST" }),
      );
      expect(response.status).toBe(200);
    });
  });

  describe("GET /users/:id/dm-status", () => {
    it("returns DM status", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/dm-status"),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.canSendDM).toBeDefined();
    });
  });

  describe("POST /users/:id/send-dm", () => {
    it("uses DM credit", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/send-dm", { method: "POST" }),
      );
      expect(response.status).toBe(200);
    });
  });

  describe("POST /users/:id/purchase-dm-credits", () => {
    it("adds DM credits with valid amount", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/purchase-dm-credits", {
          method: "POST",
          body: JSON.stringify({ amount: 10 }),
        }),
      );
      expect(response.status).toBe(200);
    });

    it("rejects invalid amount", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/purchase-dm-credits", {
          method: "POST",
          body: JSON.stringify({ amount: 0 }),
        }),
      );
      expect(response.status).toBe(400);
    });

    it("rejects NaN amount", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/purchase-dm-credits", {
          method: "POST",
          body: JSON.stringify({ amount: "invalid" }),
        }),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("POST /users/:id/apply-referral", () => {
    it("applies a referral code", async () => {
      const mockRouter = createRouter({
        handler: (sql, values) => {
          if (
            sql.includes(
              "SELECT referral_code, referred_by FROM users WHERE id =",
            )
          ) {
            return {
              results: [{ referral_code: "MYCODE", referred_by: null }],
            };
          }
          if (
            sql.includes(
              "SELECT id, referral_count, referral_bonus_swipes FROM users WHERE referral_code",
            )
          ) {
            return {
              results: [
                { id: "ref1", referral_count: 2, referral_bonus_swipes: 5 },
              ],
            };
          }
          return { results: [], success: true, meta: {} };
        },
      });
      const response = await mockRouter.route(
        new Request("http://api/users/u1/apply-referral", {
          method: "POST",
          body: JSON.stringify({ code: "XYZ456" }),
        }),
      );
      expect(response.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // Media routes
  // -----------------------------------------------------------------------

  describe("POST /users/:id/media with url", () => {
    it("registers pre-uploaded media URL", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/media", {
          method: "POST",
          body: JSON.stringify({
            url: "https://example.com/photo.jpg",
            type: "image",
          }),
        }),
      );
      expect(response.status).toBe(200);
    });

    it("rejects invalid media type on url upload", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/media", {
          method: "POST",
          body: JSON.stringify({
            url: "https://example.com/file.pdf",
            type: "pdf",
          }),
        }),
      );
      expect(response.status).toBe(400);
    });

    it("rejects when at media upload limit", async () => {
      const mockRouter = createRouter({
        handler: (sql) => {
          if (sql.includes("daily_media_used")) {
            return {
              results: [
                {
                  subscription_tier: "free",
                  daily_media_used: 10,
                  daily_media_reset_at: "2099-01-01T00:00:00.000Z",
                },
              ],
            };
          }
          if (sql.includes("media_urls")) {
            return { results: [{ media_urls: "[]" }] };
          }
          return { results: [{ id: "u1" }], success: true, meta: {} };
        },
      });
      const response = await mockRouter.route(
        new Request("http://api/users/u1/media", {
          method: "POST",
          body: JSON.stringify({
            url: "https://example.com/photo.jpg",
            type: "image",
          }),
        }),
      );
      expect(response.status).toBe(429);
    });

    it("rejects when 3 media items already exist", async () => {
      const mockRouter = createRouter({
        handler: (sql) => {
          if (sql.includes("SELECT subscription_tier, daily_media_used")) {
            return {
              results: [
                {
                  subscription_tier: "free",
                  daily_media_used: 2,
                  daily_media_reset_at: "2025-06-01T00:00:00.000Z",
                },
              ],
            };
          }
          if (sql.includes("SELECT media_urls FROM users")) {
            return {
              results: [
                {
                  media_urls: JSON.stringify([
                    { url: "a.jpg", type: "image", uploadedAt: "2025-01-01" },
                    { url: "b.jpg", type: "image", uploadedAt: "2025-01-02" },
                    { url: "c.jpg", type: "image", uploadedAt: "2025-01-03" },
                  ]),
                },
              ],
            };
          }
          return { results: [], success: true, meta: {} };
        },
      });
      const response = await mockRouter.route(
        new Request("http://api/users/u1/media", {
          method: "POST",
          body: JSON.stringify({
            url: "https://example.com/photo.jpg",
            type: "image",
          }),
        }),
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toContain("Maximum 3");
    });
  });

  describe("DELETE /users/:id/media", () => {
    it("deletes media and returns 200", async () => {
      const mockRouter = createRouter({
        handler: (sql) => {
          if (sql.includes("SELECT media_urls FROM users")) {
            return {
              results: [
                {
                  media_urls: JSON.stringify([
                    {
                      url: "https://example.com/photo.jpg",
                      type: "image",
                      uploadedAt: "2025-01-01",
                    },
                  ]),
                },
              ],
            };
          }
          return { results: [], success: true, meta: {} };
        },
      });
      const response = await mockRouter.route(
        new Request("http://api/users/u1/media", {
          method: "DELETE",
          body: JSON.stringify({ url: "https://example.com/photo.jpg" }),
        }),
      );
      expect(response.status).toBe(200);
    });

    it("rejects delete without URL", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/media", {
          method: "DELETE",
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
    });

    it("rejects delete when URL does not belong to user", async () => {
      const mockRouter = createRouter({
        handler: (sql) => {
          if (sql.includes("SELECT media_urls FROM users")) {
            return {
              results: [
                {
                  media_urls: JSON.stringify([
                    {
                      url: "https://example.com/other.jpg",
                      type: "image",
                      uploadedAt: "2025-01-01",
                    },
                  ]),
                },
              ],
            };
          }
          return { results: [], success: true, meta: {} };
        },
      });
      const response = await mockRouter.route(
        new Request("http://api/users/u1/media", {
          method: "DELETE",
          body: JSON.stringify({ url: "https://example.com/photo.jpg" }),
        }),
      );
      expect(response.status).toBe(403);
    });
  });

  // -----------------------------------------------------------------------
  // Profile routes
  // -----------------------------------------------------------------------

  describe("POST /users/:id/restore-profile", () => {
    it("restores profile successfully", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/restore-profile", { method: "POST" }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
    });
  });

  describe("POST /users/:id/last-reminded-at", () => {
    it("updates last reminded at", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/last-reminded-at", { method: "POST" }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Error report routes
  // -----------------------------------------------------------------------

  describe("POST /error-reports", () => {
    it("creates an error report", async () => {
      const response = await router.route(
        new Request("http://api/error-reports", {
          method: "POST",
          body: JSON.stringify({ reporterId: "u1", message: "Error occurred" }),
        }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.success).toBe(true);
      expect(body.reportId).toBeTruthy();
    });

    it("rejects error-report without reporterId", async () => {
      const response = await router.route(
        new Request("http://api/error-reports", {
          method: "POST",
          body: JSON.stringify({ message: "Error" }),
        }),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("GET /error-reports/summary", () => {
    it("returns error report summary", async () => {
      const response = await router.route(
        new Request("http://api/error-reports/summary"),
      );
      expect(response.status).toBe(200);
    });

    it("accepts hours parameter", async () => {
      const response = await router.route(
        new Request("http://api/error-reports/summary?hours=12"),
      );
      expect(response.status).toBe(200);
    });
  });

  describe("POST /error-reports/mark-sent", () => {
    it("marks alerts as sent", async () => {
      const mockRouter = createRouter({
        handler: (sql) => {
          if (sql.includes("SELECT id, reporter_id as reporterId")) {
            return {
              results: [
                {
                  id: "r1",
                  reporterId: "u1",
                  traceId: null,
                  message: null,
                  journey: null,
                  status: "pending",
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
                  createdAt: "2025-01-01",
                  updatedAt: null,
                },
              ],
            };
          }
          return { results: [], success: true, meta: {} };
        },
      });
      const response = await mockRouter.route(
        new Request("http://api/error-reports/mark-sent", { method: "POST" }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.marked).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // Geocode routes
  // -----------------------------------------------------------------------

  describe("GET /geocode validation", () => {
    it("returns 400 when neither query nor lat/lon provided", async () => {
      const response = await router.route(new Request("http://api/geocode"));
      expect(response.status).toBe(400);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body.error).toContain("Missing");
    });

    it("returns 400 for invalid lat", async () => {
      const response = await router.route(
        new Request("http://api/geocode?lat=100&lon=0"),
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid lon", async () => {
      const response = await router.route(
        new Request("http://api/geocode?lat=0&lon=200"),
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 for non-numeric lat", async () => {
      const response = await router.route(
        new Request("http://api/geocode?lat=abc&lon=0"),
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 for invalid limit in search", async () => {
      const response = await router.route(
        new Request("http://api/geocode?q=test&limit=100"),
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 for limit below 1", async () => {
      const response = await router.route(
        new Request("http://api/geocode?q=test&limit=0"),
      );
      expect(response.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases and error paths
  // -----------------------------------------------------------------------

  describe("path parsing edge cases", () => {
    it("returns 400 for potential-matches without user id", async () => {
      const response = await router.route(
        new Request("http://api/users//potential-matches"),
      );
      expect(response.status).toBe(400);
    });

    it("returns 400 for pending-likes without user id", async () => {
      const response = await router.route(
        new Request("http://api/users//pending-likes"),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("match routes additional", () => {
    it("rejects match list without userId", async () => {
      const response = await router.route(new Request("http://api/matches"));
      expect(response.status).toBe(400);
    });

    it("rejects matches with invalid limit", async () => {
      const response = await router.route(
        new Request("http://api/matches?userId=u1&limit=200"),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("report route", () => {
    it("rejects report without reporterId", async () => {
      const response = await router.route(
        new Request("http://api/users/u2/report", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
    });
  });

  describe("block/unblock", () => {
    it("rejects unblock without blockedId", async () => {
      const response = await router.route(
        new Request("http://api/users/u1/unblock", {
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
    });
  });
});
