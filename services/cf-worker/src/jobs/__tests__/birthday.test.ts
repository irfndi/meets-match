import { describe, it, expect, vi } from "vitest";
import { runBirthdayJob } from "../birthday.js";

describe("runBirthdayJob", () => {
  const createEnv = (
    overrides: {
      dbResults?: Array<Record<string, unknown>>;
      matchResults?: Array<Record<string, unknown>>;
      leapResults?: Array<Record<string, unknown>>;
      apiResponse?: { ok: boolean; status?: number; json?: unknown };
    } = {},
  ) => {
    const dbResults = overrides.dbResults ?? [];
    const matchResults = overrides.matchResults ?? [];
    const leapResults = overrides.leapResults ?? [];
    const apiOk = overrides.apiResponse?.ok ?? true;

    return {
      DB: {
        prepare: vi.fn((sql: string) => {
          const isMatchQuery = sql.includes("FROM matches m");
          const results = isMatchQuery ? matchResults : dbResults;
          return {
            bind: vi.fn((...params: unknown[]) => ({
              all: vi.fn(async () => {
                if (params[0] === "02-29") return { results: leapResults };
                return { results };
              }),
              first: vi.fn(async () => ({ c: results.length })),
              run: vi.fn(async () => ({ success: true })),
            })),
          };
        }),
      } as unknown as import("@cloudflare/workers-types").D1Database,
      API_SERVICE: {
        fetch: vi.fn(async () => ({
          ok: apiOk,
          status: overrides.apiResponse?.status ?? 200,
          text: async () => "ok",
          json: async () => overrides.apiResponse?.json ?? {},
        })),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      BOT_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    };
  };

  it("does nothing when no birthdays today", async () => {
    const env = createEnv({ dbResults: [] });
    await runBirthdayJob(env);
    expect(env.DB.prepare).toHaveBeenCalledWith(
      expect.stringContaining("substr(birth_date, 6, 5)"),
    );
  });

  it("notifies mutual matches for each birthday user", async () => {
    const env = createEnv({
      dbResults: [
        { id: "user_1", first_name: "Alice", birth_date: "1990-05-17" },
      ],
      matchResults: [
        { match_user_id: "match_1" },
        { match_user_id: "match_2" },
      ],
      apiResponse: { ok: true },
    });

    await runBirthdayJob(env);

    expect(env.NOTIFICATION_QUEUE.send).toHaveBeenCalledTimes(2);
    const sent = (env.NOTIFICATION_QUEUE.send as any).mock
      .calls[0][0] as string;
    const body = JSON.parse(sent);
    expect(body.userId).toBe("match_1");
    expect(body.type).toBe("BIRTHDAY");
  });

  it("updates age column for birthday users", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T09:00:00Z"));

    const env = createEnv({
      dbResults: [
        { id: "user_1", first_name: "Alice", birth_date: "1990-05-17" },
      ],
      matchResults: [],
      apiResponse: { ok: true },
    });

    await runBirthdayJob(env);

    const prepareCalls = (env.DB.prepare as any).mock.calls;
    const ageUpdateIdx = prepareCalls.findIndex((call: any[]) =>
      call[0].includes("UPDATE users SET age"),
    );
    expect(ageUpdateIdx).toBeGreaterThanOrEqual(0);

    // Verify bind params: age = 36, userId = "user_1"
    const bindMock = (env.DB.prepare as any).mock.results[ageUpdateIdx].value
      .bind;
    const bindCalls = bindMock.mock.calls;
    expect(bindCalls[0][0]).toBe(36);
    expect(bindCalls[0][1]).toBe("user_1");

    vi.useRealTimers();
  });

  it("handles queue send failure gracefully", async () => {
    const env = createEnv({
      dbResults: [
        { id: "user_1", first_name: "Bob", birth_date: "1990-05-17" },
      ],
      matchResults: [{ match_user_id: "match_1" }],
      apiResponse: { ok: false, status: 500 },
    });
    // Override the queue to throw — the job should still complete.
    (env.NOTIFICATION_QUEUE as any).send = vi.fn(async () => {
      throw new Error("queue down");
    });

    await expect(runBirthdayJob(env)).resolves.toBeUndefined();
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
      } as unknown as import("@cloudflare/workers-types").D1Database,
      API_SERVICE: {
        fetch: vi.fn(),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      BOT_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    };

    await expect(runBirthdayJob(env)).resolves.toBeUndefined();
  });

  it("escapes special characters in names", async () => {
    const env = createEnv({
      dbResults: [
        { id: "user_1", first_name: "Alice*Bob", birth_date: "1990-05-17" },
      ],
      matchResults: [{ match_user_id: "match_1" }],
      apiResponse: { ok: true },
    });

    await runBirthdayJob(env);
    const sent = (env.NOTIFICATION_QUEUE.send as any).mock
      .calls[0][0] as string;
    const body = JSON.parse(sent);
    const payload = JSON.parse(body.payload);
    expect(payload.message).toContain("Alice\\*Bob");
  });

  it("refreshes leap-day user ages on Feb 28 of non-leap years", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2023-02-28T09:00:00Z"));

    const env = createEnv({
      dbResults: [],
      matchResults: [],
      leapResults: [
        { id: "leap_1", first_name: "Leap", birth_date: "2000-02-29" },
      ],
    });

    await runBirthdayJob(env);

    // Should query for regular birthdays, leap-day users, and age update
    expect(env.DB.prepare).toHaveBeenCalledTimes(3);

    // Should update age but NOT send notifications (no regular birthday user)
    const runCalls = (env.DB.prepare as any).mock.calls;
    const ageUpdateCall = runCalls.find((call: any[]) =>
      call[0].includes("UPDATE users SET age"),
    );
    expect(ageUpdateCall).toBeDefined();
    expect(env.NOTIFICATION_QUEUE.send).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("processes multiple birthday users", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T09:00:00Z"));

    const env = createEnv({
      dbResults: [
        { id: "u1", first_name: "Alice", birth_date: "1990-05-17" },
        { id: "u2", first_name: "Bob", birth_date: "1995-05-17" },
      ],
      matchResults: [{ match_user_id: "match_1" }],
      apiResponse: { ok: true },
    });

    await runBirthdayJob(env);

    // Each birthday user has one match → 2 queue sends total
    expect(env.NOTIFICATION_QUEUE.send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not notify when birthday user has no mutual matches", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T09:00:00Z"));

    const env = createEnv({
      dbResults: [{ id: "u1", first_name: "Alice", birth_date: "1990-05-17" }],
      matchResults: [],
      apiResponse: { ok: true },
    });

    await runBirthdayJob(env);

    expect(env.NOTIFICATION_QUEUE.send).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("handles age update failure gracefully for individual users", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T09:00:00Z"));

    let updateCallCount = 0;
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => {
          const isAgeUpdate = sql.includes("UPDATE users SET age");
          const isMatchQuery = sql.includes("FROM matches m");
          return {
            bind: vi.fn((..._params: unknown[]) => ({
              all: vi.fn(async () => {
                if (isMatchQuery) return { results: [] };
                return {
                  results: [
                    { id: "u1", first_name: "Ali", birth_date: "1990-05-17" },
                  ],
                };
              }),
              first: vi.fn(async () => ({ c: 1 })),
              run: vi.fn(async () => {
                if (isAgeUpdate) {
                  updateCallCount++;
                  throw new Error("age update failed");
                }
                return { success: true };
              }),
            })),
          };
        }),
      } as unknown as import("@cloudflare/workers-types").D1Database,
      API_SERVICE: {
        fetch: vi.fn(async () => ({
          ok: true,
          status: 200,
          text: async () => "ok",
          json: async () => ({}),
        })),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      BOT_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    };

    await runBirthdayJob(env);
    // Age update failed but job completed
    expect(updateCallCount).toBeGreaterThanOrEqual(1);
    vi.useRealTimers();
  });

  it("defaults to 'Someone' when first_name is null", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T09:00:00Z"));

    const env = createEnv({
      dbResults: [{ id: "u1", first_name: null, birth_date: "1990-05-17" }],
      matchResults: [{ match_user_id: "match_1" }],
      apiResponse: { ok: true },
    });

    await runBirthdayJob(env);

    const sent = (env.NOTIFICATION_QUEUE.send as any).mock
      .calls[0][0] as string;
    const body = JSON.parse(sent);
    const payload = JSON.parse(body.payload);
    expect(payload.message).toContain("Someone");
    vi.useRealTimers();
  });

  it("does not query for leap-day users when not Feb 28", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T09:00:00Z"));

    const env = createEnv({
      dbResults: [],
      matchResults: [],
      leapResults: [],
    });

    await runBirthdayJob(env);

    const prepareCalls = (env.DB.prepare as any).mock.calls;
    const leapQueries = prepareCalls.filter((c: any[]) =>
      c[0].includes("02-29"),
    );
    // On May 17, should not trigger leap day query
    expect(leapQueries.length).toBe(0);
    vi.useRealTimers();
  });

  it("handles notification failure for individual match gracefully", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17T09:00:00Z"));

    const env = createEnv({
      dbResults: [{ id: "u1", first_name: "Alice", birth_date: "1990-05-17" }],
      matchResults: [
        { match_user_id: "match_1" },
        { match_user_id: "match_2" },
      ],
      apiResponse: { ok: false, status: 500 },
    });
    // Override the queue to throw — the job should still complete for all
    // matches and not propagate the failure.
    (env.NOTIFICATION_QUEUE as any).send = vi.fn(async () => {
      throw new Error("queue down");
    });

    await expect(runBirthdayJob(env)).resolves.toBeUndefined();
    // Both attempts were made even though both failed
    expect(env.NOTIFICATION_QUEUE.send).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
