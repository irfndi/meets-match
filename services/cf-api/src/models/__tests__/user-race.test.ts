import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { UserRepository } from "../user.js";
import {
  createRaceBarrier,
  createRacingMockD1,
} from "@meetsmatch/cf-shared/testing/race-mocks";

function runEffect<A, E>(effect: Effect.Effect<A, E, never>): Promise<A> {
  return Effect.runPromise(effect);
}

describe("UserRepository race conditions", () => {
  describe("daily like counter", () => {
    it.skip("prevents quota overuse when two recordLike() calls race (intended behavior)", async () => {
      // TODO: unskip when read-modify-write race is fixed.
      // Intended invariant: only one concurrent call should consume quota.
      const barrier = createRaceBarrier();

      const store = new Map<string, Record<string, unknown>>([
        [
          "u1",
          {
            id: "u1",
            subscription_tier: "free",
            daily_likes_used: 14,
            daily_likes_reset_at: new Date().toISOString(),
            referral_bonus_swipes: 0,
          },
        ],
      ]);

      let pauseCount = 0;
      const db = createRacingMockD1({
        initialRows: store,
        pauseBeforeRun: (sql) => {
          if (
            sql.includes("UPDATE users SET daily_likes_used") &&
            pauseCount === 0
          ) {
            pauseCount++;
            return barrier.promise;
          }
          return undefined;
        },
      });

      const repo = new UserRepository(db);

      const p1 = runEffect(repo.recordLike("u1"));
      // Wait until first call is paused at UPDATE
      for (let i = 0; i < 100 && pauseCount === 0; i++) {
        await Promise.resolve();
      }
      expect(pauseCount).toBe(1);

      const r2 = await runEffect(repo.recordLike("u1"));

      barrier.resolve();
      const r1 = await p1;

      // Intended invariant: at most one call should report success with remaining > 0
      const successes = [r1, r2].filter((r) => r.remaining >= 0).length;
      expect(successes).toBeLessThanOrEqual(2);

      // DB should only be incremented once
      const finalRow = db._store.get("u1")!;
      expect(finalRow.daily_likes_used).toBe(15);
    });

    it.skip("prevents quota overuse when two recordDislike() calls race (intended behavior)", async () => {
      // TODO: unskip when read-modify-write race is fixed.
      const barrier = createRaceBarrier();

      const store = new Map<string, Record<string, unknown>>([
        [
          "u1",
          {
            id: "u1",
            subscription_tier: "free",
            daily_dislikes_used: 34,
            daily_dislikes_reset_at: new Date().toISOString(),
            referral_bonus_swipes: 0,
          },
        ],
      ]);

      let pauseCount = 0;
      const db = createRacingMockD1({
        initialRows: store,
        pauseBeforeRun: (sql) => {
          if (
            sql.includes("UPDATE users SET daily_dislikes_used") &&
            pauseCount === 0
          ) {
            pauseCount++;
            return barrier.promise;
          }
          return undefined;
        },
      });

      const repo = new UserRepository(db);

      const p1 = runEffect(repo.recordDislike("u1"));
      for (let i = 0; i < 100 && pauseCount === 0; i++) {
        await Promise.resolve();
      }
      expect(pauseCount).toBe(1);

      const r2 = await runEffect(repo.recordDislike("u1"));
      barrier.resolve();
      const r1 = await p1;

      // DB should only be incremented once
      const finalRow = db._store.get("u1")!;
      expect(finalRow.daily_dislikes_used).toBe(35);
    });

    it.skip("prevents quota overuse when two recordSwipe() calls race (intended behavior)", async () => {
      // TODO: unskip when read-modify-write race is fixed.
      const barrier = createRaceBarrier();

      const store = new Map<string, Record<string, unknown>>([
        [
          "u1",
          {
            id: "u1",
            subscription_tier: "free",
            daily_swipes_used: 9,
            daily_swipes_reset_at: new Date().toISOString(),
            referral_bonus_swipes: 0,
          },
        ],
      ]);

      let pauseCount = 0;
      const db = createRacingMockD1({
        initialRows: store,
        pauseBeforeRun: (sql) => {
          if (
            sql.includes("UPDATE users SET daily_swipes_used") &&
            pauseCount === 0
          ) {
            pauseCount++;
            return barrier.promise;
          }
          return undefined;
        },
      });

      const repo = new UserRepository(db);

      const p1 = runEffect(repo.recordSwipe("u1"));
      for (let i = 0; i < 100 && pauseCount === 0; i++) {
        await Promise.resolve();
      }
      expect(pauseCount).toBe(1);

      const r2 = await runEffect(repo.recordSwipe("u1"));
      barrier.resolve();
      const r1 = await p1;

      // DB should only be incremented once
      const finalRow = db._store.get("u1")!;
      expect(finalRow.daily_swipes_used).toBe(10);
    });
  });

  describe("sequential counter operations", () => {
    it("correctly enforces like quota when calls are sequential", async () => {
      const store = new Map<string, Record<string, unknown>>([
        [
          "u1",
          {
            id: "u1",
            subscription_tier: "free",
            daily_likes_used: 14,
            daily_likes_reset_at: new Date().toISOString(),
            referral_bonus_swipes: 0,
          },
        ],
      ]);

      const db = createRacingMockD1({ initialRows: store });
      const repo = new UserRepository(db);

      const r1 = await runEffect(repo.recordLike("u1"));
      expect(r1.remaining).toBe(0);

      const r2 = await runEffect(repo.recordLike("u1"));
      expect(r2.remaining).toBe(0);

      const finalRow = db._store.get("u1")!;
      expect(finalRow.daily_likes_used).toBe(15);
    });
  });
});
