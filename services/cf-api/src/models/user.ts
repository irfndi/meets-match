import { Effect } from "effect";
import type { D1Database } from "@cloudflare/workers-types";
import {
  User,
  type CreateUserRequest,
  type GetUserRequest,
  type UpdateUserRequest,
  type UpdateLastActiveRequest,
  type UpdateLastRemindedAtRequest,
} from "@meetsmatch/cf-shared";
import { NotFoundError, DatabaseError } from "@meetsmatch/cf-shared";

export class UserRepository {
  constructor(private readonly db: D1Database) {}

  getById(
    req: GetUserRequest,
  ): Effect.Effect<typeof User.Type, NotFoundError | DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db
          .prepare("SELECT * FROM users WHERE id = ?")
          .bind(req.userId)
          .first();
        if (!result) {
          throw new NotFoundError("User", req.userId);
        }
        return this.toUser(result);
      },
      catch: (error) => {
        if (error instanceof NotFoundError) return error;
        return new DatabaseError("getById", error);
      },
    });
  }

  create(
    req: CreateUserRequest,
  ): Effect.Effect<typeof User.Type, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const user = req.user;
        let age = user.age ?? null;
        if (age == null && user.birthDate) {
          const birthDate = new Date(user.birthDate);
          if (!Number.isNaN(birthDate.getTime())) {
            const now = new Date();
            age = now.getFullYear() - birthDate.getFullYear();
            const monthDelta = now.getMonth() - birthDate.getMonth();
            if (
              monthDelta < 0 ||
              (monthDelta === 0 && now.getDate() < birthDate.getDate())
            ) {
              age--;
            }
          }
        }
        const existing = await this.db
          .prepare("SELECT id FROM users WHERE id = ?")
          .bind(user.id)
          .first();
        if (existing) {
          return user;
        }
        await this.db
          .prepare(
            `INSERT INTO users (id, username, first_name, last_name, bio, age, birth_date, gender, interests, media_urls, location, preferences, is_active, is_sleeping, is_profile_complete, phone_number, language, last_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            user.id,
            user.username ?? null,
            user.displayName ?? "User",
            user.lastName ?? null,
            user.bio ?? null,
            age,
            user.birthDate ?? null,
            user.gender ?? null,
            JSON.stringify(user.interests ?? []),
            JSON.stringify(user.mediaUrls ?? []),
            JSON.stringify(user.location ?? {}),
            JSON.stringify(user.preferences ?? {}),
            (user.isActive ?? true) ? 1 : 0,
            (user.isSleeping ?? false) ? 1 : 0,
            (user.isProfileComplete ?? false) ? 1 : 0,
            user.phoneNumber ?? null,
            user.language ?? "en",
            user.lastActive ?? new Date().toISOString(),
          )
          .run();
        return user;
      },
      catch: (error) => new DatabaseError("create", error),
    });
  }

  update(
    req: UpdateUserRequest,
  ): Effect.Effect<typeof User.Type, NotFoundError | DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const user = req.user;

        // Ensure user exists (upsert — create if missing)
        const existing = await this.db
          .prepare("SELECT id FROM users WHERE id = ?")
          .bind(req.userId)
          .first();
        if (!existing) {
          await this.db
            .prepare(`INSERT INTO users (id, first_name) VALUES (?, ?)`)
            .bind(req.userId, user.displayName ?? "User")
            .run();
        }

        const fields: string[] = [];
        const values: unknown[] = [];

        if (user.username !== undefined) {
          fields.push("username = ?");
          values.push(user.username);
        }
        if (user.displayName !== undefined) {
          fields.push("first_name = ?");
          values.push(user.displayName);
        }
        if (user.lastName !== undefined) {
          fields.push("last_name = ?");
          values.push(user.lastName);
        }
        if (user.bio !== undefined) {
          fields.push("bio = ?");
          values.push(user.bio);
        }
        if (user.birthDate !== undefined) {
          fields.push("birth_date = ?");
          values.push(user.birthDate);
          // Auto-compute age from birth_date
          const birthDate = new Date(user.birthDate);
          if (!Number.isNaN(birthDate.getTime())) {
            const now = new Date();
            let age = now.getFullYear() - birthDate.getFullYear();
            const m = now.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) {
              age--;
            }
            fields.push("age = ?");
            values.push(age);
          }
        }
        if (user.age !== undefined) {
          fields.push("age = ?");
          values.push(user.age);
        }
        if (user.gender !== undefined) {
          fields.push("gender = ?");
          values.push(user.gender);
        }
        if (user.interests !== undefined) {
          fields.push("interests = ?");
          values.push(JSON.stringify(user.interests));
        }
        if (user.mediaUrls !== undefined) {
          fields.push("media_urls = ?");
          values.push(JSON.stringify(user.mediaUrls));
        }
        if (user.location !== undefined) {
          fields.push("location = ?");
          values.push(JSON.stringify(user.location));
        }
        if (user.preferences !== undefined) {
          fields.push("preferences = ?");
          values.push(JSON.stringify(user.preferences));
        }
        if (user.isActive !== undefined) {
          fields.push("is_active = ?");
          values.push(user.isActive ? 1 : 0);
        }
        if (user.isSleeping !== undefined) {
          fields.push("is_sleeping = ?");
          values.push(user.isSleeping ? 1 : 0);
        }
        if (user.isProfileComplete !== undefined) {
          fields.push("is_profile_complete = ?");
          values.push(user.isProfileComplete ? 1 : 0);
        }
        if (user.phoneNumber !== undefined) {
          fields.push("phone_number = ?");
          values.push(user.phoneNumber);
        }
        if (user.language !== undefined) {
          fields.push("language = ?");
          values.push(user.language);
        }
        if (user.subscriptionTier !== undefined) {
          fields.push("subscription_tier = ?");
          values.push(user.subscriptionTier);
        }
        if (user.dailySwipesUsed !== undefined) {
          fields.push("daily_swipes_used = ?");
          values.push(user.dailySwipesUsed);
        }
        if (user.dailySwipesResetAt !== undefined) {
          fields.push("daily_swipes_reset_at = ?");
          values.push(user.dailySwipesResetAt);
        }
        if (user.referralCode !== undefined) {
          fields.push("referral_code = ?");
          values.push(user.referralCode);
        }
        if (user.referredBy !== undefined) {
          fields.push("referred_by = ?");
          values.push(user.referredBy);
        }
        if (user.referralCount !== undefined) {
          fields.push("referral_count = ?");
          values.push(user.referralCount);
        }
        if (user.referralBonusSwipes !== undefined) {
          fields.push("referral_bonus_swipes = ?");
          values.push(user.referralBonusSwipes);
        }

        if (fields.length === 0) {
          return user;
        }

        fields.push("updated_at = CURRENT_TIMESTAMP");
        values.push(req.userId);

        await this.db
          .prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`)
          .bind(...values)
          .run();

        const result = await this.db
          .prepare("SELECT * FROM users WHERE id = ?")
          .bind(req.userId)
          .first();

        if (!result) {
          throw new NotFoundError("User", req.userId);
        }

        return this.toUser(result);
      },
      catch: (error) => {
        if (error instanceof NotFoundError) return error;
        return new DatabaseError("update", error);
      },
    });
  }

  updateLastActive(
    req: UpdateLastActiveRequest,
  ): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .prepare(
            "UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?",
          )
          .bind(req.userId)
          .run();
        return true;
      },
      catch: (error) => new DatabaseError("updateLastActive", error),
    });
  }

  updateLastRemindedAt(
    req: UpdateLastRemindedAtRequest,
  ): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .prepare(
            "UPDATE users SET last_reminded_at = CURRENT_TIMESTAMP WHERE id = ?",
          )
          .bind(req.userId)
          .run();
        return true;
      },
      catch: (error) => new DatabaseError("updateLastRemindedAt", error),
    });
  }

  getSwipeStatus(
    userId: string,
  ): Effect.Effect<
    { remaining: number; total: number; tier: string; resetAt: string },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare(
            "SELECT subscription_tier, daily_swipes_used, daily_swipes_reset_at, referral_bonus_swipes FROM users WHERE id = ?",
          )
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);

        const tier = String(
          (row as Record<string, unknown>).subscription_tier ?? "free",
        );
        let used = Number(
          (row as Record<string, unknown>).daily_swipes_used ?? 0,
        );
        let resetAt = String(
          (row as Record<string, unknown>).daily_swipes_reset_at ?? "",
        );
        const bonus = Number(
          (row as Record<string, unknown>).referral_bonus_swipes ?? 0,
        );

        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();

        if (!resetAt || resetAt < today) {
          used = 0;
          resetAt = today;
          await this.db
            .prepare(
              "UPDATE users SET daily_swipes_used = 0, daily_swipes_reset_at = ? WHERE id = ?",
            )
            .bind(today, userId)
            .run();
        }

        const baseLimit =
          tier === "premium" || tier === "premium_plus" ? 9999 : 10;
        const total = baseLimit + bonus;
        const remaining = Math.max(0, total - used);

        return { remaining, total, tier, resetAt };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("getSwipeStatus", error),
    });
  }

  recordSwipe(
    userId: string,
  ): Effect.Effect<
    { remaining: number; total: number },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare(
            "SELECT subscription_tier, daily_swipes_used, daily_swipes_reset_at, referral_bonus_swipes FROM users WHERE id = ?",
          )
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);

        const tier = String(
          (row as Record<string, unknown>).subscription_tier ?? "free",
        );
        let used = Number(
          (row as Record<string, unknown>).daily_swipes_used ?? 0,
        );
        let resetAt = String(
          (row as Record<string, unknown>).daily_swipes_reset_at ?? "",
        );
        const bonus = Number(
          (row as Record<string, unknown>).referral_bonus_swipes ?? 0,
        );

        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();

        if (!resetAt || resetAt < today) {
          used = 0;
          resetAt = today;
        }

        const baseLimit =
          tier === "premium" || tier === "premium_plus" ? 9999 : 10;
        const total = baseLimit + bonus;

        if (used >= total) {
          return { remaining: 0, total };
        }

        used++;
        await this.db
          .prepare(
            "UPDATE users SET daily_swipes_used = ?, daily_swipes_reset_at = ? WHERE id = ?",
          )
          .bind(used, resetAt, userId)
          .run();
        return { remaining: total - used, total };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("recordSwipe", error),
    });
  }

  getInteractionStatus(userId: string): Effect.Effect<
    {
      likesRemaining: number;
      likesTotal: number;
      dislikesRemaining: number;
      dislikesTotal: number;
      tier: string;
      resetAt: string;
    },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare(
            "SELECT subscription_tier, daily_likes_used, daily_likes_reset_at, daily_dislikes_used, daily_dislikes_reset_at, referral_bonus_swipes FROM users WHERE id = ?",
          )
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);

        const tier = String(
          (row as Record<string, unknown>).subscription_tier ?? "free",
        );
        let likesUsed = Number(
          (row as Record<string, unknown>).daily_likes_used ?? 0,
        );
        let dislikesUsed = Number(
          (row as Record<string, unknown>).daily_dislikes_used ?? 0,
        );
        let resetAt = String(
          (row as Record<string, unknown>).daily_likes_reset_at ?? "",
        );
        let dislikesResetAt = String(
          (row as Record<string, unknown>).daily_dislikes_reset_at ?? "",
        );
        const bonus = Number(
          (row as Record<string, unknown>).referral_bonus_swipes ?? 0,
        );

        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();

        let needsUpdate = false;
        if (!resetAt || resetAt < today) {
          likesUsed = 0;
          resetAt = today;
          needsUpdate = true;
        }
        if (!dislikesResetAt || dislikesResetAt < today) {
          dislikesUsed = 0;
          dislikesResetAt = today;
          needsUpdate = true;
        }
        if (needsUpdate) {
          await this.db
            .prepare(
              "UPDATE users SET daily_likes_used = ?, daily_dislikes_used = ?, daily_likes_reset_at = ?, daily_dislikes_reset_at = ? WHERE id = ?",
            )
            .bind(likesUsed, dislikesUsed, resetAt, dislikesResetAt, userId)
            .run();
        }

        const isPremium = tier === "premium" || tier === "premium_plus";
        const likesTotal = isPremium ? 9999 : 15 + bonus;
        const dislikesTotal = isPremium ? 9999 : 35 + bonus;
        return {
          likesRemaining: Math.max(0, likesTotal - likesUsed),
          likesTotal,
          dislikesRemaining: Math.max(0, dislikesTotal - dislikesUsed),
          dislikesTotal,
          tier,
          resetAt,
        };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("getInteractionStatus", error),
    });
  }

  recordLike(
    userId: string,
  ): Effect.Effect<
    { remaining: number; total: number },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare(
            "SELECT subscription_tier, daily_likes_used, daily_likes_reset_at, referral_bonus_swipes FROM users WHERE id = ?",
          )
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);

        const tier = String(
          (row as Record<string, unknown>).subscription_tier ?? "free",
        );
        let used = Number(
          (row as Record<string, unknown>).daily_likes_used ?? 0,
        );
        let resetAt = String(
          (row as Record<string, unknown>).daily_likes_reset_at ?? "",
        );
        const bonus = Number(
          (row as Record<string, unknown>).referral_bonus_swipes ?? 0,
        );

        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();

        if (!resetAt || resetAt < today) {
          used = 0;
          resetAt = today;
        }

        const total =
          tier === "premium" || tier === "premium_plus" ? 9999 : 15 + bonus;
        if (used >= total) {
          return { remaining: 0, total };
        }

        used++;
        await this.db
          .prepare(
            "UPDATE users SET daily_likes_used = ?, daily_likes_reset_at = ? WHERE id = ?",
          )
          .bind(used, resetAt, userId)
          .run();
        return { remaining: total - used, total };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("recordLike", error),
    });
  }

  recordDislike(
    userId: string,
  ): Effect.Effect<
    { remaining: number; total: number },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare(
            "SELECT subscription_tier, daily_dislikes_used, daily_dislikes_reset_at, referral_bonus_swipes FROM users WHERE id = ?",
          )
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);

        const tier = String(
          (row as Record<string, unknown>).subscription_tier ?? "free",
        );
        let used = Number(
          (row as Record<string, unknown>).daily_dislikes_used ?? 0,
        );
        let resetAt = String(
          (row as Record<string, unknown>).daily_dislikes_reset_at ?? "",
        );
        const bonus = Number(
          (row as Record<string, unknown>).referral_bonus_swipes ?? 0,
        );

        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();

        if (!resetAt || resetAt < today) {
          used = 0;
          resetAt = today;
        }

        const total =
          tier === "premium" || tier === "premium_plus" ? 9999 : 35 + bonus;
        if (used >= total) {
          return { remaining: 0, total };
        }

        used++;
        await this.db
          .prepare(
            "UPDATE users SET daily_dislikes_used = ?, daily_dislikes_reset_at = ? WHERE id = ?",
          )
          .bind(used, resetAt, userId)
          .run();
        return { remaining: total - used, total };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("recordDislike", error),
    });
  }

  getOrCreateReferralCode(
    userId: string,
  ): Effect.Effect<string, DatabaseError | NotFoundError, never> {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare("SELECT referral_code FROM users WHERE id = ?")
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);

        let code = String((row as Record<string, unknown>).referral_code ?? "");
        if (!code) {
          code = Math.random().toString(36).substring(2, 8).toUpperCase();
          await this.db
            .prepare("UPDATE users SET referral_code = ? WHERE id = ?")
            .bind(code, userId)
            .run();
        }
        return code;
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("getOrCreateReferralCode", error),
    });
  }

  applyReferral(
    userId: string,
    code: string,
  ): Effect.Effect<
    { success: boolean; message: string },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        if (!code || code.length < 4)
          return { success: false, message: "Invalid referral code." };

        const selfRow = await this.db
          .prepare("SELECT referral_code, referred_by FROM users WHERE id = ?")
          .bind(userId)
          .first();
        if (!selfRow) throw new NotFoundError("User", userId);
        const selfCode = String(
          (selfRow as Record<string, unknown>).referral_code ?? "",
        );
        const alreadyReferred = (selfRow as Record<string, unknown>)
          .referred_by as string | null;

        if (selfCode === code)
          return {
            success: false,
            message: "You cannot use your own referral code.",
          };
        if (alreadyReferred)
          return {
            success: false,
            message: "You have already used a referral code.",
          };

        const referrerRow = await this.db
          .prepare(
            "SELECT id, referral_count, referral_bonus_swipes FROM users WHERE referral_code = ?",
          )
          .bind(code)
          .first();
        if (!referrerRow)
          return { success: false, message: "Referral code not found." };

        const referrerId = String((referrerRow as Record<string, unknown>).id);
        const referrerCount = Number(
          (referrerRow as Record<string, unknown>).referral_count ?? 0,
        );
        const referrerBonus = Number(
          (referrerRow as Record<string, unknown>).referral_bonus_swipes ?? 0,
        );

        // Give both users +5 bonus swipes
        await this.db
          .prepare(
            "UPDATE users SET referred_by = ?, referral_bonus_swipes = referral_bonus_swipes + 5 WHERE id = ?",
          )
          .bind(referrerId, userId)
          .run();
        await this.db
          .prepare(
            "UPDATE users SET referral_count = ?, referral_bonus_swipes = referral_bonus_swipes + 5 WHERE id = ?",
          )
          .bind(referrerCount + 1, referrerId)
          .run();

        return {
          success: true,
          message:
            "Referral applied! You and your friend both received +5 bonus swipes.",
        };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("applyReferral", error),
    });
  }

  getDMStatus(
    userId: string,
  ): Effect.Effect<
    { canSendDM: boolean; tier: string; dmCredits: number },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare(
            "SELECT subscription_tier, dm_credits FROM users WHERE id = ?",
          )
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);
        const tier = String(
          (row as Record<string, unknown>).subscription_tier ?? "free",
        );
        const dmCredits = Number(
          (row as Record<string, unknown>).dm_credits ?? 0,
        );
        const canSendDM =
          tier === "premium" || tier === "premium_plus" || dmCredits > 0;
        return { canSendDM, tier, dmCredits };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("getDMStatus", error),
    });
  }

  useDMCredit(
    userId: string,
  ): Effect.Effect<
    { success: boolean; dmCredits: number },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare(
            "SELECT subscription_tier, dm_credits FROM users WHERE id = ?",
          )
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);
        const tier = String(
          (row as Record<string, unknown>).subscription_tier ?? "free",
        );
        let dmCredits = Number(
          (row as Record<string, unknown>).dm_credits ?? 0,
        );

        if (tier === "premium" || tier === "premium_plus") {
          return { success: true, dmCredits };
        }
        if (dmCredits <= 0) {
          return { success: false, dmCredits };
        }
        dmCredits--;
        await this.db
          .prepare("UPDATE users SET dm_credits = ? WHERE id = ?")
          .bind(dmCredits, userId)
          .run();
        return { success: true, dmCredits };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("useDMCredit", error),
    });
  }

  addDMCredits(
    userId: string,
    amount: number,
  ): Effect.Effect<
    { dmCredits: number },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare("SELECT dm_credits FROM users WHERE id = ?")
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);
        const current = Number(
          (row as Record<string, unknown>).dm_credits ?? 0,
        );
        const dmCredits = current + amount;
        await this.db
          .prepare("UPDATE users SET dm_credits = ? WHERE id = ?")
          .bind(dmCredits, userId)
          .run();
        return { dmCredits };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("addDMCredits", error),
    });
  }

  private toUser(row: Record<string, unknown>): typeof User.Type {
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
      mediaUrls: row.media_urls
        ? JSON.parse(String(row.media_urls))
        : undefined,
      location: row.location ? JSON.parse(String(row.location)) : undefined,
      preferences: row.preferences ? JSON.parse(String(row.preferences)) : {},
      isActive: row.is_active ? Number(row.is_active) === 1 : true,
      isSleeping: row.is_sleeping ? Number(row.is_sleeping) === 1 : false,
      isProfileComplete: row.is_profile_complete
        ? Number(row.is_profile_complete) === 1
        : false,
      phoneNumber: row.phone_number ? String(row.phone_number) : undefined,
      language: row.language ? String(row.language) : undefined,
      subscriptionTier: row.subscription_tier
        ? String(row.subscription_tier)
        : undefined,
      dailySwipesUsed: row.daily_swipes_used
        ? Number(row.daily_swipes_used)
        : undefined,
      dailySwipesResetAt: row.daily_swipes_reset_at
        ? String(row.daily_swipes_reset_at)
        : undefined,
      dailyLikesUsed: row.daily_likes_used
        ? Number(row.daily_likes_used)
        : undefined,
      dailyLikesResetAt: row.daily_likes_reset_at
        ? String(row.daily_likes_reset_at)
        : undefined,
      dailyDislikesUsed: row.daily_dislikes_used
        ? Number(row.daily_dislikes_used)
        : undefined,
      dailyDislikesResetAt: row.daily_dislikes_reset_at
        ? String(row.daily_dislikes_reset_at)
        : undefined,
      dailyMediaUsed: row.daily_media_used
        ? Number(row.daily_media_used)
        : undefined,
      dailyMediaResetAt: row.daily_media_reset_at
        ? String(row.daily_media_reset_at)
        : undefined,
      referralCode: row.referral_code ? String(row.referral_code) : undefined,
      referredBy: row.referred_by ? String(row.referred_by) : undefined,
      referralCount: row.referral_count
        ? Number(row.referral_count)
        : undefined,
      referralBonusSwipes: row.referral_bonus_swipes
        ? Number(row.referral_bonus_swipes)
        : undefined,
      dmCredits: row.dm_credits ? Number(row.dm_credits) : undefined,
      hiddenFromMatches: row.hidden_from_matches
        ? Number(row.hidden_from_matches) === 1
        : undefined,
      mediaDeletedAt: row.media_deleted_at
        ? String(row.media_deleted_at)
        : undefined,
      lastInteractionAt: row.last_interaction_at
        ? String(row.last_interaction_at)
        : undefined,
      createdAt: row.created_at ? String(row.created_at) : undefined,
      updatedAt: row.updated_at ? String(row.updated_at) : undefined,
      lastActive: row.last_active ? String(row.last_active) : undefined,
    };
  }

  getMediaUploadStatus(
    userId: string,
  ): Effect.Effect<
    { remaining: number; total: number; tier: string },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare(
            "SELECT subscription_tier, daily_media_used, daily_media_reset_at FROM users WHERE id = ?",
          )
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);

        const tier = String(
          (row as Record<string, unknown>).subscription_tier ?? "free",
        );
        let used = Number(
          (row as Record<string, unknown>).daily_media_used ?? 0,
        );
        let resetAt = String(
          (row as Record<string, unknown>).daily_media_reset_at ?? "",
        );

        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();

        if (!resetAt || resetAt < today) {
          used = 0;
          resetAt = today;
          await this.db
            .prepare(
              "UPDATE users SET daily_media_used = 0, daily_media_reset_at = ? WHERE id = ?",
            )
            .bind(resetAt, userId)
            .run();
        }

        const total = tier === "premium" || tier === "premium_plus" ? 9999 : 10;
        return { remaining: Math.max(0, total - used), total, tier };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("getMediaUploadStatus", error),
    });
  }

  recordMediaUpload(
    userId: string,
  ): Effect.Effect<
    { remaining: number; total: number },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare(
            "SELECT subscription_tier, daily_media_used, daily_media_reset_at FROM users WHERE id = ?",
          )
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);

        const tier = String(
          (row as Record<string, unknown>).subscription_tier ?? "free",
        );
        let used = Number(
          (row as Record<string, unknown>).daily_media_used ?? 0,
        );
        let resetAt = String(
          (row as Record<string, unknown>).daily_media_reset_at ?? "",
        );

        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).toISOString();

        if (!resetAt || resetAt < today) {
          used = 0;
          resetAt = today;
        }

        const total = tier === "premium" || tier === "premium_plus" ? 9999 : 10;
        if (used >= total) {
          return { remaining: 0, total };
        }

        used++;
        await this.db
          .prepare(
            "UPDATE users SET daily_media_used = ?, daily_media_reset_at = ? WHERE id = ?",
          )
          .bind(used, resetAt, userId)
          .run();
        return { remaining: total - used, total };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("recordMediaUpload", error),
    });
  }

  getMedia(
    userId: string,
  ): Effect.Effect<
    Array<{ url: string; type: string; uploadedAt: string }>,
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare("SELECT media_urls FROM users WHERE id = ?")
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);
        const media = (row as Record<string, unknown>).media_urls;
        return media
          ? (JSON.parse(String(media)) as Array<{
              url: string;
              type: string;
              uploadedAt: string;
            }>)
          : [];
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("getMedia", error),
    });
  }

  addMedia(
    userId: string,
    mediaItem: { url: string; type: string; uploadedAt: string },
  ): Effect.Effect<
    { mediaUrls: Array<{ url: string; type: string; uploadedAt: string }> },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare("SELECT media_urls FROM users WHERE id = ?")
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);
        const current = (row as Record<string, unknown>).media_urls;
        const mediaUrls: Array<{
          url: string;
          type: string;
          uploadedAt: string;
        }> = current ? JSON.parse(String(current)) : [];
        if (mediaUrls.length >= 3)
          throw new DatabaseError(
            "addMedia",
            new Error("Maximum 3 media items allowed"),
          );
        mediaUrls.push(mediaItem);
        await this.db
          .prepare("UPDATE users SET media_urls = ? WHERE id = ?")
          .bind(JSON.stringify(mediaUrls), userId)
          .run();
        return { mediaUrls };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("addMedia", error),
    });
  }

  removeMedia(
    userId: string,
    url: string,
  ): Effect.Effect<
    { mediaUrls: Array<{ url: string; type: string; uploadedAt: string }> },
    DatabaseError | NotFoundError,
    never
  > {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db
          .prepare("SELECT media_urls FROM users WHERE id = ?")
          .bind(userId)
          .first();
        if (!row) throw new NotFoundError("User", userId);
        const current = (row as Record<string, unknown>).media_urls;
        const mediaUrls: Array<{
          url: string;
          type: string;
          uploadedAt: string;
        }> = current ? JSON.parse(String(current)) : [];
        const filtered = mediaUrls.filter((m) => m.url !== url);
        await this.db
          .prepare("UPDATE users SET media_urls = ? WHERE id = ?")
          .bind(JSON.stringify(filtered), userId)
          .run();
        return { mediaUrls: filtered };
      },
      catch: (error) =>
        error instanceof NotFoundError
          ? error
          : new DatabaseError("removeMedia", error),
    });
  }

  updateLastInteraction(
    userId: string,
  ): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .prepare(
            "UPDATE users SET last_interaction_at = CURRENT_TIMESTAMP WHERE id = ?",
          )
          .bind(userId)
          .run();
        return true;
      },
      catch: (error) => new DatabaseError("updateLastInteraction", error),
    });
  }

  hideFromMatches(
    userId: string,
  ): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .prepare("UPDATE users SET hidden_from_matches = 1 WHERE id = ?")
          .bind(userId)
          .run();
        return true;
      },
      catch: (error) => new DatabaseError("hideFromMatches", error),
    });
  }

  restoreProfile(userId: string): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .prepare(
            "UPDATE users SET hidden_from_matches = 0, media_deleted_at = NULL, is_profile_complete = 1 WHERE id = ?",
          )
          .bind(userId)
          .run();
        return true;
      },
      catch: (error) => new DatabaseError("restoreProfile", error),
    });
  }

  clearMediaAndMarkIncomplete(
    userId: string,
  ): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .prepare(
            "UPDATE users SET media_urls = '[]', media_deleted_at = CURRENT_TIMESTAMP, is_profile_complete = 0 WHERE id = ?",
          )
          .bind(userId)
          .run();
        return true;
      },
      catch: (error) => new DatabaseError("clearMediaAndMarkIncomplete", error),
    });
  }
}
