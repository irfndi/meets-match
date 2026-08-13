import { describe, it, expect, vi } from "vitest";
import { runSubscriptionExpiryJob } from "../subscriptionExpiry.js";

interface TestCastInput {}

function castForTest<T>(value: TestCastInput): T {
  return value as T;
}

describe("runSubscriptionExpiryJob", () => {
  const createEnv = (apiResponse?: {
    ok: boolean;
    status?: number;
    json?: unknown;
  }) => ({
    API_SERVICE: castForTest<import("@cloudflare/workers-types").Fetcher>({
      fetch: vi.fn(async () => ({
        ok: apiResponse?.ok ?? true,
        status: apiResponse?.status ?? 200,
        text: async () => "ok",
        json: async () => apiResponse?.json ?? {},
      })),
      connect: vi.fn(),
    }),
    KV: castForTest<import("@cloudflare/workers-types").KVNamespace>({}),
    NOTIFICATION_QUEUE: {
      send: vi.fn(async () => {}),
    } as Queue & object,
    BOT_SERVICE: castForTest<import("@cloudflare/workers-types").Fetcher>({
      fetch: vi.fn(async () => new Response()),
      connect: vi.fn(),
    }),
    DB: castForTest<import("@cloudflare/workers-types").D1Database>({}),
  });

  it("calls the downgrade endpoint", async () => {
    const env = createEnv({ ok: true, json: { downgraded: 3 } });
    await runSubscriptionExpiryJob(env);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledTimes(1);
    const req = castForTest<Request>(
      (env.API_SERVICE.fetch as any).mock.calls[0][0],
    );
    expect(req.url).toBe("http://api/cron/downgrade-expired-subscriptions");
    expect(req.method).toBe("POST");
  });

  it("handles API error gracefully", async () => {
    const env = createEnv({ ok: false, status: 500 });
    await expect(runSubscriptionExpiryJob(env)).resolves.toBeUndefined();
  });

  it("handles fetch exception gracefully", async () => {
    const env = {
      API_SERVICE: castForTest<import("@cloudflare/workers-types").Fetcher>({
        fetch: vi.fn(() => Promise.reject(new Error("network"))),
        connect: vi.fn(),
      }),
      KV: castForTest<import("@cloudflare/workers-types").KVNamespace>({}),
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as Queue & object,
      BOT_SERVICE: castForTest<import("@cloudflare/workers-types").Fetcher>({
        fetch: vi.fn(async () => new Response()),
        connect: vi.fn(),
      }),
      DB: castForTest<import("@cloudflare/workers-types").D1Database>({}),
    };
    await expect(runSubscriptionExpiryJob(env)).rejects.toThrow();
  });

  it("handles API response with zero downgraded subscriptions", async () => {
    const env = createEnv({ ok: true, json: { downgraded: 0 } });
    await runSubscriptionExpiryJob(env);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledTimes(1);
  });

  it("handles API response with missing downgraded field", async () => {
    const env = createEnv({ ok: true, json: {} });
    await runSubscriptionExpiryJob(env);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledTimes(1);
  });
});
