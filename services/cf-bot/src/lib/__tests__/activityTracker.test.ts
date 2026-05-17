import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  activityTrackerMiddleware,
  lastActiveCache,
} from "../activityTracker.js";

// ================================================================
// Helpers
// ================================================================

function createMockApiFetch() {
  return vi.fn().mockImplementation((req: Request) => {
    const url = String(req.url);
    if (url.includes("/last-active") && req.method === "POST") {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
  });
}

function createEnv(apiFetch?: ReturnType<typeof createMockApiFetch>) {
  return {
    API_SERVICE: {
      fetch: apiFetch ?? createMockApiFetch(),
    },
    DB: {} as D1Database,
    KV: {} as KVNamespace,
    BOT_TOKEN: "test-token",
  } as any;
}

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    from: {
      id: 123,
      first_name: "Test",
      is_bot: false,
      language_code: "en",
    },
    ...overrides,
  } as any;
}

function createNext() {
  return vi.fn().mockResolvedValue(undefined);
}

// ================================================================
// lastActiveCache
// ================================================================

describe("lastActiveCache", () => {
  beforeEach(() => {
    lastActiveCache.clear();
  });

  it("is a Map", () => {
    expect(lastActiveCache).toBeInstanceOf(Map);
  });

  it("stores timestamps for userIds", () => {
    lastActiveCache.set("123", 1700000000000);
    expect(lastActiveCache.get("123")).toBe(1700000000000);
  });

  it("can be cleared", () => {
    lastActiveCache.set("123", Date.now());
    lastActiveCache.set("456", Date.now());
    expect(lastActiveCache.size).toBe(2);

    lastActiveCache.clear();
    expect(lastActiveCache.size).toBe(0);
    expect(lastActiveCache.get("123")).toBeUndefined();
  });

  it("supports Map methods like has, delete, forEach", () => {
    lastActiveCache.set("123", 1000);
    lastActiveCache.set("456", 2000);

    expect(lastActiveCache.has("123")).toBe(true);
    expect(lastActiveCache.has("999")).toBe(false);

    lastActiveCache.delete("123");
    expect(lastActiveCache.has("123")).toBe(false);
    expect(lastActiveCache.size).toBe(1);

    const entries: Array<[string, number]> = [];
    lastActiveCache.forEach((val, key) => entries.push([key, val]));
    expect(entries).toEqual([["456", 2000]]);
  });
});

// ================================================================
// activityTrackerMiddleware
// ================================================================

describe("activityTrackerMiddleware", () => {
  let apiFetch: ReturnType<typeof createMockApiFetch>;
  let env: ReturnType<typeof createEnv>;

  beforeEach(() => {
    lastActiveCache.clear();
    apiFetch = createMockApiFetch();
    env = createEnv(apiFetch);
  });

  // ----------------------------------------------------------------
  // Core: next() always called
  // ----------------------------------------------------------------

  it("calls next() when ctx.from exists", async () => {
    const next = createNext();
    const ctx = createMockCtx();
    const middleware = activityTrackerMiddleware(env);

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() even when ctx.from is missing", async () => {
    const next = createNext();
    const ctx = createMockCtx({ from: undefined });
    const middleware = activityTrackerMiddleware(env);

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() even when ctx.from.id is undefined", async () => {
    const next = createNext();
    const ctx = createMockCtx({ from: { first_name: "NoID" } });
    const middleware = activityTrackerMiddleware(env);

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("calls next() even when API fetch throws an error", async () => {
    const next = createNext();
    const ctx = createMockCtx();
    env.API_SERVICE.fetch = vi
      .fn()
      .mockRejectedValue(new Error("Network failure"));
    const middleware = activityTrackerMiddleware(env);

    await middleware(ctx, next);

    expect(next).toHaveBeenCalledOnce();
  });

  // ----------------------------------------------------------------
  // Skip when ctx.from is missing
  // ----------------------------------------------------------------

  it("skips API call and cache update when ctx.from is missing", async () => {
    const next = createNext();
    const ctx = createMockCtx({ from: undefined });
    const middleware = activityTrackerMiddleware(env);

    await middleware(ctx, next);

    expect(apiFetch).not.toHaveBeenCalled();
    expect(lastActiveCache.size).toBe(0);
  });

  it("skips API call and cache update when ctx.from.id is undefined", async () => {
    const next = createNext();
    const ctx = createMockCtx({ from: { first_name: "NoID", is_bot: false } });
    const middleware = activityTrackerMiddleware(env);

    await middleware(ctx, next);

    expect(apiFetch).not.toHaveBeenCalled();
    expect(lastActiveCache.size).toBe(0);
  });

  // ----------------------------------------------------------------
  // Uses userId from ctx.from.id
  // ----------------------------------------------------------------

  it("uses userId derived from ctx.from.id (number)", async () => {
    const next = createNext();
    const ctx = createMockCtx({
      from: { id: 7890, first_name: "Alice", is_bot: false },
    });
    const middleware = activityTrackerMiddleware(env);

    await middleware(ctx, next);

    expect(lastActiveCache.has("7890")).toBe(true);
  });

  it("calls API with correct userId as string", async () => {
    const next = createNext();
    const ctx = createMockCtx({
      from: { id: 4242, first_name: "Bob", is_bot: false },
    });
    const middleware = activityTrackerMiddleware(env);

    await middleware(ctx, next);

    // Verify the fetch was called with a URL containing the userId
    const [[request]] = apiFetch.mock.calls;
    const url = String(request.url);
    expect(url).toContain("/users/4242/last-active");
    expect(request.method).toBe("POST");
  });

  // ----------------------------------------------------------------
  // Debounce: skips update within DEBOUNCE_WINDOW_MS (5 minutes)
  // ----------------------------------------------------------------

  it("calls API on first invocation (no cache entry)", async () => {
    const next = createNext();
    const ctx = createMockCtx();
    const middleware = activityTrackerMiddleware(env);

    expect(lastActiveCache.has("123")).toBe(false);

    await middleware(ctx, next);

    expect(apiFetch).toHaveBeenCalled();
    expect(lastActiveCache.has("123")).toBe(true);
  });

  it("skips API call when within debounce window (5 minutes)", async () => {
    const now = 1700000000000;
    const insideWindow = now - 200_000; // 200 seconds ago, within 5 min (300s)
    lastActiveCache.set("123", insideWindow);

    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      const next = createNext();
      const ctx = createMockCtx();
      const middleware = activityTrackerMiddleware(env);

      await middleware(ctx, next);

      expect(apiFetch).not.toHaveBeenCalled();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("updates last active when outside debounce window (after 5 minutes)", async () => {
    const now = 1700000000000;
    const outsideWindow = now - 400_000; // 400 seconds ago, outside 5 min (300s)
    lastActiveCache.set("123", outsideWindow);

    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      const next = createNext();
      const ctx = createMockCtx();
      const middleware = activityTrackerMiddleware(env);

      await middleware(ctx, next);

      expect(apiFetch).toHaveBeenCalled();
      // Cache should be updated with the new timestamp
      expect(lastActiveCache.get("123")).toBe(now);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("skips API call exactly at the debounce boundary (now - lastUpdate === DEBOUNCE_WINDOW_MS)", async () => {
    const now = 1700000000000;
    const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000; // 300,000
    const atBoundary = now - DEBOUNCE_WINDOW_MS;
    lastActiveCache.set("123", atBoundary);

    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      const next = createNext();
      const ctx = createMockCtx();
      const middleware = activityTrackerMiddleware(env);

      await middleware(ctx, next);

      // At the boundary, the condition is `now - lastUpdate > DEBOUNCE_WINDOW_MS`
      // 300000 > 300000 is false, so it should NOT update
      expect(apiFetch).not.toHaveBeenCalled();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("updates just past the debounce boundary (now - lastUpdate === DEBOUNCE_WINDOW_MS + 1)", async () => {
    const now = 1700000000000;
    const DEBOUNCE_WINDOW_MS = 5 * 60 * 1000;
    const justPast = now - DEBOUNCE_WINDOW_MS - 1;
    lastActiveCache.set("123", justPast);

    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      const next = createNext();
      const ctx = createMockCtx();
      const middleware = activityTrackerMiddleware(env);

      await middleware(ctx, next);

      // now - lastUpdate === 300001 > 300000 -> true -> should update
      expect(apiFetch).toHaveBeenCalled();
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("updates cache timestamp after successful debounce bypass", async () => {
    const now = 1700000000000;
    // Set a very old timestamp so we bypass debounce
    lastActiveCache.set("123", now - 1_000_000);

    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      const next = createNext();
      const ctx = createMockCtx();
      const middleware = activityTrackerMiddleware(env);

      await middleware(ctx, next);

      expect(lastActiveCache.get("123")).toBe(now);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  // ----------------------------------------------------------------
  // Cache clearing at max size (10,000)
  // ----------------------------------------------------------------

  it("clears cache when size reaches MAX_CACHE_SIZE (10000)", async () => {
    const now = 1700000000000;
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      // Fill cache to exactly 10000 entries with different userIds
      for (let i = 0; i < 10000; i++) {
        lastActiveCache.set(`user_${i}`, now - 1_000_000);
      }

      expect(lastActiveCache.size).toBe(10000);

      const next = createNext();
      // Use a new userId not in the cache so it triggers the update path
      const ctx = createMockCtx({
        from: { id: 99999, first_name: "Full", is_bot: false },
      });
      const middleware = activityTrackerMiddleware(env);

      await middleware(ctx, next);

      // After clear, the cache should contain only the new user
      expect(lastActiveCache.size).toBe(1);
      expect(lastActiveCache.has("99999")).toBe(true);

      // The old entries should be gone
      expect(lastActiveCache.has("user_0")).toBe(false);
      expect(lastActiveCache.has("user_5000")).toBe(false);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("does NOT clear cache when size is just under MAX_CACHE_SIZE (9999)", async () => {
    const now = 1700000000000;
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      // Fill cache to 9999 entries
      for (let i = 0; i < 9999; i++) {
        lastActiveCache.set(`user_${i}`, now - 1_000_000);
      }

      expect(lastActiveCache.size).toBe(9999);

      const next = createNext();
      const ctx = createMockCtx({
        from: { id: 99999, first_name: "Under", is_bot: false },
      });
      const middleware = activityTrackerMiddleware(env);

      await middleware(ctx, next);

      // Cache should have 10000 entries (9999 old + 1 new), not be cleared
      expect(lastActiveCache.size).toBe(10000);
      expect(lastActiveCache.has("99999")).toBe(true);
      expect(lastActiveCache.has("user_0")).toBe(true); // old entries preserved
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  // ----------------------------------------------------------------
  // Graceful error handling
  // ----------------------------------------------------------------

  it("handles API fetch throwing an error gracefully (does not throw)", async () => {
    const next = createNext();
    const ctx = createMockCtx();
    env.API_SERVICE.fetch = vi
      .fn()
      .mockRejectedValue(new Error("Network down"));

    const middleware = activityTrackerMiddleware(env);

    // Should not throw
    await expect(middleware(ctx, next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it("handles API returning a non-ok response (e.g. 500) gracefully", async () => {
    const next = createNext();
    const ctx = createMockCtx();

    // ApiServiceClient.updateLastActive checks response.ok and throws if not ok
    env.API_SERVICE.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Internal Server Error" }), {
          status: 500,
        }),
      );

    const middleware = activityTrackerMiddleware(env);

    // Should not throw -- the try/catch in the middleware catches the ApiServiceClient error
    await expect(middleware(ctx, next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it("handles API returning a 404 gracefully", async () => {
    const next = createNext();
    const ctx = createMockCtx();

    env.API_SERVICE.fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 404 }));

    const middleware = activityTrackerMiddleware(env);

    await expect(middleware(ctx, next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it("still updates cache even when API call fails", async () => {
    const now = 1700000000000;
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      const next = createNext();
      const ctx = createMockCtx();

      env.API_SERVICE.fetch = vi
        .fn()
        .mockRejectedValue(new Error("Network failure"));

      const middleware = activityTrackerMiddleware(env);

      await middleware(ctx, next);

      // API failed, but cache should still be set (debounce still applies)
      expect(lastActiveCache.has("123")).toBe(true);
      expect(lastActiveCache.get("123")).toBe(now);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("handles API returning invalid JSON response gracefully", async () => {
    const next = createNext();
    const ctx = createMockCtx();

    // response.json() will reject if body is not valid JSON
    env.API_SERVICE.fetch = vi
      .fn()
      .mockResolvedValue(new Response("not valid json", { status: 200 }));

    const middleware = activityTrackerMiddleware(env);

    await expect(middleware(ctx, next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it("handles API response with missing .json method gracefully", async () => {
    const next = createNext();
    const ctx = createMockCtx();

    // Edge case: response that somehow lacks .json()
    const badResponse = {
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token")),
    };
    env.API_SERVICE.fetch = vi.fn().mockResolvedValue(badResponse);

    const middleware = activityTrackerMiddleware(env);

    await expect(middleware(ctx, next)).resolves.toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  // ----------------------------------------------------------------
  // Multiple user interaction
  // ----------------------------------------------------------------

  it("tracks multiple different users independently", async () => {
    const now = 1700000000000;
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      const next1 = createNext();
      const next2 = createNext();

      const ctx1 = createMockCtx({
        from: { id: 111, first_name: "User1", is_bot: false },
      });
      const ctx2 = createMockCtx({
        from: { id: 222, first_name: "User2", is_bot: false },
      });

      const middleware = activityTrackerMiddleware(env);

      await middleware(ctx1, next1);
      await middleware(ctx2, next2);

      expect(lastActiveCache.has("111")).toBe(true);
      expect(lastActiveCache.has("222")).toBe(true);
      expect(lastActiveCache.size).toBe(2);

      // Both should have called the API twice
      expect(apiFetch).toHaveBeenCalledTimes(2);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it("debounces the same user across multiple rapid calls", async () => {
    const now = 1700000000000;
    const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(now);

    try {
      const middleware = activityTrackerMiddleware(env);

      // First call -- should go through
      await middleware(createMockCtx(), createNext());
      expect(apiFetch).toHaveBeenCalledTimes(1);

      // Second call with same user immediately -- should be debounced
      await middleware(createMockCtx(), createNext());
      expect(apiFetch).toHaveBeenCalledTimes(1); // still 1, no additional call
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  // ----------------------------------------------------------------
  // Type coercion and edge case userId values
  // ----------------------------------------------------------------

  it("converts numeric userId to string correctly", async () => {
    const next = createNext();
    // Use id: 5 to verify String() conversion (id: 0 is falsy so it'd be skipped)
    const ctx = createMockCtx({
      from: { id: 5, first_name: "Five", is_bot: false },
    });
    const middleware = activityTrackerMiddleware(env);

    await middleware(ctx, next);

    expect(lastActiveCache.has("5")).toBe(true);
    expect(typeof lastActiveCache.get("5")).toBe("number");
  });

  it("converts large numeric userId to string correctly", async () => {
    const next = createNext();
    const largeId = 9876543210;
    const ctx = createMockCtx({
      from: { id: largeId, first_name: "Large", is_bot: false },
    });
    const middleware = activityTrackerMiddleware(env);

    await middleware(ctx, next);

    expect(lastActiveCache.has(String(largeId))).toBe(true);
  });
});
