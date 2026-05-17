import { describe, it, expect, vi } from "vitest";
import { runDLQHealthCheck } from "../dlqHealth.js";

describe("runDLQHealthCheck", () => {
  const createEnv = (counts: { dlq?: number; expired?: number } = {}) => ({
    DB: {
      prepare: vi.fn((sql: string) => {
        const isExpired = sql.includes("dlq_at");
        const c = isExpired ? (counts.expired ?? 0) : (counts.dlq ?? 0);
        return {
          first: vi.fn(async () => ({ c })),
          bind: vi.fn(() => ({
            first: vi.fn(async () => ({ c })),
            all: vi.fn(async () => ({ results: [] })),
            run: vi.fn(async () => ({ success: true })),
          })),
        };
      }),
    } as unknown as import("@cloudflare/workers-types").D1Database,
    KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
    API_SERVICE: {
      fetch: vi.fn(async () => new Response()),
    } as unknown as import("@cloudflare/workers-types").Fetcher,
    BOT_SERVICE: {
      fetch: vi.fn(async () => new Response()),
    } as unknown as import("@cloudflare/workers-types").Fetcher,
  });

  it("logs DLQ count when below threshold", async () => {
    const env = createEnv({ dlq: 50 });
    await runDLQHealthCheck(env);
    expect(env.DB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("status = 'dlq'"),
    );
  });

  it("logs alert when DLQ exceeds threshold", async () => {
    const env = createEnv({ dlq: 150 });
    await runDLQHealthCheck(env);
    expect(env.DB.prepare).toHaveBeenCalled();
  });

  it("reports expired DLQ messages", async () => {
    const env = createEnv({ dlq: 10, expired: 5 });
    await runDLQHealthCheck(env);
    expect(env.DB.prepare).toHaveBeenCalled();
  });

  it("handles DB failure gracefully", async () => {
    const env = {
      DB: {
        prepare: vi.fn(() => {
          throw new Error("DB down");
        }),
        batch: vi.fn(),
        exec: vi.fn(),
        withSession: vi.fn(),
        dump: vi.fn(),
      },
      KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
      API_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      BOT_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    };

    await expect(runDLQHealthCheck(env)).rejects.toThrow();
  });
});
