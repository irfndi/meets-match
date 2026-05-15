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

  getById(req: GetUserRequest): Effect.Effect<typeof User.Type, NotFoundError | DatabaseError, never> {
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

  create(req: CreateUserRequest): Effect.Effect<typeof User.Type, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const user = req.user;
        const existing = await this.db.prepare("SELECT id FROM users WHERE id = ?").bind(user.id).first();
        if (existing) {
          return user;
        }
        await this.db
          .prepare(
            `INSERT INTO users (id, username, first_name, last_name, bio, age, birth_date, gender, interests, photos, location, preferences, is_active, is_sleeping, is_profile_complete, phone_number, language, last_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            user.id,
            user.username ?? null,
            user.displayName ?? "User",
            user.lastName ?? null,
            user.bio ?? null,
            user.age ?? null,
            user.birthDate ?? null,
            user.gender ?? null,
            JSON.stringify(user.interests ?? []),
            JSON.stringify(user.photos ?? []),
            JSON.stringify(user.location ?? {}),
            JSON.stringify(user.preferences ?? {}),
            user.isActive ?? true ? 1 : 0,
            user.isSleeping ?? false ? 1 : 0,
            user.isProfileComplete ?? false ? 1 : 0,
            user.phoneNumber ?? null,
            user.language ?? 'en',
            user.lastActive ?? new Date().toISOString()
          )
          .run();
        return user;
      },
      catch: (error) => new DatabaseError("create", error),
    });
  }

  update(req: UpdateUserRequest): Effect.Effect<typeof User.Type, NotFoundError | DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const user = req.user;

        // Ensure user exists (upsert — create if missing)
        const existing = await this.db.prepare("SELECT id FROM users WHERE id = ?").bind(req.userId).first();
        if (!existing) {
          await this.db.prepare(
            `INSERT INTO users (id, first_name) VALUES (?, ?)`
          ).bind(req.userId, user.displayName ?? "User").run();
        }

        const fields: string[] = [];
        const values: unknown[] = [];

        if (user.username !== undefined) { fields.push("username = ?"); values.push(user.username); }
        if (user.displayName !== undefined) { fields.push("first_name = ?"); values.push(user.displayName); }
        if (user.lastName !== undefined) { fields.push("last_name = ?"); values.push(user.lastName); }
        if (user.bio !== undefined) { fields.push("bio = ?"); values.push(user.bio); }
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
        if (user.age !== undefined) { fields.push("age = ?"); values.push(user.age); }
        if (user.gender !== undefined) { fields.push("gender = ?"); values.push(user.gender); }
        if (user.interests !== undefined) { fields.push("interests = ?"); values.push(JSON.stringify(user.interests)); }
        if (user.photos !== undefined) { fields.push("photos = ?"); values.push(JSON.stringify(user.photos)); }
        if (user.location !== undefined) { fields.push("location = ?"); values.push(JSON.stringify(user.location)); }
        if (user.preferences !== undefined) { fields.push("preferences = ?"); values.push(JSON.stringify(user.preferences)); }
        if (user.isActive !== undefined) { fields.push("is_active = ?"); values.push(user.isActive ? 1 : 0); }
        if (user.isSleeping !== undefined) { fields.push("is_sleeping = ?"); values.push(user.isSleeping ? 1 : 0); }
        if (user.isProfileComplete !== undefined) { fields.push("is_profile_complete = ?"); values.push(user.isProfileComplete ? 1 : 0); }
        if (user.phoneNumber !== undefined) { fields.push("phone_number = ?"); values.push(user.phoneNumber); }
        if (user.language !== undefined) { fields.push("language = ?"); values.push(user.language); }
        if (user.subscriptionTier !== undefined) { fields.push("subscription_tier = ?"); values.push(user.subscriptionTier); }
        if (user.dailySwipesUsed !== undefined) { fields.push("daily_swipes_used = ?"); values.push(user.dailySwipesUsed); }
        if (user.dailySwipesResetAt !== undefined) { fields.push("daily_swipes_reset_at = ?"); values.push(user.dailySwipesResetAt); }
        if (user.referralCode !== undefined) { fields.push("referral_code = ?"); values.push(user.referralCode); }
        if (user.referredBy !== undefined) { fields.push("referred_by = ?"); values.push(user.referredBy); }
        if (user.referralCount !== undefined) { fields.push("referral_count = ?"); values.push(user.referralCount); }
        if (user.referralBonusSwipes !== undefined) { fields.push("referral_bonus_swipes = ?"); values.push(user.referralBonusSwipes); }

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

  updateLastActive(req: UpdateLastActiveRequest): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .prepare("UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(req.userId)
          .run();
        return true;
      },
      catch: (error) => new DatabaseError("updateLastActive", error),
    });
  }

  updateLastRemindedAt(req: UpdateLastRemindedAtRequest): Effect.Effect<boolean, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .prepare("UPDATE users SET last_reminded_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(req.userId)
          .run();
        return true;
      },
      catch: (error) => new DatabaseError("updateLastRemindedAt", error),
    });
  }

  getSwipeStatus(userId: string): Effect.Effect<{ remaining: number; total: number; tier: string; resetAt: string }, DatabaseError, never> {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db.prepare("SELECT subscription_tier, daily_swipes_used, daily_swipes_reset_at, referral_bonus_swipes FROM users WHERE id = ?").bind(userId).first();
        if (!row) throw new NotFoundError("User", userId);

        const tier = String((row as Record<string, unknown>).subscription_tier ?? "free");
        let used = Number((row as Record<string, unknown>).daily_swipes_used ?? 0);
        let resetAt = String((row as Record<string, unknown>).daily_swipes_reset_at ?? "");
        const bonus = Number((row as Record<string, unknown>).referral_bonus_swipes ?? 0);

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        if (!resetAt || resetAt < today) {
          used = 0;
          resetAt = today;
          await this.db.prepare("UPDATE users SET daily_swipes_used = 0, daily_swipes_reset_at = ? WHERE id = ?").bind(today, userId).run();
        }

        const baseLimit = tier === "premium" || tier === "supervip" ? 9999 : 10;
        const total = baseLimit + bonus;
        const remaining = Math.max(0, total - used);

        return { remaining, total, tier, resetAt };
      },
      catch: (error) => (error instanceof NotFoundError ? error : new DatabaseError("getSwipeStatus", error)),
    });
  }

  recordSwipe(userId: string): Effect.Effect<{ remaining: number; total: number }, DatabaseError | NotFoundError, never> {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db.prepare("SELECT subscription_tier, daily_swipes_used, daily_swipes_reset_at, referral_bonus_swipes FROM users WHERE id = ?").bind(userId).first();
        if (!row) throw new NotFoundError("User", userId);

        const tier = String((row as Record<string, unknown>).subscription_tier ?? "free");
        let used = Number((row as Record<string, unknown>).daily_swipes_used ?? 0);
        let resetAt = String((row as Record<string, unknown>).daily_swipes_reset_at ?? "");
        const bonus = Number((row as Record<string, unknown>).referral_bonus_swipes ?? 0);

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

        if (!resetAt || resetAt < today) {
          used = 0;
          resetAt = today;
        }

        const baseLimit = tier === "premium" || tier === "supervip" ? 9999 : 10;
        const total = baseLimit + bonus;

        if (used >= total) {
          return { remaining: 0, total };
        }

        used++;
        await this.db.prepare("UPDATE users SET daily_swipes_used = ?, daily_swipes_reset_at = ? WHERE id = ?").bind(used, resetAt, userId).run();
        return { remaining: total - used, total };
      },
      catch: (error) => (error instanceof NotFoundError ? error : new DatabaseError("recordSwipe", error)),
    });
  }

  getOrCreateReferralCode(userId: string): Effect.Effect<string, DatabaseError | NotFoundError, never> {
    return Effect.tryPromise({
      try: async () => {
        const row = await this.db.prepare("SELECT referral_code FROM users WHERE id = ?").bind(userId).first();
        if (!row) throw new NotFoundError("User", userId);

        let code = String((row as Record<string, unknown>).referral_code ?? "");
        if (!code) {
          code = Math.random().toString(36).substring(2, 8).toUpperCase();
          await this.db.prepare("UPDATE users SET referral_code = ? WHERE id = ?").bind(code, userId).run();
        }
        return code;
      },
      catch: (error) => (error instanceof NotFoundError ? error : new DatabaseError("getOrCreateReferralCode", error)),
    });
  }

  applyReferral(userId: string, code: string): Effect.Effect<{ success: boolean; message: string }, DatabaseError | NotFoundError, never> {
    return Effect.tryPromise({
      try: async () => {
        if (!code || code.length < 4) return { success: false, message: "Invalid referral code." };

        const selfRow = await this.db.prepare("SELECT referral_code, referred_by FROM users WHERE id = ?").bind(userId).first();
        if (!selfRow) throw new NotFoundError("User", userId);
        const selfCode = String((selfRow as Record<string, unknown>).referral_code ?? "");
        const alreadyReferred = (selfRow as Record<string, unknown>).referred_by as string | null;

        if (selfCode === code) return { success: false, message: "You cannot use your own referral code." };
        if (alreadyReferred) return { success: false, message: "You have already used a referral code." };

        const referrerRow = await this.db.prepare("SELECT id, referral_count, referral_bonus_swipes FROM users WHERE referral_code = ?").bind(code).first();
        if (!referrerRow) return { success: false, message: "Referral code not found." };

        const referrerId = String((referrerRow as Record<string, unknown>).id);
        const referrerCount = Number((referrerRow as Record<string, unknown>).referral_count ?? 0);
        const referrerBonus = Number((referrerRow as Record<string, unknown>).referral_bonus_swipes ?? 0);

        // Give both users +5 bonus swipes
        await this.db.prepare("UPDATE users SET referred_by = ?, referral_bonus_swipes = referral_bonus_swipes + 5 WHERE id = ?").bind(referrerId, userId).run();
        await this.db.prepare("UPDATE users SET referral_count = ?, referral_bonus_swipes = referral_bonus_swipes + 5 WHERE id = ?").bind(referrerCount + 1, referrerId).run();

        return { success: true, message: "Referral applied! You and your friend both received +5 bonus swipes." };
      },
      catch: (error) => (error instanceof NotFoundError ? error : new DatabaseError("applyReferral", error)),
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
      gender: row.gender ? String(row.gender) as typeof import("@meetsmatch/cf-shared").Gender.Type : undefined,
      interests: row.interests ? JSON.parse(String(row.interests)) : [],
      photos: row.photos ? JSON.parse(String(row.photos)) : [],
      location: row.location ? JSON.parse(String(row.location)) : undefined,
      preferences: row.preferences ? JSON.parse(String(row.preferences)) : {},
      isActive: row.is_active ? Number(row.is_active) === 1 : true,
      isSleeping: row.is_sleeping ? Number(row.is_sleeping) === 1 : false,
      isProfileComplete: row.is_profile_complete ? Number(row.is_profile_complete) === 1 : false,
      phoneNumber: row.phone_number ? String(row.phone_number) : undefined,
      language: row.language ? String(row.language) : undefined,
      subscriptionTier: row.subscription_tier ? String(row.subscription_tier) : undefined,
      dailySwipesUsed: row.daily_swipes_used ? Number(row.daily_swipes_used) : undefined,
      dailySwipesResetAt: row.daily_swipes_reset_at ? String(row.daily_swipes_reset_at) : undefined,
      referralCode: row.referral_code ? String(row.referral_code) : undefined,
      referredBy: row.referred_by ? String(row.referred_by) : undefined,
      referralCount: row.referral_count ? Number(row.referral_count) : undefined,
      referralBonusSwipes: row.referral_bonus_swipes ? Number(row.referral_bonus_swipes) : undefined,
      createdAt: row.created_at ? String(row.created_at) : undefined,
      updatedAt: row.updated_at ? String(row.updated_at) : undefined,
      lastActive: row.last_active ? String(row.last_active) : undefined,
    };
  }
}
