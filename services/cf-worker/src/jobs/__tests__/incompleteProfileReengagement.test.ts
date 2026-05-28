import { describe, it, expect, vi } from "vitest";
import { runIncompleteProfileReengagementJob } from "../incompleteProfileReengagement.js";

function createEnv(overrides?: {
  candidates?: Array<Record<string, unknown>>;
  apiOk?: boolean;
}) {
  const candidates = overrides?.candidates ?? [];
  const apiOk = overrides?.apiOk ?? true;

  const runMock = vi.fn(async () => ({ success: true }));
  const allMock = vi.fn(async () => ({ results: candidates }));

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        all: allMock,
        run: runMock,
      })),
    })),
  };

  const apiFetch = vi.fn(async () => {
    if (!apiOk) return new Response("error", { status: 500 });
    return new Response(JSON.stringify({}), { status: 200 });
  });

  return {
    DB: db as unknown as D1Database,
    KV: {} as KVNamespace,
    API_SERVICE: { fetch: apiFetch } as unknown as Fetcher,
    BOT_SERVICE: {} as unknown as Fetcher,
    _apiFetch: apiFetch,
    _runMock: runMock,
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

    expect(env._apiFetch).toHaveBeenCalledTimes(2);

    const call1 = (env._apiFetch.mock.calls as unknown[][])[0]![0] as Request;
    const body1 = (await call1.json()) as Record<string, unknown>;
    expect(body1.userId).toBe("u1");
    expect(body1.type).toBe("INCOMPLETE_PROFILE");

    const call2 = (env._apiFetch.mock.calls as unknown[][])[1]![0] as Request;
    const body2 = (await call2.json()) as Record<string, unknown>;
    expect(body2.userId).toBe("u2");
  });

  it("does nothing when no candidates found", async () => {
    const env = createEnv({ candidates: [] });

    await runIncompleteProfileReengagementJob(env);

    expect(env._apiFetch).not.toHaveBeenCalled();
  });

  it("continues processing when one candidate fails", async () => {
    let callCount = 0;
    const failingFetch = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Network error");
      return new Response(JSON.stringify({}), { status: 200 });
    });
    const env = createEnv({ candidates: [{ id: "u1" }, { id: "u2" }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (env.API_SERVICE as any).fetch = failingFetch;
    env._apiFetch = failingFetch;

    await runIncompleteProfileReengagementJob(env);

    expect(failingFetch).toHaveBeenCalledTimes(2);
  });

  it("uses default name when first_name is null", async () => {
    const env = createEnv({
      candidates: [{ id: "u1", first_name: null, language: "en" }],
    });

    await runIncompleteProfileReengagementJob(env);

    expect(env._apiFetch).toHaveBeenCalledTimes(1);
    const call = (env._apiFetch.mock.calls as unknown[][])[0]![0] as Request;
    const body = (await call.json()) as Record<string, unknown>;
    const payload = JSON.parse(body.payload as string) as Record<
      string,
      unknown
    >;
    expect(payload.message).toContain("There");
  });

  it("uses Indonesian default name when language is id", async () => {
    const env = createEnv({
      candidates: [{ id: "u1", first_name: null, language: "id" }],
    });

    await runIncompleteProfileReengagementJob(env);

    const calls = env._apiFetch.mock.calls as unknown[][];
    const call = calls[0]![0] as Request;
    const body = (await call.json()) as Record<string, unknown>;
    const payload = JSON.parse(body.payload as string) as Record<
      string,
      unknown
    >;
    expect(payload.message).toContain("Kamu");
  });

  it("escapes markdown in first name", async () => {
    const env = createEnv({
      candidates: [{ id: "u1", first_name: "Test_Name", language: "en" }],
    });

    await runIncompleteProfileReengagementJob(env);

    const calls = env._apiFetch.mock.calls as unknown[][];
    const call = calls[0]![0] as Request;
    const body = (await call.json()) as Record<string, unknown>;
    const payload = JSON.parse(body.payload as string) as Record<
      string,
      unknown
    >;
    expect(payload.message).toContain("Test\\_Name");
  });

  it("updates last_reminded_at after successful send", async () => {
    const env = createEnv({
      candidates: [{ id: "u1", first_name: "Alice", language: "en" }],
    });

    await runIncompleteProfileReengagementJob(env);

    expect(env._runMock).toHaveBeenCalled();
  });
});
