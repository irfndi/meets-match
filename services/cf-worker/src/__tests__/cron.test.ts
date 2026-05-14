import { describe, it, expect, vi, beforeEach } from "vitest";

function mockD1(countValue: number, results: Array<Record<string, unknown>> = []) {
  return {
    prepare() {
      return {
        bind() {
          return {
            first: async () => (typeof countValue === "number" ? { c: countValue } : null),
            all: async () => ({ results }),
            run: async () => ({ success: true }),
          };
        },
      };
    },
  } as unknown as D1Database;
}

function mockEnv(dlqCount = 5) {
  return {
    DB: mockD1(dlqCount),
    KV: {} as KVNamespace,
    API_SERVICE: { fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })) } as unknown as Fetcher,
    BOT_SERVICE: { fetch: vi.fn().mockResolvedValue(new Response()) } as unknown as Fetcher,
    ENVIRONMENT: "test",
    REENGAGEMENT_SCHEDULE: "0 10 * * *",
    DLQ_PROCESSOR_SCHEDULE: "*/5 * * * *",
    WORKER_CONCURRENCY: "10",
    ENABLE_SENTRY: "false",
  };
}

describe("Cron Jobs", () => {
  it("runReengagementJob processes candidates without error", async () => {
    const { runReengagementJob } = await import("../jobs/reengagement.js");
    const env = mockEnv();
    await expect(runReengagementJob(env as any)).resolves.not.toThrow();
  });

  it("runDLQHealthCheck handles empty DLQ", async () => {
    const { runDLQHealthCheck } = await import("../jobs/dlqHealth.js");
    const env = mockEnv(0);
    await expect(runDLQHealthCheck(env as any)).resolves.not.toThrow();
  });

  it("runDLQHealthCheck handles populated DLQ", async () => {
    const { runDLQHealthCheck } = await import("../jobs/dlqHealth.js");
    const env = mockEnv(150);
    await expect(runDLQHealthCheck(env as any)).resolves.not.toThrow();
  });
});
