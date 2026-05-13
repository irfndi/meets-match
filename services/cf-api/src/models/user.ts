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
        await this.db
          .prepare(
            `INSERT INTO users (id, username, first_name, last_name, bio, age, gender, interests, photos, location, preferences, is_active, is_sleeping, is_profile_complete, last_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            user.id,
            user.username ?? null,
            user.firstName ?? null,
            user.lastName ?? null,
            user.bio ?? null,
            user.age ?? null,
            user.gender ?? null,
            JSON.stringify(user.interests ?? []),
            JSON.stringify(user.photos ?? []),
            JSON.stringify(user.location ?? {}),
            JSON.stringify(user.preferences ?? {}),
            user.isActive ?? true ? 1 : 0,
            user.isSleeping ?? false ? 1 : 0,
            user.isProfileComplete ?? false ? 1 : 0,
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
        const fields: string[] = [];
        const values: unknown[] = [];

        if (user.username !== undefined) { fields.push("username = ?"); values.push(user.username); }
        if (user.firstName !== undefined) { fields.push("first_name = ?"); values.push(user.firstName); }
        if (user.lastName !== undefined) { fields.push("last_name = ?"); values.push(user.lastName); }
        if (user.bio !== undefined) { fields.push("bio = ?"); values.push(user.bio); }
        if (user.age !== undefined) { fields.push("age = ?"); values.push(user.age); }
        if (user.gender !== undefined) { fields.push("gender = ?"); values.push(user.gender); }
        if (user.interests !== undefined) { fields.push("interests = ?"); values.push(JSON.stringify(user.interests)); }
        if (user.photos !== undefined) { fields.push("photos = ?"); values.push(JSON.stringify(user.photos)); }
        if (user.location !== undefined) { fields.push("location = ?"); values.push(JSON.stringify(user.location)); }
        if (user.preferences !== undefined) { fields.push("preferences = ?"); values.push(JSON.stringify(user.preferences)); }
        if (user.isActive !== undefined) { fields.push("is_active = ?"); values.push(user.isActive ? 1 : 0); }
        if (user.isSleeping !== undefined) { fields.push("is_sleeping = ?"); values.push(user.isSleeping ? 1 : 0); }
        if (user.isProfileComplete !== undefined) { fields.push("is_profile_complete = ?"); values.push(user.isProfileComplete ? 1 : 0); }

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

  private toUser(row: Record<string, unknown>): typeof User.Type {
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
      createdAt: row.created_at ? String(row.created_at) : undefined,
      updatedAt: row.updated_at ? String(row.updated_at) : undefined,
      lastActive: row.last_active ? String(row.last_active) : undefined,
    };
  }
}
