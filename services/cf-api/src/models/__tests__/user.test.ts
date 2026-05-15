import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserRepository } from "../user.js";
import { NotFoundError } from "@meetsmatch/cf-shared";

function mockD1() {
  const store = new Map<string, Record<string, unknown>>();
  function seed(id: string, data: Record<string, unknown> = {}) {
    store.set(id, { id, first_name: "Test", last_name: null, username: null,
      bio: null, age: 25, gender: "male", interests: "[]", media_urls: "[]",
      location: "{}", preferences: "{}", is_active: 1, is_sleeping: 0,
      is_profile_complete: 0, created_at: "2025-01-01", updated_at: "2025-01-01",
      last_active: "2025-01-01", last_reminded_at: null, ...data });
  }
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            run: async () => ({ success: true }),
            first: async () => {
              if (sql.includes("SELECT id FROM users")) return store.get(String(values[0])) ? { id: values[0] } : null;
              if (sql.includes("FROM users WHERE id =")) return store.get(String(values[0])) ?? null;
              return null;
            },
            all: async () => ({ results: [...store.values()] }),
          };
        },
      };
    },
    _seed: seed,
    _store: store,
  };
}

describe("UserRepository", () => {
  let repo: UserRepository;
  let db: ReturnType<typeof mockD1>;

  beforeEach(() => {
    db = mockD1();
    repo = new UserRepository(db as unknown as D1Database);
  });

  it("should retrieve existing user by id", async () => {
    db._seed("1");
    const { Effect } = await import("effect");
    const user = await Effect.runPromise(repo.getById({ userId: "1" }));
    expect(user.id).toBe("1");
    expect(user.displayName).toBe("Test");
  });

  it("should throw NotFoundError for missing user", async () => {
    const { Effect } = await import("effect");
    await expect(
      Effect.runPromise(repo.getById({ userId: "999" }))
    ).rejects.toThrow(/User not found|not found/);
  });

  it("should create a new user", async () => {
    const { Effect } = await import("effect");
    const result = await Effect.runPromise(repo.create({
      user: { id: "1", displayName: "Alice", age: 30, gender: "female" as any }
    }));
    expect(result.id).toBe("1");
    expect(result.displayName).toBe("Alice");
  });

  it("should update existing user with upsert", async () => {
    db._seed("existing");
    const { Effect } = await import("effect");
    await expect(
      Effect.runPromise(repo.update({
        userId: "existing",
        user: { id: "existing", bio: "New bio" },
        updateMask: ["bio"],
      }))
    ).resolves.toBeDefined();
  });

  it("should get media for user", async () => {
    db._seed("1", { media_urls: JSON.stringify([{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }]) });
    const { Effect } = await import("effect");
    const media = await Effect.runPromise(repo.getMedia("1"));
    expect(media).toHaveLength(1);
    expect(media[0].url).toBe("test.jpg");
  });

  it("should add media to user", async () => {
    db._seed("1");
    const { Effect } = await import("effect");
    const result = await Effect.runPromise(repo.addMedia("1", { url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }));
    expect(result.mediaUrls).toHaveLength(1);
  });

  it("should remove media from user", async () => {
    db._seed("1", { media_urls: JSON.stringify([{ url: "test.jpg", type: "image", uploadedAt: "2024-01-01" }]) });
    const { Effect } = await import("effect");
    const result = await Effect.runPromise(repo.removeMedia("1", "test.jpg"));
    expect(result.mediaUrls).toHaveLength(0);
  });
});
