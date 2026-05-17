import { describe, it, expect, vi } from "vitest";
import { runSubscriptionExpiryJob } from "../subscriptionExpiry.js";

describe("runSubscriptionExpiryJob", () => {
  const createEnv = (apiResponse?: { ok: boolean; status?: number; json?: unknown }) => ({
    API_SERVICE: {
      fetch: vi.fn(async () => ({
        ok: apiResponse?.ok ?? true,
        status: apiResponse?.status ?? 200,
        text: async () => "ok",
        json: async () => apiResponse?.json ?? {},
      })),
    },
  } as unknown as import("../index.js").Env);

  it("calls the downgrade endpoint", async () => {
    const env = createEnv({ ok: true, json: { downgraded: 3 } });
    await runSubscriptionExpiryJob(env);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledTimes(1);
    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    expect(req.url).toBe("http://api/cron/downgrade-expired-subscriptions");
    expect(req.method).toBe("POST");
  });

  it("handles API error gracefully", async () => {
    const env = createEnv({ ok: false, status: 500 });
    await expect(runSubscriptionExpiryJob(env)).resolves.not.toThrow();
  });

  it("handles fetch exception gracefully", async () => {
    const env = {
      API_SERVICE: {
        fetch: vi.fn(() => Promise.reject(new Error("network"))),
      },
    } as unknown as import("../index.js").Env;
    await expect(runSubscriptionExpiryJob(env)).resolves.not.toThrow();
  });
});
