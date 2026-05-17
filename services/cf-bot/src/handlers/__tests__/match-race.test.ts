import { describe, it, expect } from "vitest";
import {
  createRaceBarrier,
  createRacingMockKV,
} from "@meetsmatch/cf-shared/testing/race-mocks";

// Replicate the lock functions from match.ts to test them in isolation.
// These are the original implementations (copied for testability).
const ACTION_LOCK_TTL = 30;

async function acquireActionLock(
  kv: import("@cloudflare/workers-types").KVNamespace,
  userId: string,
): Promise<boolean> {
  const key = `action_lock:${userId}`;
  const existing = await kv.get(key);
  if (existing) return false;
  await kv.put(key, "1", { expirationTtl: ACTION_LOCK_TTL });
  return true;
}

async function releaseActionLock(
  kv: import("@cloudflare/workers-types").KVNamespace,
  userId: string,
): Promise<void> {
  await kv.delete(`action_lock:${userId}`);
}

const DM_BYPASS_LIMIT = 100;
const DM_BYPASS_TTL = 86400;

interface DMBypassStatus {
  used: number;
  resetAt: string;
}

async function getDMBypassStatus(
  kv: import("@cloudflare/workers-types").KVNamespace,
  userId: string,
): Promise<DMBypassStatus> {
  const value = await kv.get(`dm_bypass:${userId}`);
  if (value) {
    const parsed = JSON.parse(value) as DMBypassStatus;
    const now = new Date();
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    ).toISOString();
    if (parsed.resetAt < today) {
      return { used: 0, resetAt: today };
    }
    return parsed;
  }
  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString();
  return { used: 0, resetAt: today };
}

async function useDMBypass(
  kv: import("@cloudflare/workers-types").KVNamespace,
  userId: string,
): Promise<{ used: number; remaining: number }> {
  const status = await getDMBypassStatus(kv, userId);
  status.used++;
  await kv.put(`dm_bypass:${userId}`, JSON.stringify(status), {
    expirationTtl: DM_BYPASS_TTL,
  });
  return {
    used: status.used,
    remaining: Math.max(0, DM_BYPASS_LIMIT - status.used),
  };
}

describe("acquireActionLock race conditions", () => {
  it("allows double-locking when two calls race (check-then-set bug)", async () => {
    const barrier = createRaceBarrier();

    let putCount = 0;
    const kv = createRacingMockKV({
      pauseBeforePut: (key) => {
        // Pause only the FIRST put() so the second call can also get() -> null
        if (key === "action_lock:u1" && putCount === 0) {
          putCount++;
          return barrier.promise;
        }
        return undefined;
      },
    });

    // Start first acquire — will pause at put()
    const p1 = acquireActionLock(kv, "u1");
    await new Promise((r) => setTimeout(r, 10));

    // Second acquire reads null (first hasn't put yet) and puts immediately
    const r2 = await acquireActionLock(kv, "u1");

    // Release first barrier
    barrier.resolve();
    const r1 = await p1;

    // BUG: both acquired the lock
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  it("prevents double-locking when calls are sequential", async () => {
    const kv = createRacingMockKV({});

    const r1 = await acquireActionLock(kv, "u1");
    expect(r1).toBe(true);

    const r2 = await acquireActionLock(kv, "u1");
    expect(r2).toBe(false);
  });

  it("allows re-acquisition after release", async () => {
    const kv = createRacingMockKV({});

    expect(await acquireActionLock(kv, "u1")).toBe(true);
    await releaseActionLock(kv, "u1");
    expect(await acquireActionLock(kv, "u1")).toBe(true);
  });
});

describe("useDMBypass race conditions", () => {
  it("allows overuse when two calls race at the limit boundary", async () => {
    const today = new Date().toISOString();
    const barrier = createRaceBarrier();

    let putCount = 0;
    const kv = createRacingMockKV({
      initial: new Map([
        ["dm_bypass:u1", JSON.stringify({ used: 99, resetAt: today })],
      ]),
      pauseBeforePut: (key) => {
        // Pause only the FIRST put()
        if (key === "dm_bypass:u1" && putCount === 0) {
          putCount++;
          return barrier.promise;
        }
        return undefined;
      },
    });

    // Start first useDMBypass — pauses at put()
    const p1 = useDMBypass(kv, "u1");
    await new Promise((r) => setTimeout(r, 10));

    // Second call reads used=99, increments to 100, puts
    const r2 = await useDMBypass(kv, "u1");

    // Release first barrier
    barrier.resolve();
    const r1 = await p1;

    // Both succeeded with used=100, but the limit is 100.
    // One more call would read used=100 and return remaining=0.
    // The bug: two DMs were allowed when only one should have been.
    expect(r1.used).toBe(100);
    expect(r2.used).toBe(100);
    expect(r1.remaining).toBe(0);
    expect(r2.remaining).toBe(0);

    // Final store shows used=100 (last write wins)
    const final = JSON.parse(kv._store.get("dm_bypass:u1")!);
    expect(final.used).toBe(100);
  });

  it("prevents overuse when calls are sequential", async () => {
    const today = new Date().toISOString();
    const kv = createRacingMockKV({
      initial: new Map([
        ["dm_bypass:u1", JSON.stringify({ used: 99, resetAt: today })],
      ]),
    });

    const r1 = await useDMBypass(kv, "u1");
    expect(r1.used).toBe(100);
    expect(r1.remaining).toBe(0);

    const r2 = await useDMBypass(kv, "u1");
    expect(r2.used).toBe(101); // code doesn't prevent exceeding limit
    expect(r2.remaining).toBe(0); // Math.max(0, ...) clamps to zero
  });
});
