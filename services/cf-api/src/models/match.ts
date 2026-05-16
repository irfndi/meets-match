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
import {
  NotFoundError,
  DatabaseError,
  ValidationError,
} from "@meetsmatch/cf-shared";
import { UserRepository } from "./user.js";
import { BlockRepository } from "./block.js";

export class MatchRepository {
  constructor(
    private readonly db: D1Database,
    private readonly userRepo?: UserRepository,
    private readonly blockRepo?: BlockRepository,
  ) {}

  getById(
    req: GetMatchRequest,
  ): Effect.Effect<typeof Match.Type, NotFoundError | DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db
          .prepare("SELECT * FROM matches WHERE id = ?")
          .bind(req.matchId)
          .first();
        if (!result) throw new NotFoundError("Match", req.matchId);
        return this.toMatch(result);
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("getById", error),
    });
  }

  getList(
    req: GetMatchListRequest,
  ): Effect.Effect<Array<typeof Match.Type>, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        let sql = "SELECT * FROM matches WHERE user1_id = ? OR user2_id = ?";
        const values = [req.userId, req.userId];
        if (req.status) {
          sql += " AND status = ?";
          values.push(req.status);
        }
        sql += " ORDER BY created_at DESC";
        if (req.limit) {
          sql += " LIMIT ?";
          values.push(String(req.limit));
        }
        if (req.offset) {
          sql += " OFFSET ?";
          values.push(String(req.offset));
        }
        const { results } = await this.db
          .prepare(sql)
          .bind(...values)
          .all();
        return (results ?? []).map((r) =>
          this.toMatch(r as Record<string, unknown>),
        );
      },
      catch: (error) => new DatabaseError("getList", error),
    });
  }

  create(
    req: CreateMatchRequest,
  ): Effect.Effect<typeof Match.Type, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        // Normalize pair ordering to prevent duplicates
        const [u1, u2] = [req.user1Id, req.user2Id].sort();

        // Check if match already exists
        const existing = await this.db
          .prepare("SELECT * FROM matches WHERE user1_id = ? AND user2_id = ?")
          .bind(u1, u2)
          .first();
        if (existing) {
          return this.toMatch(existing);
        }

        const id = crypto.randomUUID();
        await this.db
          .prepare(
            `INSERT INTO matches (id, user1_id, user2_id, status, score, created_at, updated_at, matched_at, user1_action, user2_action)
           VALUES (?, ?, ?, 'pending', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, 'none', 'none')`,
          )
          .bind(id, u1, u2)
          .run();
        return {
          id,
          user1Id: u1,
          user2Id: u2,
          status: "PENDING" as const,
        } as typeof Match.Type;
      },
      catch: (error) => new DatabaseError("create", error),
    });
  }

  like(
    req: LikeMatchRequest & { message?: { text?: string; mediaUrl?: string } },
  ): Effect.Effect<
    { isMutual: boolean; match: typeof Match.Type },
    NotFoundError | DatabaseError | ValidationError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const match = await this.db
          .prepare("SELECT * FROM matches WHERE id = ?")
          .bind(req.matchId)
          .first();
        if (!match) throw new NotFoundError("Match", req.matchId);

        const row = this.toMatch(match);
        if (req.userId !== row.user1Id && req.userId !== row.user2Id) {
          throw new ValidationError("userId", "User is not part of this match");
        }
        const isUser1 = row.user1Id === req.userId;
        const actionCol = isUser1 ? "user1_action" : "user2_action";
        const otherAction = isUser1 ? row.user2Action : row.user1Action;

        // Build update fields
        const updates: string[] = [`${actionCol} = 'like'`];
        const values: unknown[] = [];

        if (req.message && (req.message.text || req.message.mediaUrl)) {
          updates.push("like_message = ?");
          values.push(
            JSON.stringify({
              fromUserId: req.userId,
              text: req.message.text ?? null,
              mediaUrl: req.message.mediaUrl ?? null,
              createdAt: new Date().toISOString(),
            }),
          );
        }

        updates.push("updated_at = CURRENT_TIMESTAMP");
        values.push(req.matchId);

        await this.db
          .prepare(`UPDATE matches SET ${updates.join(", ")} WHERE id = ?`)
          .bind(...values)
          .run();

        const isMutual = otherAction === "LIKE";
        if (isMutual) {
          await this.db
            .prepare(
              "UPDATE matches SET status = 'matched', matched_at = CURRENT_TIMESTAMP WHERE id = ?",
            )
            .bind(req.matchId)
            .run();
        }

        const updated = await this.db
          .prepare("SELECT * FROM matches WHERE id = ?")
          .bind(req.matchId)
          .first();
        return { isMutual, match: this.toMatch(updated!) };
      },
      catch: (error) =>
        error instanceof NotFoundError || error instanceof ValidationError
          ? error
          : new DatabaseError("like", error),
    });
  }

  dislike(
    req: DislikeMatchRequest,
  ): Effect.Effect<
    typeof Match.Type,
    NotFoundError | DatabaseError | ValidationError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const match = await this.db
          .prepare("SELECT * FROM matches WHERE id = ?")
          .bind(req.matchId)
          .first();
        if (!match) throw new NotFoundError("Match", req.matchId);
        const row = this.toMatch(match);
        if (req.userId !== row.user1Id && req.userId !== row.user2Id) {
          throw new ValidationError("userId", "User is not part of this match");
        }
        const isUser1 = row.user1Id === req.userId;
        const actionCol = isUser1 ? "user1_action" : "user2_action";
        await this.db
          .prepare(
            `UPDATE matches SET ${actionCol} = 'dislike', status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          )
          .bind(req.matchId)
          .run();
        const updated = await this.db
          .prepare("SELECT * FROM matches WHERE id = ?")
          .bind(req.matchId)
          .first();
        return this.toMatch(updated!);
      },
      catch: (error) =>
        error instanceof NotFoundError || error instanceof ValidationError
          ? error
          : new DatabaseError("dislike", error),
    });
  }

  skip(
    req: SkipMatchRequest,
  ): Effect.Effect<
    typeof Match.Type,
    NotFoundError | DatabaseError | ValidationError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const match = await this.db
          .prepare("SELECT * FROM matches WHERE id = ?")
          .bind(req.matchId)
          .first();
        if (!match) throw new NotFoundError("Match", req.matchId);
        const row = this.toMatch(match);
        if (req.userId !== row.user1Id && req.userId !== row.user2Id) {
          throw new ValidationError("userId", "User is not part of this match");
        }
        const isUser1 = row.user1Id === req.userId;
        const actionCol = isUser1 ? "user1_action" : "user2_action";
        await this.db
          .prepare(
            `UPDATE matches SET ${actionCol} = 'skip', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          )
          .bind(req.matchId)
          .run();
        const updated = await this.db
          .prepare("SELECT * FROM matches WHERE id = ?")
          .bind(req.matchId)
          .first();
        return this.toMatch(updated!);
      },
      catch: (error) =>
        error instanceof NotFoundError || error instanceof ValidationError
          ? error
          : new DatabaseError("skip", error),
    });
  }

  undo(req: {
    matchId: string;
    userId: string;
  }): Effect.Effect<
    { restored: boolean; match: typeof Match.Type },
    NotFoundError | DatabaseError | ValidationError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const match = await this.db
          .prepare("SELECT * FROM matches WHERE id = ?")
          .bind(req.matchId)
          .first();
        if (!match) throw new NotFoundError("Match", req.matchId);
        const row = this.toMatch(match);
        if (req.userId !== row.user1Id && req.userId !== row.user2Id) {
          throw new ValidationError("userId", "User is not part of this match");
        }
        const isUser1 = row.user1Id === req.userId;
        const actionCol = isUser1 ? "user1_action" : "user2_action";
        const myAction = isUser1 ? row.user1Action : row.user2Action;

        // Only allow undo if there was a recent action (like, dislike, skip)
        if (!myAction || myAction === "NONE") {
          return { restored: false, match: row };
        }

        // Revert the user's action back to 'none'
        // If it was a mutual match, we also need to revert the match status
        const otherAction = isUser1 ? row.user2Action : row.user1Action;
        const wasMutual = myAction === "LIKE" && otherAction === "LIKE";

        if (wasMutual) {
          // Revert from matched back to pending
          await this.db
            .prepare(
              `UPDATE matches SET ${actionCol} = 'none', status = 'pending', matched_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            )
            .bind(req.matchId)
            .run();
        } else {
          // If my action caused a rejection, revert status back to pending too
          const wasRejection = myAction === "DISLIKE";
          if (wasRejection) {
            await this.db
              .prepare(
                `UPDATE matches SET ${actionCol} = 'none', status = 'pending', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              )
              .bind(req.matchId)
              .run();
          } else {
            await this.db
              .prepare(
                `UPDATE matches SET ${actionCol} = 'none', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
              )
              .bind(req.matchId)
              .run();
          }
        }

        const updated = await this.db
          .prepare("SELECT * FROM matches WHERE id = ?")
          .bind(req.matchId)
          .first();
        return { restored: true, match: this.toMatch(updated!) };
      },
      catch: (error) =>
        error instanceof NotFoundError || error instanceof ValidationError
          ? error
          : new DatabaseError("undo", error),
    });
  }

  getPotentialMatches(
    req: GetPotentialMatchesRequest & { relaxFilters?: boolean },
  ): Effect.Effect<Array<typeof User.Type>, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const limit = req.limit ?? 10;
        const relaxFilters = req.relaxFilters ?? false;
        if (!this.userRepo)
          throw new Error("UserRepository required for getPotentialMatches");

        // 1. Get current user
        const currentUser = await Effect.runPromise(
          this.userRepo.getById({ userId: req.userId }),
        );

        // Check eligibility
        if (!currentUser.isActive || !currentUser.isProfileComplete) {
          return [];
        }

        const prefs = currentUser.preferences;

        // 2. Build query for candidates including interacted profiles for cooldown/re-engagement
        // We fetch more candidates to allow filtering and variety
        const fetchLimit = limit * 10;
        let sql = `
          SELECT
            u.id, u.username, u.first_name, u.last_name, u.bio, u.age, u.gender,
            u.interests, u.media_urls, u.location, u.preferences, u.subscription_tier,
            u.is_active, u.is_profile_complete,
            m.user1_id, m.user2_id,
            m.status as match_status,
            m.user1_action, m.user2_action,
            m.updated_at as match_updated_at,
            m.matched_at,
            pv.viewed_at
          FROM users u
          LEFT JOIN matches m ON (
            (m.user1_id = u.id AND m.user2_id = ?) OR
            (m.user2_id = u.id AND m.user1_id = ?)
          )
          LEFT JOIN profile_views pv ON (pv.viewer_id = ? AND pv.viewed_id = u.id)
          WHERE u.id != ? AND u.is_active = 1 AND u.is_profile_complete = 1 AND u.hidden_from_matches = 0
        `;
        const values: unknown[] = [
          currentUser.id,
          currentUser.id,
          currentUser.id,
          currentUser.id,
        ];

        // Exclude blocked users (both directions)
        sql += ` AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_id = ? AND b.blocked_id = u.id)
             OR (b.blocker_id = u.id AND b.blocked_id = ?)
        )`;
        values.push(currentUser.id, currentUser.id);

        // Exclude profiles where current user already liked (pending) UNLESS the like is stale (>30 days)
        // Include mutual matches for recycling (handled in JS scoring)
        // Include rejected for cooldown (handled in JS)
        sql += ` AND (
          m.id IS NULL
          OR (
            m.status = 'pending' AND NOT (
              (
                (m.user1_id = ? AND m.user1_action = 'like' AND m.user2_action = 'none')
                OR
                (m.user2_id = ? AND m.user2_action = 'like' AND m.user1_action = 'none')
              )
              AND (m.updated_at > datetime('now', '-30 days'))
            )
          )
          OR (
            m.status = 'matched' AND (
              (m.user1_id = ? AND m.user1_action = 'like' AND m.user2_action = 'like')
              OR
              (m.user2_id = ? AND m.user2_action = 'like' AND m.user1_action = 'like')
            )
          )
          OR m.status = 'rejected'
        )`;
        values.push(
          currentUser.id,
          currentUser.id,
          currentUser.id,
          currentUser.id,
        );

        // Apply preference filters.
        // Gender preference is always enforced (never relaxed).
        // Age/distance: strict uses exact prefs; soft relax widens by ±3 years / ×2 distance.
        const minAge =
          prefs?.minAge && prefs.minAge > 0 ? prefs.minAge : undefined;
        const maxAge =
          prefs?.maxAge && prefs.maxAge > 0 ? prefs.maxAge : undefined;
        if (minAge !== undefined) {
          const effectiveMin = relaxFilters ? Math.max(12, minAge - 3) : minAge;
          sql += " AND u.age >= ?";
          values.push(effectiveMin);
        }
        if (maxAge !== undefined) {
          const effectiveMax = relaxFilters ? Math.min(80, maxAge + 3) : maxAge;
          sql += " AND u.age <= ?";
          values.push(effectiveMax);
        }
        if (prefs?.genderPreference && prefs.genderPreference.length > 0) {
          const placeholders = prefs.genderPreference.map(() => "?").join(",");
          sql += ` AND u.gender IN (${placeholders})`;
          values.push(...prefs.genderPreference);
        }

        sql += ` LIMIT ${fetchLimit}`;

        const { results } = await this.db
          .prepare(sql)
          .bind(...values)
          .all();
        const rows = (results ?? []) as Array<Record<string, unknown>>;

        // 3. Filter and score candidates
        const now = new Date();
        const scored = rows
          .map((row) => {
            const candidate = this.rowToUser(row);
            const matchStatus = row.match_status
              ? String(row.match_status)
              : null;
            const user1Action = row.user1_action
              ? String(row.user1_action).toUpperCase()
              : null;
            const user2Action = row.user2_action
              ? String(row.user2_action).toUpperCase()
              : null;
            const matchUpdatedAt = row.match_updated_at
              ? String(row.match_updated_at)
              : null;
            const matchedAt = row.matched_at ? String(row.matched_at) : null;
            const viewedAt = row.viewed_at ? String(row.viewed_at) : null;

            // Determine current user's action in this match
            const isUser1InMatch = row.user1_id === currentUser.id;
            const myAction = isUser1InMatch ? user1Action : user2Action;
            const otherAction = isUser1InMatch ? user2Action : user1Action;

            // --- Bidirectional preference check ---
            const candidatePrefs = candidate.preferences;
            if (
              candidatePrefs?.genderPreference &&
              candidatePrefs.genderPreference.length > 0 &&
              currentUser.gender
            ) {
              if (
                !candidatePrefs.genderPreference.includes(currentUser.gender)
              ) {
                return null;
              }
            }
            if (
              candidatePrefs?.minAge != null &&
              candidatePrefs?.maxAge != null &&
              currentUser.age != null
            ) {
              if (
                currentUser.age < candidatePrefs.minAge ||
                currentUser.age > candidatePrefs.maxAge
              ) {
                return null;
              }
            }
            // Distance from candidate's perspective
            if (
              candidate.location?.latitude != null &&
              candidate.location?.longitude != null &&
              currentUser.location?.latitude != null &&
              currentUser.location?.longitude != null &&
              candidatePrefs?.maxDistance
            ) {
              const dist = haversine(
                candidate.location.latitude,
                candidate.location.longitude,
                currentUser.location.latitude,
                currentUser.location.longitude,
              );
              if (dist > candidatePrefs.maxDistance) return null;
            }

            // --- Current user's distance hard constraint ---
            if (
              currentUser.location?.latitude != null &&
              currentUser.location?.longitude != null &&
              candidate.location?.latitude != null &&
              candidate.location?.longitude != null &&
              prefs?.maxDistance
            ) {
              const dist = haversine(
                currentUser.location.latitude,
                currentUser.location.longitude,
                candidate.location.latitude,
                candidate.location.longitude,
              );
              const effectiveMaxDist = relaxFilters
                ? Math.min(500, prefs.maxDistance * 2)
                : prefs.maxDistance;
              if (dist > effectiveMaxDist) return null;
            }

            // --- Cooldown filtering ---

            // Dislike cooldown: 3 days hard exclusion
            if (
              matchStatus === "rejected" &&
              myAction === "DISLIKE" &&
              matchUpdatedAt
            ) {
              const cooldownMs = 3 * 24 * 60 * 60 * 1000; // 3 days
              if (
                now.getTime() - new Date(matchUpdatedAt).getTime() <
                cooldownMs
              ) {
                return null;
              }
            }

            // Skip cooldown: 6 hours, BUT bypass if the other user liked us
            if (myAction === "SKIP" && matchUpdatedAt) {
              if (otherAction !== "LIKE") {
                const cooldownMs = 6 * 60 * 60 * 1000; // 6 hours
                if (
                  now.getTime() - new Date(matchUpdatedAt).getTime() <
                  cooldownMs
                ) {
                  return null;
                }
              }
            }

            // Pending like expiration: exclude fresh pending likes (<30 days)
            // This is also handled in SQL, but added here as defensive fallback
            if (
              matchStatus === "pending" &&
              myAction === "LIKE" &&
              otherAction === "NONE" &&
              matchUpdatedAt
            ) {
              const expireMs = 30 * 24 * 60 * 60 * 1000; // 30 days
              if (
                now.getTime() - new Date(matchUpdatedAt).getTime() <
                expireMs
              ) {
                return null;
              }
            }

            // --- Calculate base score ---
            let baseScore = calculateMatchScore(currentUser, candidate).total;

            // Variety: penalize recently shown profiles
            if (viewedAt) {
              const hoursSinceViewed =
                (now.getTime() - new Date(viewedAt).getTime()) /
                (1000 * 60 * 60);
              if (hoursSinceViewed < 24) {
                baseScore *= 0.1; // Heavily penalize profiles shown in last 24h
              } else if (hoursSinceViewed < 72) {
                baseScore *= 0.5;
              }
            }

            // Matched recycling: recent matches deprioritized, old matches normalize
            if (matchStatus === "matched" && matchedAt) {
              const daysSinceMatched =
                (now.getTime() - new Date(matchedAt).getTime()) /
                (1000 * 60 * 60 * 24);
              if (daysSinceMatched < 14) {
                baseScore *= 0.05; // Very low priority for fresh matches
              } else if (daysSinceMatched < 30) {
                baseScore *= 0.3; // Medium priority for 14-30 day matches
              } // >30 days: normal priority (allow rematch)
            }

            // Disliked after cooldown: lower priority, normalizes after 14 days
            if (matchStatus === "rejected" && myAction === "DISLIKE") {
              const daysSinceDislike = matchUpdatedAt
                ? (now.getTime() - new Date(matchUpdatedAt).getTime()) /
                  (1000 * 60 * 60 * 24)
                : 999;
              if (daysSinceDislike < 14) {
                baseScore *= 0.3;
              } // 14-30 days stays at 0.3, >30 normalizes
            }

            // Skip with incoming like: slight penalty but still visible
            if (myAction === "SKIP" && otherAction === "LIKE") {
              baseScore *= 0.8;
            }

            // Premium boost: higher base random range for paid tiers
            const candidateTier = candidate.subscriptionTier ?? "free";
            let randomFactor: number;
            if (candidateTier === "premium_plus") {
              randomFactor = 1.0 + Math.random() * 0.3; // 1.0 - 1.3 (up to +30%)
            } else if (candidateTier === "premium") {
              randomFactor = 0.85 + Math.random() * 0.3; // 0.85 - 1.15 (up to +15%)
            } else {
              randomFactor = 0.7 + Math.random() * 0.3; // 0.7 - 1.0 (base)
            }
            baseScore *= randomFactor;

            return { user: candidate, score: baseScore };
          })
          .filter(
            (s): s is { user: typeof User.Type; score: number } => s !== null,
          );

        // 4. Sort by score descending
        scored.sort((a, b) => b.score - a.score);

        // 5. Return top limit
        const selected = scored.slice(0, limit);

        // 6. Record profile views (batched for efficiency)
        if (selected.length > 0) {
          const statements = selected.map((s) =>
            this.db
              .prepare(
                `INSERT INTO profile_views (viewer_id, viewed_id, viewed_at)
               VALUES (?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(viewer_id, viewed_id) DO UPDATE SET viewed_at = CURRENT_TIMESTAMP`,
              )
              .bind(currentUser.id, s.user.id),
          );
          await this.db.batch(statements);
        }

        return selected.map((s) => s.user);
      },
      catch: (error) => new DatabaseError("getPotentialMatches", error),
    });
  }

  getPendingLikes(req: {
    userId: string;
  }): Effect.Effect<Array<typeof User.Type>, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        // Find users who liked the current user but current user hasn't responded
        // Exclude blocked users (both directions)
        const { results } = await this.db
          .prepare(
            `
          SELECT u.id, u.username, u.first_name, u.last_name, u.bio, u.age, u.gender,
                 u.interests, u.media_urls, u.location, u.preferences,
                 u.is_active, u.is_profile_complete
          FROM matches m
          JOIN users u ON (
            (m.user1_id = u.id AND m.user2_id = ?) OR
            (m.user2_id = u.id AND m.user1_id = ?)
          )
          WHERE m.status = 'pending'
            AND (
              (m.user1_id = ? AND m.user2_action = 'like' AND m.user1_action = 'none') OR
              (m.user2_id = ? AND m.user1_action = 'like' AND m.user2_action = 'none')
            )
            AND NOT EXISTS (
              SELECT 1 FROM blocks b
              WHERE (b.blocker_id = ? AND b.blocked_id = u.id)
                 OR (b.blocker_id = u.id AND b.blocked_id = ?)
            )
          ORDER BY m.updated_at DESC
        `,
          )
          .bind(
            req.userId,
            req.userId,
            req.userId,
            req.userId,
            req.userId,
            req.userId,
          )
          .all();

        return (results ?? []).map((r) =>
          this.rowToUser(r as Record<string, unknown>),
        );
      },
      catch: (error) => new DatabaseError("getPendingLikes", error),
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
      user1Action: row.user1_action
        ? (String(row.user1_action).toUpperCase() as typeof MatchAction.Type)
        : undefined,
      user2Action: row.user2_action
        ? (String(row.user2_action).toUpperCase() as typeof MatchAction.Type)
        : undefined,
      likeMessage: row.like_message
        ? JSON.parse(String(row.like_message))
        : undefined,
    };
  }

  private rowToUser(row: Record<string, unknown>): typeof User.Type {
    return {
      id: String(row.id),
      username: row.username ? String(row.username) : undefined,
      displayName: row.first_name ? String(row.first_name) : undefined,
      lastName: row.last_name ? String(row.last_name) : undefined,
      bio: row.bio ? String(row.bio) : undefined,
      age: row.age ? Number(row.age) : undefined,
      birthDate: row.birth_date ? String(row.birth_date) : undefined,
      gender: row.gender
        ? (String(
            row.gender,
          ) as typeof import("@meetsmatch/cf-shared").Gender.Type)
        : undefined,
      interests: row.interests ? JSON.parse(String(row.interests)) : [],
      mediaUrls: row.media_urls ? JSON.parse(String(row.media_urls)) : [],
      location: row.location ? JSON.parse(String(row.location)) : undefined,
      preferences: row.preferences ? JSON.parse(String(row.preferences)) : {},
      isActive: row.is_active ? Number(row.is_active) === 1 : true,
      isSleeping: row.is_sleeping ? Number(row.is_sleeping) === 1 : false,
      subscriptionTier: row.subscription_tier
        ? String(row.subscription_tier)
        : undefined,
      isProfileComplete: row.is_profile_complete
        ? Number(row.is_profile_complete) === 1
        : false,
    };
  }
}

export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180.0);
  const dLon = (lon2 - lon1) * (Math.PI / 180.0);
  const lat1Rad = lat1 * (Math.PI / 180.0);
  const lat2Rad = lat2 * (Math.PI / 180.0);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) *
      Math.sin(dLon / 2) *
      Math.cos(lat1Rad) *
      Math.cos(lat2Rad);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface MatchScore {
  location: number;
  interests: number;
  preferences: number;
  total: number;
}

export function calculateMatchScore(
  user1: typeof User.Type,
  user2: typeof User.Type,
): MatchScore {
  const score: MatchScore = {
    location: 0,
    interests: 0,
    preferences: 0,
    total: 0,
  };

  // 1. Location Score
  if (user1.location && user2.location) {
    const dist = haversine(
      user1.location.latitude,
      user1.location.longitude,
      user2.location.latitude,
      user2.location.longitude,
    );
    const maxDist = user1.preferences?.maxDistance ?? 20.0;
    if (dist <= maxDist) {
      score.location = 1.0 - dist / maxDist;
    }
  }

  // 2. Interests Score (Jaccard)
  if (
    user1.interests &&
    user1.interests.length > 0 &&
    user2.interests &&
    user2.interests.length > 0
  ) {
    // Use two Sets for O(1) lookups instead of multiple allocations and array spreads.
    const set1 = new Set(user1.interests);
    const set2 = new Set(user2.interests);
    let intersectionSize = 0;
    // Iterate over the smaller set to minimize lookups.
    const [smaller, larger] =
      set1.size < set2.size ? [set1, set2] : [set2, set1];
    for (const item of smaller) {
      if (larger.has(item)) {
        intersectionSize++;
      }
    }
    const unionSize = set1.size + set2.size - intersectionSize;
    if (unionSize > 0) {
      score.interests = intersectionSize / unionSize;
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
  if (
    prefs?.genderPreference &&
    prefs.genderPreference.length > 0 &&
    user2.gender
  ) {
    prefChecks++;
    const allowed = prefs.genderPreference.includes(user2.gender);
    if (allowed) prefMatches++;
  }

  // Relationship type overlap
  if (
    prefs?.relationshipType &&
    prefs.relationshipType.length > 0 &&
    user2.preferences?.relationshipType &&
    user2.preferences.relationshipType.length > 0
  ) {
    prefChecks++;
    // Use direct iteration for small arrays to avoid Set allocation overhead;
    // fall back to a Set for larger inputs to keep complexity O(n + m).
    const rt1 = prefs.relationshipType;
    const rt2 = user2.preferences.relationshipType;
    let overlap: boolean;
    if (rt1.length <= 5 && rt2.length <= 5) {
      overlap = rt2.some((rt) => rt1.includes(rt));
    } else {
      const rtSet = new Set(rt1);
      overlap = rt2.some((rt) => rtSet.has(rt));
    }
    if (overlap) prefMatches++;
  }

  if (prefChecks > 0) {
    score.preferences = prefMatches / prefChecks;
  }

  // Total Weighted Score
  score.total =
    score.location * 0.3 + score.interests * 0.4 + score.preferences * 0.3;

  // Normalize
  if (score.total > 1.0) {
    score.total = 1.0;
  }

  return score;
}
