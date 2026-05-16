import { Effect } from "effect";
import type { D1Database } from "@cloudflare/workers-types";
import {
  NotFoundError,
  DatabaseError,
  ValidationError,
} from "@meetsmatch/cf-shared";

export class BlockRepository {
  constructor(private readonly db: D1Database) {}

  block(req: {
    blockerId: string;
    blockedId: string;
  }): Effect.Effect<
    { success: boolean },
    DatabaseError | ValidationError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        if (req.blockerId === req.blockedId) {
          throw new ValidationError("blockedId", "Cannot block yourself");
        }
        await this.db
          .prepare(
            `INSERT INTO blocks (blocker_id, blocked_id, created_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)
             ON CONFLICT(blocker_id, blocked_id) DO NOTHING`,
          )
          .bind(req.blockerId, req.blockedId)
          .run();
        return { success: true };
      },
      catch: (error) =>
        error instanceof ValidationError
          ? error
          : new DatabaseError("block", error),
    });
  }

  unblock(req: {
    blockerId: string;
    blockedId: string;
  }): Effect.Effect<
    { success: boolean },
    DatabaseError | ValidationError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        if (req.blockerId === req.blockedId) {
          throw new ValidationError("blockedId", "Cannot unblock yourself");
        }
        await this.db
          .prepare("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?")
          .bind(req.blockerId, req.blockedId)
          .run();
        return { success: true };
      },
      catch: (error) =>
        error instanceof ValidationError
          ? error
          : new DatabaseError("unblock", error),
    });
  }

  getBlockedIds(req: {
    blockerId: string;
  }): Effect.Effect<string[], DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const { results } = await this.db
          .prepare("SELECT blocked_id FROM blocks WHERE blocker_id = ?")
          .bind(req.blockerId)
          .all<{ blocked_id: string }>();
        return (results ?? []).map((r) => r.blocked_id);
      },
      catch: (error) => new DatabaseError("getBlockedIds", error),
    });
  }

  isBlocked(req: {
    userId: string;
    otherUserId: string;
  }): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db
          .prepare(
            `SELECT 1 FROM blocks
             WHERE (blocker_id = ? AND blocked_id = ?)
                OR (blocker_id = ? AND blocked_id = ?)
             LIMIT 1`,
          )
          .bind(req.userId, req.otherUserId, req.otherUserId, req.userId)
          .first();
        return !!result;
      },
      catch: (error) => new DatabaseError("isBlocked", error),
    });
  }
}
