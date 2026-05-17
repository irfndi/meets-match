import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { MatchRepository } from "../match.js";
import { UserRepository } from "../user.js";
import {
  createRaceBarrier,
  createRacingMockD1,
} from "@meetsmatch/cf-shared/testing/race-mocks";

function runEffect<A, E>(effect: Effect.Effect<A, E, never>): Promise<A> {
  return Effect.runPromise(effect);
}

describe("MatchRepository race conditions", () => {
  describe("mutual match detection", () => {
    it("fails to detect mutuality when two likes race (read-modify-write bug)", async () => {
      // This test documents a known race condition.
      // The like() method reads the match row, checks otherAction, then updates.
      // If two likes interleave such that both read stale state, neither sees
      // the other's action and the status remains 'pending' forever.
      const barrier = createRaceBarrier();

      const store = new Map<string, Record<string, unknown>>([
        [
          "m1",
          {
            id: "m1",
            user1_id: "u1",
            user2_id: "u2",
            status: "pending",
            user1_action: "none",
            user2_action: "none",
            score: "{}",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            matched_at: null,
            like_message: null,
          },
        ],
      ]);

      let callCount = 0;
      const db = createRacingMockD1({
        initialRows: store,
        pauseBeforeRun: (sql) => {
          // Pause the FIRST like() call at its UPDATE, letting the second
          // call read the same stale state and write first.
          if (sql.includes("UPDATE matches SET") && callCount === 0) {
            callCount++;
            return barrier.promise;
          }
          return undefined;
        },
      });

      const userRepo = new UserRepository(db);
      const matchRepo = new MatchRepository(db, userRepo);

      // Start user1's like() — will pause at UPDATE
      const p1 = runEffect(
        matchRepo.like({ matchId: "m1", userId: "u1" }),
      );

      // Give p1 time to reach the barrier (read stale state)
      await new Promise((r) => setTimeout(r, 10));

      // Start user2's like() — reads same stale state, writes immediately
      const p2 = await runEffect(
        matchRepo.like({ matchId: "m1", userId: "u2" }),
      );

      // Release user1's barrier so it can complete its UPDATE
      barrier.resolve();
      const p1Result = await p1;

      // Both calls succeeded
      expect(p1Result.isMutual).toBe(false); // user1 didn't see user2's like
      expect(p2.isMutual).toBe(false); // user2 didn't see user1's like

      // Final DB state: both actions are 'like' but status is still 'pending'
      const finalRow = db._store.get("m1")!;
      expect(finalRow.user1_action).toBe("like");
      expect(finalRow.user2_action).toBe("like");
      expect(finalRow.status).toBe("pending"); // BUG: should be 'matched'
    });

    it("correctly detects mutuality when likes are sequential", async () => {
      const store = new Map<string, Record<string, unknown>>([
        [
          "m1",
          {
            id: "m1",
            user1_id: "u1",
            user2_id: "u2",
            status: "pending",
            user1_action: "none",
            user2_action: "none",
            score: "{}",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            matched_at: null,
            like_message: null,
          },
        ],
      ]);

      const db = createRacingMockD1({ initialRows: store });
      const userRepo = new UserRepository(db);
      const matchRepo = new MatchRepository(db, userRepo);

      // User1 likes first
      const r1 = await runEffect(
        matchRepo.like({ matchId: "m1", userId: "u1" }),
      );
      expect(r1.isMutual).toBe(false);

      // User2 likes second — should see user1's action
      const r2 = await runEffect(
        matchRepo.like({ matchId: "m1", userId: "u2" }),
      );
      expect(r2.isMutual).toBe(true);

      const finalRow = db._store.get("m1")!;
      expect(finalRow.status).toBe("matched");
      expect(finalRow.user1_action).toBe("like");
      expect(finalRow.user2_action).toBe("like");
    });
  });

  describe("undo racing with concurrent like", () => {
    it("documents race when undo() and like() interleave", async () => {
      const barrier = createRaceBarrier();

      const store = new Map<string, Record<string, unknown>>([
        [
          "m1",
          {
            id: "m1",
            user1_id: "u1",
            user2_id: "u2",
            status: "pending",
            user1_action: "like",
            user2_action: "none",
            score: "{}",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            matched_at: null,
            like_message: null,
          },
        ],
      ]);

      let callCount = 0;
      const db = createRacingMockD1({
        initialRows: store,
        pauseBeforeRun: (sql) => {
          // Pause undo() at its UPDATE
          if (sql.includes("UPDATE matches SET") && callCount === 0) {
            callCount++;
            return barrier.promise;
          }
          return undefined;
        },
      });

      const userRepo = new UserRepository(db);
      const matchRepo = new MatchRepository(db, userRepo);

      // Start undo() for user1 — will pause at UPDATE
      const pUndo = runEffect(
        matchRepo.undo({ matchId: "m1", userId: "u1" }),
      );
      await new Promise((r) => setTimeout(r, 10));

      // User2 likes while undo is paused
      await runEffect(matchRepo.like({ matchId: "m1", userId: "u2" }));

      // Release undo barrier
      barrier.resolve();
      await pUndo;

      // Final state depends on execution order — here undo overwrites the like
      const finalRow = db._store.get("m1")!;
      expect(finalRow.user1_action).toBe("none");
      // user2's like may or may not have been overwritten depending on exact timing
    });
  });
});
