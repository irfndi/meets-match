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
    it("allows quota overuse when two recordLike() calls race", async () => {
      // A free user has 15 likes/day. If they have 14 used and two
      // concurrent calls read the same state, both increment to 15
      // and both succeed. The user effectively got 16 likes.
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

      let callCount = 0;
      const db = createRacingMockD1({
        initialRows: store,
        pauseBeforeRun: (sql) => {
          if (
            sql.includes("UPDATE users SET daily_likes_used") &&
            callCount === 0
          ) {
            callCount++;
            return barrier.promise;
          }
          return undefined;
        },
      });

      const repo = new UserRepository(db);

      // Start first recordLike() — pauses at UPDATE
      const p1 = runEffect(repo.recordLike("u1"));
      await new Promise((r) => setTimeout(r, 10));

      // Second recordLike() reads same stale state (likes_used=14) and writes
      const r2 = await runEffect(repo.recordLike("u1"));

      // Release first barrier
      barrier.resolve();
      const r1 = await p1;

      // Both calls returned remaining=0 (they both think they consumed the last like)
      expect(r1.remaining).toBe(0);
      expect(r2.remaining).toBe(0);

      // But the DB only shows 15, not 16. One like was "lost" in the sense
      // that two API calls succeeded but only one unit of quota was consumed.
      // This is still a bug: two likes were granted for the cost of one.
      const finalRow = db._store.get("u1")!;
      expect(finalRow.daily_likes_used).toBe(15);
    });

    it("allows quota overuse when two recordDislike() calls race", async () => {
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

      let callCount = 0;
      const db = createRacingMockD1({
        initialRows: store,
        pauseBeforeRun: (sql) => {
          if (
            sql.includes("UPDATE users SET daily_dislikes_used") &&
            callCount === 0
          ) {
            callCount++;
            return barrier.promise;
          }
          return undefined;
        },
      });

      const repo = new UserRepository(db);

      const p1 = runEffect(repo.recordDislike("u1"));
      await new Promise((r) => setTimeout(r, 10));
      const r2 = await runEffect(repo.recordDislike("u1"));
      barrier.resolve();
      const r1 = await p1;

      expect(r1.remaining).toBe(0);
      expect(r2.remaining).toBe(0);

      const finalRow = db._store.get("u1")!;
      expect(finalRow.daily_dislikes_used).toBe(35); // only incremented once despite two calls
    });

    it("allows quota overuse when two recordSwipe() calls race", async () => {
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

      let callCount = 0;
      const db = createRacingMockD1({
        initialRows: store,
        pauseBeforeRun: (sql) => {
          if (
            sql.includes("UPDATE users SET daily_swipes_used") &&
            callCount === 0
          ) {
            callCount++;
            return barrier.promise;
          }
          return undefined;
        },
      });

      const repo = new UserRepository(db);

      const p1 = runEffect(repo.recordSwipe("u1"));
      await new Promise((r) => setTimeout(r, 10));
      const r2 = await runEffect(repo.recordSwipe("u1"));
      barrier.resolve();
      const r1 = await p1;

      expect(r1.remaining).toBe(0);
      expect(r2.remaining).toBe(0);

      const finalRow = db._store.get("u1")!;
      expect(finalRow.daily_swipes_used).toBe(10); // only incremented once
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
