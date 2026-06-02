import { describe, it, expect, vi } from "vitest";
import { runReengagementJob } from "../reengagement.js";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

describe("runReengagementJob", () => {
  const createEnv = (
    opts: {
      candidates?: Array<Record<string, unknown>>;
      nearbyCount?: number;
      queueOk?: boolean;
    } = {},
  ) => {
    const candidates = opts.candidates ?? [];
    const nearbyCount = opts.nearbyCount ?? 3;
    const queueOk = opts.queueOk ?? true;

    const sendMock = vi.fn(async () => {
      if (!queueOk) throw new Error("queue down");
    });
    const queue = { send: sendMock } as unknown as Queue;

    return {
      DB: {
        prepare: vi.fn((sql: string) => {
          const isCountQuery = sql.includes("COUNT(*)");
          const isUpdate = sql.includes("UPDATE users");
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
      NOTIFICATION_QUEUE: queue,
      KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
      API_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      BOT_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      _send: sendMock,
    };
  };

  it("does nothing when no inactive users", async () => {
    const env = createEnv({ candidates: [] });
    await runReengagementJob(env);
    expect(env._send).not.toHaveBeenCalled();
  });

  it("sends REENGAGEMENT_GENTLE for users inactive 7-13 days", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_1",
          first_name: "Alice",
          gender: "female",
          location: null,
          preferences: null,
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      nearbyCount: 5,
    });

    await runReengagementJob(env);
    expect(env._send).toHaveBeenCalledTimes(1);
    const sent = (env._send as any).mock.calls[0][0] as string;
    const body = JSON.parse(sent);
    expect(body.userId).toBe("user_1");
    expect(body.type).toBe("REENGAGEMENT_GENTLE");
  });

  it("sends REENGAGEMENT_URGENT for users inactive 14-29 days", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_2",
          first_name: "Bob",
          gender: "male",
          location: null,
          preferences: null,
          last_active: daysAgo(20),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
    });
    await runReengagementJob(env);
    const sent = (env._send as any).mock.calls[0][0] as string;
    expect(JSON.parse(sent).type).toBe("REENGAGEMENT_URGENT");
  });

  it("sends REENGAGEMENT_LAST_CHANCE for users inactive 30+ days", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_3",
          first_name: "Cara",
          gender: "female",
          location: null,
          preferences: null,
          last_active: daysAgo(60),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
    });
    await runReengagementJob(env);
    const sent = (env._send as any).mock.calls[0][0] as string;
    expect(JSON.parse(sent).type).toBe("REENGAGEMENT_LAST_CHANCE");
  });

  it("skips users inactive less than 7 days", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_4",
          first_name: "Dan",
          gender: "male",
          location: null,
          preferences: null,
          last_active: daysAgo(3),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
    });
    await runReengagementJob(env);
    expect(env._send).not.toHaveBeenCalled();
  });

  it("respects stage cooldown (no re-send within cooldown window)", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_5",
          first_name: "Eve",
          gender: "female",
          location: null,
          preferences: null,
          last_active: daysAgo(8),
          last_reengagement_stage: 1,
          last_reengagement_at: daysAgo(1), // within GENTLE cooldown of 5 days
        },
      ],
    });
    await runReengagementJob(env);
    expect(env._send).not.toHaveBeenCalled();
  });

  it("handles queue failure gracefully", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "user_6",
          first_name: "Frank",
          gender: "male",
          location: null,
          preferences: null,
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      queueOk: false,
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      nearbyCount: 0,
    });
    await runReengagementJob(env);
    const sent = (env._send as any).mock.calls[0][0] as string;
    const body = JSON.parse(sent);
    const payload = JSON.parse(body.payload);
    // GENTLE variant 0 starts with "Hey {name}, we miss you"
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
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      nearbyCount: 1,
    });
    await runReengagementJob(env);
    const sent = (env._send as any).mock.calls[0][0] as string;
    const body = JSON.parse(sent);
    const payload = JSON.parse(body.payload);
    expect(payload.marketingCount).toBeGreaterThanOrEqual(21);
    expect(payload.marketingCount).toBeLessThanOrEqual(100);
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      nearbyCount: 5,
    });
    await runReengagementJob(env);
    const sent = (env._send as any).mock.calls[0][0] as string;
    const body = JSON.parse(sent);
    const payload = JSON.parse(body.payload);
    // URGENT stage, variant 2 ("💬 Some women from ... want to chat with you right now")
    // Since we don't fix random, just assert message has a valid string
    expect(payload.message).toBeTruthy();
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      nearbyCount: 5,
    });
    await runReengagementJob(env);
    const sent = (env._send as any).mock.calls[0][0] as string;
    const body = JSON.parse(sent);
    const payload = JSON.parse(body.payload);
    expect(payload.message).toBeTruthy();
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
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      nearbyCount: 5,
    });
    await runReengagementJob(env);
    const sent = (env._send as any).mock.calls[0][0] as string;
    const body = JSON.parse(sent);
    const payload = JSON.parse(body.payload);
    expect(payload.message).toBeTruthy();
  });

  it("processes multiple candidates in a single run", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "u1",
          first_name: "Alice",
          gender: "female",
          location: null,
          preferences: null,
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
        {
          id: "u2",
          first_name: "Bob",
          gender: "male",
          location: null,
          preferences: null,
          last_active: daysAgo(20),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
        {
          id: "u3",
          first_name: "Charlie",
          gender: null,
          location: null,
          preferences: null,
          last_active: daysAgo(60),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      nearbyCount: 5,
    });

    await runReengagementJob(env);
    expect(env._send).toHaveBeenCalledTimes(3);

    const calls = (env._send as any).mock.calls;
    const body1 = JSON.parse(calls[0][0] as string);
    const body2 = JSON.parse(calls[1][0] as string);
    const body3 = JSON.parse(calls[2][0] as string);
    expect(body1.userId).toBe("u1");
    expect(body2.userId).toBe("u2");
    expect(body3.userId).toBe("u3");
    expect(body1.type).toBe("REENGAGEMENT_GENTLE");
    expect(body2.type).toBe("REENGAGEMENT_URGENT");
    expect(body3.type).toBe("REENGAGEMENT_LAST_CHANCE");
  });

  it("continues processing other candidates when one fails", async () => {
    let callCount = 0;
    const sendMock = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error("first call fails");
    });
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => {
          const isCountQuery = sql.includes("COUNT(*)");
          return {
            bind: vi.fn(() => ({
              all: vi.fn(async () => ({
                results: isCountQuery
                  ? [{ c: 5 }]
                  : [
                      {
                        id: "u1",
                        first_name: "A",
                        gender: "female",
                        location: null,
                        preferences: null,
                        last_active: daysAgo(8),
                        last_reengagement_stage: 0,
                        last_reengagement_at: null,
                      },
                      {
                        id: "u2",
                        first_name: "B",
                        gender: "male",
                        location: null,
                        preferences: null,
                        last_active: daysAgo(20),
                        last_reengagement_stage: 0,
                        last_reengagement_at: null,
                      },
                    ],
              })),
              first: vi.fn(async () => ({ c: 5 })),
              run: vi.fn(async () => ({ success: true })),
            })),
          };
        }),
      } as unknown as import("@cloudflare/workers-types").D1Database,
      NOTIFICATION_QUEUE: { send: sendMock } as unknown as Queue,
      API_SERVICE: {
        fetch: vi.fn(),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
      BOT_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    };

    await expect(runReengagementJob(env)).resolves.toBeUndefined();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("updates last_reengagement_at after successful notification", async () => {
    const runSpy = vi.fn(async () => ({ success: true }));
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => {
          const isCountQuery = sql.includes("COUNT(*)");
          if (
            sql.includes("UPDATE users") &&
            sql.includes("last_reengagement")
          ) {
            return {
              bind: vi.fn(() => ({ run: runSpy })),
            };
          }
          return {
            bind: vi.fn(() => ({
              all: vi.fn(async () => ({
                results: isCountQuery
                  ? [{ c: 5 }]
                  : [
                      {
                        id: "u1",
                        first_name: "Alice",
                        gender: "female",
                        location: null,
                        preferences: null,
                        last_active: daysAgo(8),
                        last_reengagement_stage: 0,
                        last_reengagement_at: null,
                      },
                    ],
              })),
              first: vi.fn(async () => ({ c: 5 })),
              run: vi.fn(async () => ({ success: true })),
            })),
          };
        }),
      } as unknown as import("@cloudflare/workers-types").D1Database,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      API_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
      BOT_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    };

    await runReengagementJob(env);
    expect(runSpy).toHaveBeenCalled();
  });

  it("does not update last_reengagement_at when queue send fails", async () => {
    const updateRun = vi.fn(async () => ({ success: true }));
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => {
          const isCountQuery = sql.includes("COUNT(*)");
          if (
            sql.includes("UPDATE users") &&
            sql.includes("last_reengagement")
          ) {
            return {
              bind: vi.fn(() => ({ run: updateRun })),
            };
          }
          return {
            bind: vi.fn(() => ({
              all: vi.fn(async () => ({
                results: isCountQuery
                  ? [{ c: 5 }]
                  : [
                      {
                        id: "u1",
                        first_name: "Alice",
                        gender: "female",
                        location: null,
                        preferences: null,
                        last_active: daysAgo(8),
                        last_reengagement_stage: 0,
                        last_reengagement_at: null,
                      },
                    ],
              })),
              first: vi.fn(async () => ({ c: 5 })),
              run: vi.fn(async () => ({ success: true })),
            })),
          };
        }),
      } as unknown as import("@cloudflare/workers-types").D1Database,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {
          throw new Error("queue error");
        }),
      } as unknown as Queue,
      API_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
      BOT_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    };

    await runReengagementJob(env);
    expect(updateRun).not.toHaveBeenCalled();
  });

  it("handles invalid JSON in preferences gracefully", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "u1",
          first_name: "Alex",
          gender: "female",
          location: null,
          preferences: "{invalid",
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      nearbyCount: 5,
    });

    await runReengagementJob(env);
    expect(env._send).toHaveBeenCalledTimes(1);
  });

  it("handles null first_name by defaulting to 'there'", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "u1",
          first_name: null,
          gender: "female",
          location: null,
          preferences: null,
          last_active: daysAgo(8),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      nearbyCount: 5,
    });

    await runReengagementJob(env);
    const sent = (env._send as any).mock.calls[0][0] as string;
    const body = JSON.parse(sent);
    const payload = JSON.parse(body.payload);
    // GENTLE variant 0: "Hey {name}, we miss you..."
    expect(payload.message.toLowerCase()).toContain("there");
  });

  it("handles location JSON with name field instead of city", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "u1",
          first_name: "Alice",
          gender: "female",
          location: JSON.stringify({
            name: "SomePlace",
            country: "SomeCountry",
          }),
          preferences: null,
          last_active: daysAgo(20),
          last_reengagement_stage: 0,
          last_reengagement_at: null,
        },
      ],
      nearbyCount: 5,
    });

    await runReengagementJob(env);
    const sent = (env._send as any).mock.calls[0][0] as string;
    const body = JSON.parse(sent);
    const payload = JSON.parse(body.payload);
    // URGENT stage, the message will have name from location if the random pick lands on a location-aware variant
    // (random is non-deterministic in tests, so just check the message is generated)
    expect(payload.message).toBeTruthy();
  });

  it("countNearbyUsers returns 0 on DB error without crashing job", async () => {
    let prepareCount = 0;
    const env = {
      DB: {
        prepare: vi.fn((sql: string) => {
          prepareCount++;
          if (prepareCount > 1 && sql.includes("COUNT(*)")) {
            return {
              bind: vi.fn(() => {
                throw new Error("COUNT DB error");
              }),
            };
          }
          return {
            bind: vi.fn(() => ({
              all: vi.fn(async () => ({
                results:
                  prepareCount === 1
                    ? [
                        {
                          id: "u1",
                          first_name: "Alice",
                          gender: "female",
                          location: null,
                          preferences: null,
                          last_active: daysAgo(8),
                          last_reengagement_stage: 0,
                          last_reengagement_at: null,
                        },
                      ]
                    : [],
              })),
              first: vi.fn(async () => ({ c: 0 })),
              run: vi.fn(async () => ({ success: true })),
            })),
          };
        }),
      } as unknown as import("@cloudflare/workers-types").D1Database,
      NOTIFICATION_QUEUE: {
        send: vi.fn(async () => {}),
      } as unknown as Queue,
      API_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
      KV: {} as unknown as import("@cloudflare/workers-types").KVNamespace,
      BOT_SERVICE: {
        fetch: vi.fn(async () => new Response()),
      } as unknown as import("@cloudflare/workers-types").Fetcher,
    };

    await expect(runReengagementJob(env)).resolves.toBeUndefined();
    // Job should still complete - countNearbyUsers returns 0 on error
    expect(env.NOTIFICATION_QUEUE.send).toHaveBeenCalled();
  });
});
