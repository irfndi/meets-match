import { Effect } from "effect";
import type { D1Database } from "@cloudflare/workers-types";
import {
  Match,
  MatchStatus,
  MatchAction,
  type CreateMatchRequest,
  type GetMatchRequest,
  type GetMatchListRequest,
  type LikeMatchRequest,
  type DislikeMatchRequest,
  type SkipMatchRequest,
  type GetPotentialMatchesRequest,
} from "@meetsmatch/cf-shared";
import { NotFoundError, DatabaseError } from "@meetsmatch/cf-shared";

export class MatchRepository {
  constructor(private readonly db: D1Database) {}

  getById(req: GetMatchRequest): Effect.Effect<typeof Match.Type, NotFoundError | DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        if (!result) throw new NotFoundError("Match", req.matchId);
        return this.toMatch(result);
      },
      catch: (error) => (error instanceof NotFoundError ? error : new DatabaseError("getById", error)),
    });
  }

  getList(req: GetMatchListRequest): Effect.Effect<Array<typeof Match.Type>, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        let sql = "SELECT * FROM matches WHERE user1_id = ? OR user2_id = ?";
        const values = [req.userId, req.userId];
        if (req.status) { sql += " AND status = ?"; values.push(req.status); }
        sql += " ORDER BY created_at DESC";
        if (req.limit) { sql += " LIMIT ?"; values.push(String(req.limit)); }
        if (req.offset) { sql += " OFFSET ?"; values.push(String(req.offset)); }
        const { results } = await this.db.prepare(sql).bind(...values).all();
        return (results ?? []).map((r) => this.toMatch(r as Record<string, unknown>));
      },
      catch: (error) => new DatabaseError("getList", error),
    });
  }

  create(req: CreateMatchRequest): Effect.Effect<typeof Match.Type, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const id = crypto.randomUUID();
        await this.db.prepare(
          `INSERT INTO matches (id, user1_id, user2_id, status, score, created_at, updated_at, matched_at, user1_action, user2_action)
           VALUES (?, ?, ?, 'pending', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, 'none', 'none')`
        ).bind(id, req.user1Id, req.user2Id).run();
        return { id, user1Id: req.user1Id, user2Id: req.user2Id, status: "PENDING" as const } as typeof Match.Type;
      },
      catch: (error) => new DatabaseError("create", error),
    });
  }

  like(req: LikeMatchRequest): Effect.Effect<{ isMutual: boolean; match: typeof Match.Type }, NotFoundError | DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const match = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        if (!match) throw new NotFoundError("Match", req.matchId);

        const row = this.toMatch(match);
        const isUser1 = row.user1Id === req.userId;
        const actionCol = isUser1 ? "user1_action" : "user2_action";
        const otherAction = isUser1 ? row.user2Action : row.user1Action;

        await this.db.prepare(`UPDATE matches SET ${actionCol} = 'like', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(req.matchId).run();

        const isMutual = otherAction === "LIKE";
        if (isMutual) {
          await this.db.prepare("UPDATE matches SET status = 'matched', matched_at = CURRENT_TIMESTAMP WHERE id = ?").bind(req.matchId).run();
        }

        const updated = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        return { isMutual, match: this.toMatch(updated!) };
      },
      catch: (error) => (error instanceof NotFoundError ? error : new DatabaseError("like", error)),
    });
  }

  dislike(req: DislikeMatchRequest): Effect.Effect<typeof Match.Type, NotFoundError | DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const match = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        if (!match) throw new NotFoundError("Match", req.matchId);
        const isUser1 = String((match as Record<string, unknown>).user1_id) === req.userId;
        const actionCol = isUser1 ? "user1_action" : "user2_action";
        await this.db.prepare(`UPDATE matches SET ${actionCol} = 'dislike', status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(req.matchId).run();
        const updated = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        return this.toMatch(updated!);
      },
      catch: (error) => (error instanceof NotFoundError ? error : new DatabaseError("dislike", error)),
    });
  }

  skip(req: SkipMatchRequest): Effect.Effect<typeof Match.Type, NotFoundError | DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const match = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        if (!match) throw new NotFoundError("Match", req.matchId);
        const isUser1 = String((match as Record<string, unknown>).user1_id) === req.userId;
        const actionCol = isUser1 ? "user1_action" : "user2_action";
        await this.db.prepare(`UPDATE matches SET ${actionCol} = 'skip', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(req.matchId).run();
        const updated = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        return this.toMatch(updated!);
      },
      catch: (error) => (error instanceof NotFoundError ? error : new DatabaseError("skip", error)),
    });
  }

  getPotentialMatches(req: GetPotentialMatchesRequest): Effect.Effect<Array<typeof Match.Type>, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const limit = req.limit ?? 10;
        const { results } = await this.db.prepare(
          `SELECT * FROM matches
           WHERE (user1_id = ? OR user2_id = ?)
           AND status = 'pending'
           AND user1_action = 'none' AND user2_action = 'none'
           ORDER BY created_at DESC
           LIMIT ?`
        ).bind(req.userId, req.userId, String(limit)).all();
        return (results ?? []).map((r) => this.toMatch(r as Record<string, unknown>));
      },
      catch: (error) => new DatabaseError("getPotentialMatches", error),
    });
  }

  private toMatch(row: Record<string, unknown>): typeof Match.Type {
    return {
      id: String(row.id),
      user1Id: String(row.user1_id),
      user2Id: String(row.user2_id),
      status: String(row.status).toUpperCase() as typeof MatchStatus.Type,
      score: row.score ? JSON.parse(String(row.score)) : undefined,
      createdAt: row.created_at ? String(row.created_at) : undefined,
      updatedAt: row.updated_at ? String(row.updated_at) : undefined,
      matchedAt: row.matched_at ? String(row.matched_at) : undefined,
      user1Action: row.user1_action ? String(row.user1_action).toUpperCase() as typeof MatchAction.Type : undefined,
      user2Action: row.user2_action ? String(row.user2_action).toUpperCase() as typeof MatchAction.Type : undefined,
    };
  }
}
