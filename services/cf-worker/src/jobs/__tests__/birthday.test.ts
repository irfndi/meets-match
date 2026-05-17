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
            bind: vi.fn((param: string) => ({
              all: vi.fn(async () => {
                if (param === "02-29") return { results: leapResults };
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

    expect(env.API_SERVICE.fetch).toHaveBeenCalledTimes(2);
    const calls = (env.API_SERVICE.fetch as any).mock.calls;
    expect(calls[0][0].url).toBe("http://api/notifications");
  });

  it("updates age column for birthday users", async () => {
    const env = createEnv({
      dbResults: [
        { id: "user_1", first_name: "Alice", birth_date: "1990-05-17" },
      ],
      matchResults: [],
      apiResponse: { ok: true },
    });

    await runBirthdayJob(env);

    const prepareCalls = (env.DB.prepare as any).mock.calls;
    const ageUpdateCall = prepareCalls.find((call: any[]) =>
      call[0].includes("UPDATE users SET age"),
    );
    expect(ageUpdateCall).toBeDefined();
  });

  it("handles API failure gracefully", async () => {
    const env = createEnv({
      dbResults: [
        { id: "user_1", first_name: "Bob", birth_date: "1990-05-17" },
      ],
      matchResults: [{ match_user_id: "match_1" }],
      apiResponse: { ok: false, status: 500 },
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
    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    const body = JSON.parse(await new Response(req.body).text());
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
    expect(env.API_SERVICE.fetch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
