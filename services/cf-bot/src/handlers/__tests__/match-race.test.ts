import { describe, it, expect } from "vitest";
import {
  createRaceBarrier,
  createRacingMockKV,
} from "@meetsmatch/cf-shared/testing/race-mocks";
import {
  acquireActionLock,
  releaseActionLock,
  getDMBypassStatus,
  useDMBypass,
} from "../match.js";

describe("acquireActionLock race conditions", () => {
  it.skip("prevents double-locking when two calls race (intended behavior)", async () => {
    // TODO: unskip when check-then-set race is fixed.
    // The intended behavior: only one concurrent acquire should succeed.
    const barrier = createRaceBarrier();

    let putCount = 0;
    const kv = createRacingMockKV({
      pauseBeforePut: (key) => {
        if (key === "action_lock:u1" && putCount === 0) {
          putCount++;
          return barrier.promise;
        }
        return undefined;
      },
    });

    const p1 = acquireActionLock(kv, "u1");
    // Wait until first call is paused at put()
    for (let i = 0; i < 100 && putCount === 0; i++) {
      await Promise.resolve();
    }
    expect(putCount).toBe(1);

    const r2 = await acquireActionLock(kv, "u1");

    barrier.resolve();
    const r1 = await p1;

    // Intended invariant: exactly one acquire succeeds
    const successes = [r1, r2].filter(Boolean).length;
    expect(successes).toBe(1);
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
  it.skip("prevents overuse when two calls race at the limit boundary (intended behavior)", async () => {
    // TODO: unskip when check-then-set race is fixed.
    // The intended behavior: only one concurrent call should consume the last slot.
    const today = new Date().toISOString();
    const barrier = createRaceBarrier();

    let putCount = 0;
    const kv = createRacingMockKV({
      initial: new Map([
        ["dm_bypass:u1", JSON.stringify({ used: 99, resetAt: today })],
      ]),
      pauseBeforePut: (key) => {
        if (key === "dm_bypass:u1" && putCount === 0) {
          putCount++;
          return barrier.promise;
        }
        return undefined;
      },
    });

    const p1 = useDMBypass(kv, "u1");
    // Wait until first call is paused at put()
    for (let i = 0; i < 100 && putCount === 0; i++) {
      await Promise.resolve();
    }
    expect(putCount).toBe(1);

    const r2 = await useDMBypass(kv, "u1");

    barrier.resolve();
    const r1 = await p1;

    // Intended invariant: total used should not exceed 100
    const totalUsed = Math.max(r1.used, r2.used);
    expect(totalUsed).toBeLessThanOrEqual(100);
  });

  it("increments usage when calls are sequential", async () => {
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
    expect(r2.used).toBe(100); // capped at limit
    expect(r2.remaining).toBe(0);
  });
});
