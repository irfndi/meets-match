import { describe, it, expect, vi } from "vitest";

interface TestCastInput {}

function castForTest<T>(value: TestCastInput): T {
  return value as T;
}

type MockRowValue = string | number | boolean | null;
interface MockRow {
  id: string;
  [key: string]: MockRowValue;
}

function mockD1(countValue: number, results: MockRow[] = []) {
  const mock = {
    prepare() {
      const stmt = {
        first: async () => ({ c: countValue }),
        all: async () => ({ results }),
        run: async () => ({ success: true }),
        bind() {
          return stmt;
        },
      };
      return stmt;
    },
  };
  return castForTest<D1Database & object>(mock);
}

function mockEnv(dlqCount = 5, candidates: MockRow[] = []) {
  return {
    DB: mockD1(dlqCount, candidates),
    KV: {} as KVNamespace,
    NOTIFICATION_QUEUE: {
      send: vi.fn().mockResolvedValue(undefined),
    } as Queue & object,
    API_SERVICE: castForTest<Fetcher & object>({
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    }),
    BOT_SERVICE: castForTest<Fetcher & object>({
      fetch: vi.fn().mockResolvedValue(new Response()),
    }),
    ENVIRONMENT: "test",
    REENGAGEMENT_SCHEDULE: "0 10 * * *",
    DLQ_PROCESSOR_SCHEDULE: "*/5 * * * *",
    DAILY_ACTIVE_STATES_SCHEDULE: "0 8 * * *",
    WORKER_CONCURRENCY: "10",
  };
}

describe("Cron Jobs", () => {
  it("runReengagementJob processes candidates without error", async () => {
    const { runReengagementJob } = await import("../jobs/reengagement.js");
    const env = mockEnv();
    await expect(runReengagementJob(env as any)).resolves.toBeUndefined();
  });

  it("runReengagementJob sends variant messages with nearby counts", async () => {
    const { runReengagementJob } = await import("../jobs/reengagement.js");
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.toISOString();
    };
    const candidates = [
      {
        id: "123",
        first_name: "Alice",
        gender: "female",
        location: null,
        last_active: daysAgo(8),
        last_reengagement_stage: 0,
        last_reengagement_at: null,
      },
      {
        id: "456",
        first_name: "Bob",
        gender: "male",
        location: null,
        last_active: daysAgo(20),
        last_reengagement_stage: 0,
        last_reengagement_at: null,
      },
    ];
    const env = mockEnv(0, candidates);
    await runReengagementJob(env as any);

    const calls = (env.NOTIFICATION_QUEUE.send as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(calls.length).toBe(2);

    for (const call of calls) {
      const sent = call[0] as string;
      const body = JSON.parse(sent);
      expect(["REENGAGEMENT_GENTLE", "REENGAGEMENT_URGENT"]).toContain(
        body.type,
      );
      const payload = JSON.parse(body.payload);
      expect(payload.message).toBeTruthy();
      expect(payload.action).toBe("find_match");
    }
  });

  it("runDLQHealthCheck handles empty DLQ", async () => {
    const { runDLQHealthCheck } = await import("../jobs/dlqHealth.js");
    const env = mockEnv(0);
    await expect(runDLQHealthCheck(env as any)).resolves.toBeUndefined();
  });

  it("runDLQHealthCheck handles populated DLQ", async () => {
    const { runDLQHealthCheck } = await import("../jobs/dlqHealth.js");
    const env = mockEnv(150);
    await expect(runDLQHealthCheck(env as any)).resolves.toBeUndefined();
  });

  it("runDLQHealthCheck handles errors gracefully", async () => {
    const { runDLQHealthCheck } = await import("../jobs/dlqHealth.js");
    const env = {
      DB: {
        prepare() {
          return {
            first: async () => {
              throw new Error("DB failure");
            },
          };
        },
      },
      KV: {},
      API_SERVICE: {},
    };
    await expect(runDLQHealthCheck(env as any)).rejects.toThrow();
  });

  it("runDailyActiveStatesJob processes candidates without error", async () => {
    const { runDailyActiveStatesJob } =
      await import("../jobs/dailyActiveStates.js");
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.toISOString();
    };
    const candidates = [
      {
        id: "u1",
        first_name: "Active",
        language: "en",
        last_active: daysAgo(0),
        last_daily_message_at: null,
        last_daily_message_type: null,
      },
    ];
    const env = {
      DB: mockD1(0, candidates),
      KV: {} as KVNamespace,
      NOTIFICATION_QUEUE: {
        send: vi.fn().mockResolvedValue(undefined),
      } as Queue & object,
      API_SERVICE: castForTest<Fetcher & object>({
        fetch: vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ pendingLikes: [] }), { status: 200 }),
          ),
      }),
    };
    await expect(runDailyActiveStatesJob(env as any)).resolves.toBeUndefined();
  });
});
