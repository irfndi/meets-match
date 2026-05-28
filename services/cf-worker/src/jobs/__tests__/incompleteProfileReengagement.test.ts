import { describe, it, expect, vi } from "vitest";
import { runIncompleteProfileReengagementJob } from "../incompleteProfileReengagement.js";

function createEnv(overrides?: {
  candidates?: Array<Record<string, unknown>>;
  apiOk?: boolean;
}) {
  const candidates = overrides?.candidates ?? [];
  const apiOk = overrides?.apiOk ?? true;

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => ({ results: candidates })),
        run: vi.fn(async () => ({ success: true })),
      })),
    })),
  };

  const apiService = {
    fetch: vi.fn(async () =>
      apiOk
        ? { ok: true, status: 200, json: async () => ({}) }
        : { ok: false, status: 500, text: async () => "error" },
    ),
  };

  return {
    DB: db as unknown as D1Database,
    KV: {} as KVNamespace,
    API_SERVICE: apiService as unknown as Fetcher,
    BOT_SERVICE: {} as unknown as Fetcher,
  };
}

describe("runIncompleteProfileReengagementJob", () => {
  it("sends notification to each candidate", async () => {
    const env = createEnv({
      candidates: [
        { id: "u1", first_name: "Alice", language: "en" },
        { id: "u2", first_name: "Bob", language: "id" },
      ],
    });

    await runIncompleteProfileReengagementJob(env);

    expect(env.API_SERVICE.fetch).toHaveBeenCalledTimes(2);

    const call1 = env.API_SERVICE.fetch.mock.calls[0][0] as Request;
    const body1 = await call1.json() as Record<string, unknown>;
    expect(body1.userId).toBe("u1");
    expect(body1.type).toBe("INCOMPLETE_PROFILE");

    const call2 = env.API_SERVICE.fetch.mock.calls[1][0] as Request;
    const body2 = await call2.json() as Record<string, unknown>;
    expect(body2.userId).toBe("u2");
  });

  it("does nothing when no candidates found", async () => {
    const env = createEnv({ candidates: [] });

    await runIncompleteProfileReengagementJob(env);

    expect(env.API_SERVICE.fetch).not.toHaveBeenCalled();
  });

  it("continues processing when one candidate fails", async () => {
    let callCount = 0;
    const env = createEnv({ candidates: [{ id: "u1" }, { id: "u2" }] });
    env.API_SERVICE.fetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Network error");
      return { ok: true, status: 200, json: async () => ({}) };
    });

    await runIncompleteProfileReengagementJob(env);

    expect(env.API_SERVICE.fetch).toHaveBeenCalledTimes(2);
  });

  it("uses default name when first_name is null", async () => {
    const env = createEnv({
      candidates: [{ id: "u1", first_name: null, language: "en" }],
    });

    await runIncompleteProfileReengagementJob(env);

    expect(env.API_SERVICE.fetch).toHaveBeenCalledTimes(1);
    const call = env.API_SERVICE.fetch.mock.calls[0][0] as Request;
    const body = await call.json() as Record<string, unknown>;
    const payload = JSON.parse(body.payload as string) as Record<string, unknown>;
    expect(payload.message).toContain("There");
  });

  it("uses Indonesian default name when language is id", async () => {
    const env = createEnv({
      candidates: [{ id: "u1", first_name: null, language: "id" }],
    });

    await runIncompleteProfileReengagementJob(env);

    const call = env.API_SERVICE.fetch.mock.calls[0][0] as Request;
    const body = await call.json() as Record<string, unknown>;
    const payload = JSON.parse(body.payload as string) as Record<string, unknown>;
    expect(payload.message).toContain("Kamu");
  });

  it("escapes markdown in first name", async () => {
    const env = createEnv({
      candidates: [{ id: "u1", first_name: "Test_Name", language: "en" }],
    });

    await runIncompleteProfileReengagementJob(env);

    const call = env.API_SERVICE.fetch.mock.calls[0][0] as Request;
    const body = await call.json() as Record<string, unknown>;
    const payload = JSON.parse(body.payload as string) as Record<string, unknown>;
    expect(payload.message).toContain("Test\\_Name");
  });

  it("updates last_reminded_at after successful send", async () => {
    const runMock = vi.fn(async () => ({ success: true }));
    const env = createEnv({
      candidates: [{ id: "u1", first_name: "Alice", language: "en" }],
    });
    env.DB = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn(() => ({
          all: vi.fn(async () => ({ results: env.DB._candidates })),
          run: runMock,
        })),
      })),
      _candidates: [{ id: "u1", first_name: "Alice", language: "en" }],
    } as unknown as D1Database;

    await runIncompleteProfileReengagementJob(env);

    expect(runMock).toHaveBeenCalled();
    const runSql = (env.DB.prepare as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: string[]) => c[0]?.includes("UPDATE users SET last_reminded_at"),
    );
    expect(runSql).toBeDefined();
  });
});
