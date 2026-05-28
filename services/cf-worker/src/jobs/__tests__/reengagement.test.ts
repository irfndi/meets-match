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
        {
          id: "user_1",
          first_name: "Alice",
          gender: "female",
          location: null,
          preferences: null,
        },
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
        {
          id: "user_1",
          first_name: "Bob",
          gender: "male",
          location: null,
          preferences: null,
        },
      ],
      apiOk: false,
    });
    await expect(runReengagementJob(env)).resolves.toBeUndefined();
  });

  it("counts opposite gender for known gender with no preference", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alice",
          gender: "female",
          location: null,
          preferences: null,
        },
      ],
      nearbyCount: 7,
    });
    await runReengagementJob(env);
    const countCall = (env.DB.prepare as any).mock.calls.find((c: [string]) =>
      c[0].includes("gender = ?"),
    );
    expect(countCall).toBeDefined();
  });

  it("counts all users for unknown gender with no preference", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alex",
          gender: null,
          location: null,
          preferences: null,
        },
      ],
      nearbyCount: 10,
    });
    await runReengagementJob(env);
    const countCall = (env.DB.prepare as any).mock.calls.find((c: [string]) =>
      c[0].includes("COUNT(*)"),
    );
    expect(countCall).toBeDefined();
    expect(countCall[0]).not.toContain("gender = ?");
    expect(countCall[0]).not.toContain("gender IN");
  });

  it("counts based on gender preference when set", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alice",
          gender: "female",
          location: null,
          preferences: JSON.stringify({ genderPreference: ["male"] }),
        },
      ],
      nearbyCount: 7,
    });
    await runReengagementJob(env);
    const countCall = (env.DB.prepare as any).mock.calls.find((c: [string]) =>
      c[0].includes("gender IN"),
    );
    expect(countCall).toBeDefined();
    expect(countCall[0]).toContain("gender IN (?)");
  });

  it("counts multiple genders when preference includes both", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alex",
          gender: "other",
          location: null,
          preferences: JSON.stringify({ genderPreference: ["male", "female"] }),
        },
      ],
      nearbyCount: 12,
    });
    await runReengagementJob(env);
    const countCall = (env.DB.prepare as any).mock.calls.find((c: [string]) =>
      c[0].includes("gender IN"),
    );
    expect(countCall).toBeDefined();
    expect(countCall[0]).toContain("gender IN (?,?)");
  });

  it("filters by gender IN when preference includes three genders", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alex",
          gender: "other",
          location: null,
          preferences: JSON.stringify({
            genderPreference: ["male", "female", "other"],
          }),
        },
      ],
      nearbyCount: 12,
    });
    await runReengagementJob(env);
    const genderFilteredCountCall = (env.DB.prepare as any).mock.calls.find(
      (c: [string]) => c[0].includes("gender IN"),
    );
    expect(genderFilteredCountCall).toBeDefined();
    expect(genderFilteredCountCall[0]).toContain("gender IN (?,?,?)");
  });

  it("counts all users when gender preference includes four genders", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alex",
          gender: "other",
          location: null,
          preferences: JSON.stringify({
            genderPreference: ["male", "female", "other", "prefer_not_to_say"],
          }),
        },
      ],
      nearbyCount: 12,
    });
    await runReengagementJob(env);
    const genderFilteredCountCall = (env.DB.prepare as any).mock.calls.find(
      (c: [string]) => c[0].includes("gender IN"),
    );
    expect(genderFilteredCountCall).toBeUndefined();

    const countCall = (env.DB.prepare as any).mock.calls.find((c: [string]) =>
      c[0].includes("COUNT(*)"),
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
          preferences: null,
        },
      ],
      nearbyCount: 0,
    });
    // Pick variant index 3 which includes the name
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(3 / 14);
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

  it("uses marketing count instead of real count", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alice",
          gender: "female",
          location: null,
          preferences: null,
        },
      ],
      nearbyCount: 1, // very low real count
      apiOk: true,
    });
    // Force variant 0 which always includes a numeric count
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    await runReengagementJob(env);
    randomSpy.mockRestore();

    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    const body = JSON.parse(await new Response(req.body).text());
    const payload = JSON.parse(body.payload);
    const match = payload.message.match(/(\d+)/);
    expect(match).toBeTruthy();
    const marketingCount = parseInt(match![1], 10);
    expect(marketingCount).toBeGreaterThanOrEqual(21);
    expect(marketingCount).toBeLessThanOrEqual(100);
  });

  it("uses location in message when available", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alice",
          gender: "female",
          location: JSON.stringify({ city: "Bandung", country: "Indonesia" }),
          preferences: null,
        },
      ],
      nearbyCount: 5,
      apiOk: true,
    });

    // Force pick the location-based variant (index 6)
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(6 / 14);
    await runReengagementJob(env);
    randomSpy.mockRestore();

    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    const body = JSON.parse(await new Response(req.body).text());
    const payload = JSON.parse(body.payload);
    expect(payload.message).toContain("Bandung");
  });

  it("escapes special characters in location", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alice",
          gender: "female",
          location: JSON.stringify({
            city: "Kuala*Lumpur",
            country: "Malaysia",
          }),
          preferences: null,
        },
      ],
      nearbyCount: 5,
      apiOk: true,
    });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(6 / 14);
    await runReengagementJob(env);
    randomSpy.mockRestore();

    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    const body = JSON.parse(await new Response(req.body).text());
    const payload = JSON.parse(body.payload);
    expect(payload.message).toContain("Kuala\\*Lumpur");
  });

  it("uses fallback gender label based on user gender when no preference", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Bob",
          gender: "male",
          location: null,
          preferences: null,
        },
      ],
      nearbyCount: 5,
      apiOk: true,
    });

    // Force variant 0 which always includes the label
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    await runReengagementJob(env);
    randomSpy.mockRestore();

    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    const body = JSON.parse(await new Response(req.body).text());
    const payload = JSON.parse(body.payload);
    expect(payload.message.toLowerCase()).toContain("women");
  });

  it("uses gender preference label when set", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alice",
          gender: "female",
          location: null,
          preferences: JSON.stringify({ genderPreference: ["female"] }),
        },
      ],
      nearbyCount: 5,
      apiOk: true,
    });

    // Force variant 0 which always includes the label
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    await runReengagementJob(env);
    randomSpy.mockRestore();

    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    const body = JSON.parse(await new Response(req.body).text());
    const payload = JSON.parse(body.payload);
    expect(payload.message.toLowerCase()).toContain("women");
  });

  it("uses 'people' label for all-genders preference", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alex",
          gender: "other",
          location: null,
          preferences: JSON.stringify({
            genderPreference: ["male", "female", "other", "prefer_not_to_say"],
          }),
        },
      ],
      nearbyCount: 5,
      apiOk: true,
    });

    // Force variant 0 which always includes the label
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    await runReengagementJob(env);
    randomSpy.mockRestore();

    const req = (env.API_SERVICE.fetch as any).mock.calls[0][0] as Request;
    const body = JSON.parse(await new Response(req.body).text());
    const payload = JSON.parse(body.payload);
    expect(payload.message.toLowerCase()).toContain("people");
  });
});
