import { describe, it, expect, vi } from "vitest";
import { runIncompleteProfileReengagementJob } from "../incompleteProfileReengagement.js";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function createEnv(overrides?: {
  candidates?: Array<Record<string, unknown>>;
  queueOk?: boolean;
}) {
  const candidates = overrides?.candidates ?? [];
  const queueOk = overrides?.queueOk ?? true;

  const runMock = vi.fn(async () => ({ success: true }));
  const allMock = vi.fn(async () => ({ results: candidates }));
  const sendMock = vi.fn(async () => {
    if (!queueOk) throw new Error("queue down");
  });

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn(() => ({
        all: allMock,
        run: runMock,
      })),
    })),
  };

  return {
    DB: db as unknown as D1Database,
    KV: {} as KVNamespace,
    NOTIFICATION_QUEUE: { send: sendMock } as unknown as Queue,
    API_SERVICE: { fetch: vi.fn() } as unknown as Fetcher,
    BOT_SERVICE: {} as unknown as Fetcher,
    _send: sendMock,
    _runMock: runMock,
  };
}

describe("runIncompleteProfileReengagementJob", () => {
  it("sends notification to each candidate", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "u1",
          first_name: "Alice",
          language: "en",
          created_at: daysAgo(4),
        },
        { id: "u2", first_name: "Bob", language: "id", created_at: daysAgo(8) },
      ],
    });

    await runIncompleteProfileReengagementJob(env);

    expect(env._send).toHaveBeenCalledTimes(2);

    const call1 = (env._send.mock.calls as unknown[][])[0]![0] as string;
    const body1 = JSON.parse(call1) as Record<string, unknown>;
    expect(body1.userId).toBe("u1");
    expect(body1.type).toBe("INCOMPLETE_PROFILE_GENTLE");

    const call2 = (env._send.mock.calls as unknown[][])[1]![0] as string;
    const body2 = JSON.parse(call2) as Record<string, unknown>;
    expect(body2.userId).toBe("u2");
    expect(body2.type).toBe("INCOMPLETE_PROFILE_URGENT");
  });

  it("does nothing when no candidates found", async () => {
    const env = createEnv({ candidates: [] });

    await runIncompleteProfileReengagementJob(env);

    expect(env._send).not.toHaveBeenCalled();
  });

  it("continues processing when one candidate fails", async () => {
    let callCount = 0;
    const sendMock = vi.fn(async () => {
      callCount++;
      if (callCount === 1) throw new Error("Network error");
    });
    const env = createEnv({
      candidates: [
        { id: "u1", first_name: "A", language: "en", created_at: daysAgo(4) },
        { id: "u2", first_name: "B", language: "en", created_at: daysAgo(4) },
      ],
    });
    (env.NOTIFICATION_QUEUE as any).send = sendMock;
    (env as any)._send = sendMock;

    await runIncompleteProfileReengagementJob(env);

    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it("uses default name when first_name is null", async () => {
    const env = createEnv({
      candidates: [
        { id: "u1", first_name: null, language: "en", created_at: daysAgo(4) },
      ],
    });

    await runIncompleteProfileReengagementJob(env);

    expect(env._send).toHaveBeenCalledTimes(1);
    const call = (env._send.mock.calls as unknown[][])[0]![0] as string;
    const body = JSON.parse(call) as Record<string, unknown>;
    const payload = JSON.parse(body.payload as string) as Record<
      string,
      unknown
    >;
    expect(payload.message).toContain("There");
  });

  it("uses Indonesian default name when language is id", async () => {
    const env = createEnv({
      candidates: [
        { id: "u1", first_name: null, language: "id", created_at: daysAgo(4) },
      ],
    });

    await runIncompleteProfileReengagementJob(env);

    const calls = env._send.mock.calls as unknown[][];
    const call = calls[0]![0] as string;
    const body = JSON.parse(call) as Record<string, unknown>;
    const payload = JSON.parse(body.payload as string) as Record<
      string,
      unknown
    >;
    expect(payload.message).toContain("Kamu");
  });

  it("escapes markdown in first name", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "u1",
          first_name: "Test_Name",
          language: "en",
          created_at: daysAgo(4),
        },
      ],
    });

    await runIncompleteProfileReengagementJob(env);

    const calls = env._send.mock.calls as unknown[][];
    const call = calls[0]![0] as string;
    const body = JSON.parse(call) as Record<string, unknown>;
    const payload = JSON.parse(body.payload as string) as Record<
      string,
      unknown
    >;
    expect(payload.message).toContain("Test\\_Name");
  });

  it("updates last_reengagement_at after successful send", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "u1",
          first_name: "Alice",
          language: "en",
          created_at: daysAgo(4),
        },
      ],
    });

    await runIncompleteProfileReengagementJob(env);

    expect(env._runMock).toHaveBeenCalled();
  });

  it("sends INCOMPLETE_PROFILE_LAST_CHANCE for accounts 14+ days old", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "u1",
          first_name: "Old",
          language: "en",
          created_at: daysAgo(20),
        },
      ],
    });
    await runIncompleteProfileReengagementJob(env);
    const call = (env._send.mock.calls as unknown[][])[0]![0] as string;
    const body = JSON.parse(call) as Record<string, unknown>;
    expect(body.type).toBe("INCOMPLETE_PROFILE_LAST_CHANCE");
  });

  it("skips accounts less than 3 days old", async () => {
    const env = createEnv({
      candidates: [
        { id: "u1", first_name: "New", language: "en", created_at: daysAgo(1) },
      ],
    });
    await runIncompleteProfileReengagementJob(env);
    expect(env._send).not.toHaveBeenCalled();
  });

  it("respects stage cooldown (no re-send within cooldown window)", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "u1",
          first_name: "Alice",
          language: "en",
          created_at: daysAgo(4),
          last_reengagement_stage: 1,
          last_reengagement_at: daysAgo(1), // within GENTLE cooldown of 2 days
        },
      ],
    });
    await runIncompleteProfileReengagementJob(env);
    expect(env._send).not.toHaveBeenCalled();
  });

  it("skips candidates with malformed last_reengagement_at (fail closed)", async () => {
    const env = createEnv({
      candidates: [
        {
          id: "u1",
          first_name: "Alice",
          language: "en",
          created_at: daysAgo(4),
          last_reengagement_stage: 1,
          last_reengagement_at: "not-a-valid-date",
        },
      ],
    });
    await runIncompleteProfileReengagementJob(env);
    expect(env._send).not.toHaveBeenCalled();
  });
});
