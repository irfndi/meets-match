import { Effect } from "effect";
import type { D1Database } from "@cloudflare/workers-types";
import {
  Match,
  MatchStatus,
  MatchAction,
  User,
  type CreateMatchRequest,
  type GetMatchRequest,
  type GetMatchListRequest,
  type LikeMatchRequest,
  type DislikeMatchRequest,
  type SkipMatchRequest,
  type GetPotentialMatchesRequest,
} from "@meetsmatch/cf-shared";
import { NotFoundError, DatabaseError, ValidationError } from "@meetsmatch/cf-shared";
import { UserRepository } from "./user.js";

export class MatchRepository {
  constructor(
    private readonly db: D1Database,
    private readonly userRepo?: UserRepository
  ) {}

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

  like(req: LikeMatchRequest): Effect.Effect<{ isMutual: boolean; match: typeof Match.Type }, NotFoundError | DatabaseError | ValidationError, never> {
    return Effect.tryPromise({
      try: async () => {
        const match = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        if (!match) throw new NotFoundError("Match", req.matchId);

        const row = this.toMatch(match);
        if (req.userId !== row.user1Id && req.userId !== row.user2Id) {
          throw new ValidationError("userId", "User is not part of this match");
        }
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
      catch: (error) => (error instanceof NotFoundError || error instanceof ValidationError ? error : new DatabaseError("like", error)),
    });
  }

  dislike(req: DislikeMatchRequest): Effect.Effect<typeof Match.Type, NotFoundError | DatabaseError | ValidationError, never> {
    return Effect.tryPromise({
      try: async () => {
        const match = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        if (!match) throw new NotFoundError("Match", req.matchId);
        const row = this.toMatch(match);
        if (req.userId !== row.user1Id && req.userId !== row.user2Id) {
          throw new ValidationError("userId", "User is not part of this match");
        }
        const isUser1 = row.user1Id === req.userId;
        const actionCol = isUser1 ? "user1_action" : "user2_action";
        await this.db.prepare(`UPDATE matches SET ${actionCol} = 'dislike', status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(req.matchId).run();
        const updated = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        return this.toMatch(updated!);
      },
      catch: (error) => (error instanceof NotFoundError || error instanceof ValidationError ? error : new DatabaseError("dislike", error)),
    });
  }

  skip(req: SkipMatchRequest): Effect.Effect<typeof Match.Type, NotFoundError | DatabaseError | ValidationError, never> {
    return Effect.tryPromise({
      try: async () => {
        const match = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        if (!match) throw new NotFoundError("Match", req.matchId);
        const row = this.toMatch(match);
        if (req.userId !== row.user1Id && req.userId !== row.user2Id) {
          throw new ValidationError("userId", "User is not part of this match");
        }
        const isUser1 = row.user1Id === req.userId;
        const actionCol = isUser1 ? "user1_action" : "user2_action";
        await this.db.prepare(`UPDATE matches SET ${actionCol} = 'skip', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(req.matchId).run();
        const updated = await this.db.prepare("SELECT * FROM matches WHERE id = ?").bind(req.matchId).first();
        return this.toMatch(updated!);
      },
      catch: (error) => (error instanceof NotFoundError || error instanceof ValidationError ? error : new DatabaseError("skip", error)),
    });
  }

  getPotentialMatches(req: GetPotentialMatchesRequest): Effect.Effect<Array<typeof User.Type>, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const limit = req.limit ?? 10;
        if (!this.userRepo) throw new Error("UserRepository required for getPotentialMatches");

        // 1. Get current user
        const currentUser = await Effect.runPromise(this.userRepo.getById({ userId: req.userId }));

        // Check eligibility
        if (!currentUser.isActive || !currentUser.isProfileComplete) {
          return [];
        }

        // 2. Build query for candidates
        let sql = `
          SELECT id, username, first_name, last_name, bio, age, gender, interests, photos, location, preferences, is_active, is_profile_complete
          FROM users
          WHERE id != ? AND is_active = 1 AND is_profile_complete = 1
          AND id NOT IN (
            SELECT user2_id FROM matches WHERE user1_id = ?
            UNION
            SELECT user1_id FROM matches WHERE user2_id = ?
          )
        `;
        const values: unknown[] = [currentUser.id, currentUser.id, currentUser.id];

        // Apply preference filters
        const prefs = currentUser.preferences;
        if (prefs?.minAge && prefs.minAge > 0) {
          sql += " AND age >= ?";
          values.push(prefs.minAge);
        }
        if (prefs?.maxAge && prefs.maxAge > 0) {
          sql += " AND age <= ?";
          values.push(prefs.maxAge);
        }
        if (prefs?.genderPreference && prefs.genderPreference.length > 0) {
          const placeholders = prefs.genderPreference.map(() => "?").join(",");
          sql += ` AND gender IN (${placeholders})`;
          values.push(...prefs.genderPreference);
        }

        sql += ` LIMIT ${limit * 5}`;

        const { results } = await this.db.prepare(sql).bind(...values).all();
        const candidates = (results ?? []).map((r) => this.rowToUser(r as Record<string, unknown>));

        // 3. Score candidates
        const scored = candidates
          .map((candidate) => {
            // Verify distance hard constraint
            if (currentUser.location && candidate.location && prefs?.maxDistance) {
              const dist = haversine(
                currentUser.location.latitude, currentUser.location.longitude,
                candidate.location.latitude, candidate.location.longitude
              );
              if (dist > prefs.maxDistance) return null;
            }

            const score = calculateMatchScore(currentUser, candidate);
            return { user: candidate, score: score.total };
          })
          .filter((s): s is { user: typeof User.Type; score: number } => s !== null);

        // 4. Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // 5. Return top limit
        return scored.slice(0, limit).map((s) => s.user);
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

  private rowToUser(row: Record<string, unknown>): typeof User.Type {
    return {
      id: String(row.id),
      username: row.username ? String(row.username) : undefined,
      firstName: row.first_name ? String(row.first_name) : undefined,
      lastName: row.last_name ? String(row.last_name) : undefined,
      bio: row.bio ? String(row.bio) : undefined,
      age: row.age ? Number(row.age) : undefined,
      gender: row.gender ? String(row.gender) as typeof import("@meetsmatch/cf-shared").Gender.Type : undefined,
      interests: row.interests ? JSON.parse(String(row.interests)) : [],
      photos: row.photos ? JSON.parse(String(row.photos)) : [],
      location: row.location ? JSON.parse(String(row.location)) : undefined,
      preferences: row.preferences ? JSON.parse(String(row.preferences)) : {},
      isActive: row.is_active ? Number(row.is_active) === 1 : true,
      isSleeping: row.is_sleeping ? Number(row.is_sleeping) === 1 : false,
      isProfileComplete: row.is_profile_complete ? Number(row.is_profile_complete) === 1 : false,
    };
  }
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180.0);
  const dLon = (lon2 - lon1) * (Math.PI / 180.0);
  const lat1Rad = lat1 * (Math.PI / 180.0);
  const lat2Rad = lat2 * (Math.PI / 180.0);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1Rad) * Math.cos(lat2Rad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface MatchScore {
  location: number;
  interests: number;
  preferences: number;
  total: number;
}

function calculateMatchScore(user1: typeof User.Type, user2: typeof User.Type): MatchScore {
  const score: MatchScore = { location: 0, interests: 0, preferences: 0, total: 0 };

  // 1. Location Score
  if (user1.location && user2.location) {
    const dist = haversine(user1.location.latitude, user1.location.longitude, user2.location.latitude, user2.location.longitude);
    const maxDist = user1.preferences?.maxDistance ?? 20.0;
    if (dist <= maxDist) {
      score.location = 1.0 - (dist / maxDist);
    }
  }

  // 2. Interests Score (Jaccard)
  if (user1.interests && user1.interests.length > 0 && user2.interests && user2.interests.length > 0) {
    const set1 = new Set(user1.interests);
    const set2 = new Set(user2.interests);
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    if (union.size > 0) {
      score.interests = intersection.size / union.size;
    }
  }

  // 3. Preferences Score
  let prefMatches = 0;
  let prefChecks = 0;
  const prefs = user1.preferences;

  // Age
  if (prefs?.minAge && prefs?.maxAge && user2.age) {
    prefChecks++;
    if (user2.age >= prefs.minAge && user2.age <= prefs.maxAge) {
      prefMatches++;
    }
  }

  // Gender
  if (prefs?.genderPreference && prefs.genderPreference.length > 0 && user2.gender) {
    prefChecks++;
    const allowed = prefs.genderPreference.includes(user2.gender);
    if (allowed) prefMatches++;
  }

  // Relationship type overlap
  if (prefs?.relationshipType && prefs.relationshipType.length > 0 && user2.preferences?.relationshipType && user2.preferences.relationshipType.length > 0) {
    prefChecks++;
    const set1 = new Set(prefs.relationshipType);
    const overlap = user2.preferences.relationshipType.some((rt) => set1.has(rt));
    if (overlap) prefMatches++;
  }

  if (prefChecks > 0) {
    score.preferences = prefMatches / prefChecks;
  }

  // Total Weighted Score
  score.total = (score.location * 0.3) + (score.interests * 0.4) + (score.preferences * 0.3);

  // Normalize
  if (score.total > 1.0) {
    score.total = 1.0;
  }

  return score;
}
