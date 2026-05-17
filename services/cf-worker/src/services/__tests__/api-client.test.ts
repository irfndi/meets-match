import { describe, it, expect, vi } from "vitest";
import type { Fetcher } from "@cloudflare/workers-types";
import { ApiServiceClient } from "../api-client.js";

interface MockResponseInit {
  ok: boolean;
  status: number;
  data: unknown;
}

function createMockFetcher(response: MockResponseInit) {
  return {
    fetch: vi.fn(async () => ({
      ok: response.ok,
      status: response.status,
      json: async () => response.data,
    })),
  } as unknown as Fetcher;
}

function getRequest(mock: any, callIndex = 0): Request {
  return mock.mock.calls[callIndex][0] as unknown as Request;
}

async function requestBodyAsJson(req: Request): Promise<unknown> {
  return req.clone().json();
}

/** Construct a success response. */
function okResponse(data: unknown): MockResponseInit {
  return { ok: true, status: 200, data };
}

/** Construct a failure response. */
function errorResponse(status: number): MockResponseInit {
  return { ok: false, status, data: null };
}



describe("ApiServiceClient", () => {
  // ---- getUser -------------------------------------------------------------
  describe("getUser", () => {
    it("returns the parsed JSON user on success", async () => {
      const mockUser = { id: "u1", displayName: "Alice" };
      const mock = createMockFetcher(okResponse({ user: mockUser }));
      const client = new ApiServiceClient(mock);

      const result = await client.getUser({ userId: "u1" });

      expect(result).toEqual({ user: mockUser });
    });

    it("throws an Error containing the HTTP status on failure", async () => {
      const mock = createMockFetcher(errorResponse(404));
      const client = new ApiServiceClient(mock);

      await expect(client.getUser({ userId: "u2" })).rejects.toThrow(
        "API error: 404",
      );
    });

    it("sends a GET request to /users/:userId", async () => {
      const mock = createMockFetcher(okResponse({ user: { id: "u3" } }));
      const client = new ApiServiceClient(mock);

      await client.getUser({ userId: "u3" });

      const req = getRequest(mock.fetch);
      expect(req.method).toBe("GET");
      expect(req.url).toBe("http://api/users/u3");
    });
  });

  // ---- getReengagementCandidates -------------------------------------------
  describe("getReengagementCandidates", () => {
    it("returns parsed userIds on success", async () => {
      const mock = createMockFetcher(
        okResponse({ userIds: ["a", "b", "c"] }),
      );
      const client = new ApiServiceClient(mock);

      const result = await client.getReengagementCandidates({
        minInactiveDays: 7,
        maxInactiveDays: 30,
        limit: 50,
      });

      expect(result).toEqual({ userIds: ["a", "b", "c"] });
    });

    it("throws an Error containing the HTTP status on failure", async () => {
      const mock = createMockFetcher(errorResponse(500));
      const client = new ApiServiceClient(mock);

      await expect(
        client.getReengagementCandidates({ limit: 10 }),
      ).rejects.toThrow("API error: 500");
    });

    it("sends a GET request to /users/reengagement with all query params", async () => {
      const mock = createMockFetcher(okResponse({ userIds: [] }));
      const client = new ApiServiceClient(mock);

      await client.getReengagementCandidates({
        minInactiveDays: 7,
        maxInactiveDays: 30,
        limit: 100,
      });

      const req = getRequest(mock.fetch);
      expect(req.method).toBe("GET");
      expect(req.url).toBe(
        "http://api/users/reengagement?minInactiveDays=7&maxInactiveDays=30&limit=100",
      );
    });

    it("omits undefined optional query params", async () => {
      const mock = createMockFetcher(okResponse({ userIds: [] }));
      const client = new ApiServiceClient(mock);

      await client.getReengagementCandidates({ limit: 5 });

      const req = getRequest(mock.fetch);
      expect(req.url).toBe("http://api/users/reengagement?limit=5");
    });

    it("sends trailing ? when all params are undefined (URLSearchParams.toString is empty)", async () => {
      const mock = createMockFetcher(okResponse({ userIds: [] }));
      const client = new ApiServiceClient(mock);

      await client.getReengagementCandidates({});

      const req = getRequest(mock.fetch);
      // URLSearchParams.toString() returns "" when empty, so URL becomes "...?"
      expect(req.url).toBe("http://api/users/reengagement?");
    });

    it("sends only minInactiveDays when it is the sole param", async () => {
      const mock = createMockFetcher(okResponse({ userIds: [] }));
      const client = new ApiServiceClient(mock);

      await client.getReengagementCandidates({ minInactiveDays: 14 });

      const req = getRequest(mock.fetch);
      expect(req.url).toBe(
        "http://api/users/reengagement?minInactiveDays=14",
      );
    });

    it("sends only maxInactiveDays when it is the sole param", async () => {
      const mock = createMockFetcher(okResponse({ userIds: [] }));
      const client = new ApiServiceClient(mock);

      await client.getReengagementCandidates({ maxInactiveDays: 60 });

      const req = getRequest(mock.fetch);
      expect(req.url).toBe(
        "http://api/users/reengagement?maxInactiveDays=60",
      );
    });

    it("sends minInactiveDays and maxInactiveDays without limit", async () => {
      const mock = createMockFetcher(okResponse({ userIds: [] }));
      const client = new ApiServiceClient(mock);

      await client.getReengagementCandidates({
        minInactiveDays: 1,
        maxInactiveDays: 10,
      });

      const req = getRequest(mock.fetch);
      expect(req.url).toBe(
        "http://api/users/reengagement?minInactiveDays=1&maxInactiveDays=10",
      );
    });
  });

  // ---- createUser ----------------------------------------------------------
  describe("createUser", () => {
    const userPayload = { id: "new-user", displayName: "Bob" };

    it("returns the parsed JSON user on success", async () => {
      const mock = createMockFetcher(okResponse({ user: userPayload }));
      const client = new ApiServiceClient(mock);

      const result = await client.createUser({ user: userPayload });

      expect(result).toEqual({ user: userPayload });
    });

    it("throws an Error containing the HTTP status on failure", async () => {
      const mock = createMockFetcher(errorResponse(400));
      const client = new ApiServiceClient(mock);

      await expect(
        client.createUser({ user: userPayload }),
      ).rejects.toThrow("API error: 400");
    });

    it("sends a POST request to /users with JSON body and Content-Type header", async () => {
      const mock = createMockFetcher(okResponse({ user: userPayload }));
      const client = new ApiServiceClient(mock);

      await client.createUser({ user: userPayload });

      const req = getRequest(mock.fetch);
      expect(req.method).toBe("POST");
      expect(req.url).toBe("http://api/users");
      expect(req.headers.get("Content-Type")).toBe("application/json");

      const body = await requestBodyAsJson(req);
      expect(body).toEqual({ user: userPayload });
    });
  });

  // ---- updateUser ----------------------------------------------------------
  describe("updateUser", () => {
    const userPayload = { id: "u4", displayName: "Updated" };

    it("returns the parsed JSON user on success", async () => {
      const mock = createMockFetcher(okResponse({ user: userPayload }));
      const client = new ApiServiceClient(mock);

      const result = await client.updateUser({
        userId: "u4",
        user: userPayload,
      });

      expect(result).toEqual({ user: userPayload });
    });

    it("throws an Error containing the HTTP status on failure", async () => {
      const mock = createMockFetcher(errorResponse(404));
      const client = new ApiServiceClient(mock);

      await expect(
        client.updateUser({ userId: "u4", user: userPayload }),
      ).rejects.toThrow("API error: 404");
    });

    it("sends a PUT request to /users/:userId with JSON body and Content-Type header", async () => {
      const mock = createMockFetcher(okResponse({ user: userPayload }));
      const client = new ApiServiceClient(mock);

      await client.updateUser({
        userId: "u4",
        user: userPayload,
        updateMask: ["displayName"],
      });

      const req = getRequest(mock.fetch);
      expect(req.method).toBe("PUT");
      expect(req.url).toBe("http://api/users/u4");
      expect(req.headers.get("Content-Type")).toBe("application/json");

      const body = await requestBodyAsJson(req);
      expect(body).toEqual({
        userId: "u4",
        user: userPayload,
        updateMask: ["displayName"],
      });
    });

    it("omits updateMask from JSON body when not provided", async () => {
      const mock = createMockFetcher(okResponse({ user: userPayload }));
      const client = new ApiServiceClient(mock);

      await client.updateUser({ userId: "u4", user: userPayload });

      const req = getRequest(mock.fetch);
      const body = await requestBodyAsJson(req);
      // JSON.stringify omits undefined values, so body has userId + user only
      expect(body).toEqual({ userId: "u4", user: userPayload });
    });
  });

  // ---- updateLastActive ----------------------------------------------------
  describe("updateLastActive", () => {
    it("returns { success: true } on success", async () => {
      const mock = createMockFetcher(okResponse({ success: true }));
      const client = new ApiServiceClient(mock);

      const result = await client.updateLastActive({ userId: "u5" });

      expect(result).toEqual({ success: true });
    });

    it("throws an Error containing the HTTP status on failure", async () => {
      const mock = createMockFetcher(errorResponse(500));
      const client = new ApiServiceClient(mock);

      await expect(
        client.updateLastActive({ userId: "u5" }),
      ).rejects.toThrow("API error: 500");
    });

    it("sends a POST request to /users/:userId/last-active with no body", async () => {
      const mock = createMockFetcher(okResponse({ success: true }));
      const client = new ApiServiceClient(mock);

      await client.updateLastActive({ userId: "u5" });

      const req = getRequest(mock.fetch);
      expect(req.method).toBe("POST");
      expect(req.url).toBe("http://api/users/u5/last-active");
    });
  });

  // ---- updateLastRemindedAt ------------------------------------------------
  describe("updateLastRemindedAt", () => {
    it("returns { success: true } on success", async () => {
      const mock = createMockFetcher(okResponse({ success: true }));
      const client = new ApiServiceClient(mock);

      const result = await client.updateLastRemindedAt({ userId: "u6" });

      expect(result).toEqual({ success: true });
    });

    it("throws an Error containing the HTTP status on failure", async () => {
      const mock = createMockFetcher(errorResponse(503));
      const client = new ApiServiceClient(mock);

      await expect(
        client.updateLastRemindedAt({ userId: "u6" }),
      ).rejects.toThrow("API error: 503");
    });

    it("sends a POST request to /users/:userId/last-reminded-at with no body", async () => {
      const mock = createMockFetcher(okResponse({ success: true }));
      const client = new ApiServiceClient(mock);

      await client.updateLastRemindedAt({ userId: "u6" });

      const req = getRequest(mock.fetch);
      expect(req.method).toBe("POST");
      expect(req.url).toBe("http://api/users/u6/last-reminded-at");
    });
  });

  // ---- Edge cases across methods -------------------------------------------
  describe("error message format", () => {
    it("includes the HTTP status code in the error message", async () => {
      const mock = createMockFetcher(errorResponse(418));
      const client = new ApiServiceClient(mock);

      await expect(client.getUser({ userId: "x" })).rejects.toThrow(
        "API error: 418",
      );
    });

    it("throws an instance of Error (not a plain object)", async () => {
      const mock = createMockFetcher(errorResponse(500));
      const client = new ApiServiceClient(mock);

      let caught: unknown;
      try {
        await client.getUser({ userId: "x" });
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(Error);
    });
  });
});
