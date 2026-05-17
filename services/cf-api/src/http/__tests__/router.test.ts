import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApiRouter } from "../router.js";
import {
  createMockD1,
  createMockKV,
  createMockQueue,
  createMockR2,
} from "../../../../../packages/cf-shared/src/__tests__/__helpers__/test-utils.js";

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
      const body = (await response.json()) as { error: string };
      expect(body.error).toBe("Not Found");
    });

    it("returns health status", async () => {
      const response = await router.route(new Request("http://api/health"));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { status: string; service: string };
      expect(body.status).toBe("ok");
      expect(body.service).toBe("cf-api");
    });

    it("routes GET /users/:id", async () => {
      const response = await router.route(new Request("http://api/users/123"));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { user: unknown };
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
      const body = (await response.json()) as { potentialMatches: unknown[] };
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
      const body = (await response.json()) as { matches: unknown[] };
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

    it("routes GET /geocode with query", async () => {
      const response = await router.route(
        new Request("http://api/geocode?q=paris&limit=1"),
      );
      expect([200, 500]).toContain(response.status);
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
      const body = (await response.json()) as { success: boolean };
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
  });
});
