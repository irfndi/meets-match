import { describe, it, expect, vi } from "vitest";
import { runReengagementJob } from "../reengagement.js";

describe("runReengagementJob", () => {
  const createEnv = (
    opts: {
      candidates?: Array<Record<string, unknown>>;
      nearbyCount?: number;
      apiOk?: boolean;
    } = {},
  ) => {
    const candidates = opts.candidates ?? [];
    const nearbyCount = opts.nearbyCount ?? 3;
    const apiOk = opts.apiOk ?? true;

    return {
      DB: {
        prepare: vi.fn((sql: string) => {
          const isCountQuery = sql.includes("COUNT(*)");
          return {
            bind: vi.fn(() => ({
              all: vi.fn(async () => ({
                results: isCountQuery ? [{ c: nearbyCount }] : candidates,
              })),
              first: vi.fn(async () => ({ c: isCountQuery ? nearbyCount : 0 })),
              run: vi.fn(async () => ({ success: true })),
            })),
          };
        }),
      } as unknown as import("@cloudflare/workers-types").D1Database,
      API_SERVICE: {
        fetch: vi.fn(async () => ({
          ok: apiOk,
          status: apiOk ? 200 : 500,
          text: async () => "ok",
        })),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
      BOT_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    };
  };

  it("does nothing when no inactive users", async () => {
    const env = createEnv({ candidates: [] });
    await runReengagementJob(env);
    expect(env.API_SERVICE.fetch).not.toHaveBeenCalled();
  });

  it("sends reengagement notification for inactive user", async () => {
    const env = createEnv({
      candidates: [
        { id: "user_1", first_name: "Alice", gender: "female", location: null },
      ],
      nearbyCount: 5,
      apiOk: true,
    });

    await runReengagementJob(env);
    expect(env.API_SERVICE.fetch).toHaveBeenCalledTimes(1);
    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    expect(req.url).toBe("http://api/notifications");
    const body = JSON.parse(await new Response(req.body).text());
    expect(body.userId).toBe("user_1");
    expect(body.type).toBe("REENGAGEMENT");
    expect(body.channel).toBe("TELEGRAM");
  });

  it("handles API failure gracefully", async () => {
    const env = createEnv({
      candidates: [
        { id: "user_1", first_name: "Bob", gender: "male", location: null },
      ],
      apiOk: false,
    });
    await expect(runReengagementJob(env)).resolves.toBeUndefined();
  });

  it("counts all users for unknown gender", async () => {
    const env = createEnv({
      candidates: [
        { id: "user_1", first_name: "Alex", gender: null, location: null },
      ],
      nearbyCount: 10,
    });
    await runReengagementJob(env);
    const countCall = (env.DB.prepare as any).mock.calls.find((c: [string]) =>
      c[0].includes("COUNT(*)"),
    );
    expect(countCall).toBeDefined();
  });

  it("counts opposite gender for known gender", async () => {
    const env = createEnv({
      candidates: [
        { id: "user_1", first_name: "Alice", gender: "female", location: null },
      ],
      nearbyCount: 7,
    });
    await runReengagementJob(env);
    const countCall = (env.DB.prepare as any).mock.calls.find((c: [string]) =>
      c[0].includes("gender = ?"),
    );
    expect(countCall).toBeDefined();
  });

  it("escapes special characters in names", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alice*",
          gender: "female",
          location: null,
        },
      ],
      nearbyCount: 0,
    });
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    await runReengagementJob(env);
    randomSpy.mockRestore();
    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    const body = JSON.parse(await new Response(req.body).text());
    const payload = JSON.parse(body.payload);
    expect(payload.message).toContain("Alice\\*");
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

    await expect(runReengagementJob(env)).rejects.toThrow();
  });

  it("uses fallback message when nearby count is 0", async () => {
    const env = createEnv({
      candidates: [
        { id: "user_1", first_name: "Alice", gender: "female", location: null },
      ],
      nearbyCount: 0,
    });
    await runReengagementJob(env);
    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    const body = JSON.parse(await new Response(req.body).text());
    const payload = JSON.parse(body.payload);
    expect(payload.message).toBeTruthy();
  });
});
