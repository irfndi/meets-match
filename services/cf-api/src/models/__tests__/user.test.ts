import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserRepository } from "../user.js";
import { NotFoundError } from "@meetsmatch/cf-shared";
import { createMockD1 } from "@meetsmatch/cf-shared/testing";

function mockD1() {
  const store = new Map<string, Record<string, unknown>>();
  function seed(id: string, data: Record<string, unknown> = {}) {
    store.set(id, {
      id,
      first_name: "Test",
      last_name: null,
      username: null,
      bio: null,
      age: 25,
      gender: "male",
      interests: "[]",
      media_urls: "[]",
      location: "{}",
      preferences: "{}",
      is_active: 1,
      is_sleeping: 0,
      is_profile_complete: 0,
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
      last_active: "2025-01-01",
      last_reminded_at: null,
      ...data,
    });
  }
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            run: async () => ({ success: true }),
            first: async () => {
              if (sql.includes("SELECT id FROM users"))
                return store.get(String(values[0])) ? { id: values[0] } : null;
              if (sql.includes("FROM users WHERE id ="))
                return store.get(String(values[0])) ?? null;
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
      Effect.runPromise(repo.getById({ userId: "999" })),
    ).rejects.toThrow(/User not found|not found/);
  });

  it("should create a new user", async () => {
    const { Effect } = await import("effect");
    const result = await Effect.runPromise(
      repo.create({
        user: {
          id: "1",
          displayName: "Alice",
          age: 30,
          gender: "female" as any,
        },
      }),
    );
    expect(result.id).toBe("1");
    expect(result.displayName).toBe("Alice");
  });

  it("should update existing user with upsert", async () => {
    db._seed("existing");
    const { Effect } = await import("effect");
    await expect(
      Effect.runPromise(
        repo.update({
          userId: "existing",
          user: { id: "existing", bio: "New bio" },
          updateMask: ["bio"],
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("should get media for user", async () => {
    db._seed("1", {
      media_urls: JSON.stringify([
        { url: "test.jpg", type: "image", uploadedAt: "2024-01-01" },
      ]),
    });
    const { Effect } = await import("effect");
    const media = await Effect.runPromise(repo.getMedia("1"));
    expect(media).toHaveLength(1);
    expect(media[0].url).toBe("test.jpg");
  });

  it("should add media to user", async () => {
    db._seed("1");
    const { Effect } = await import("effect");
    const result = await Effect.runPromise(
      repo.addMedia("1", {
        url: "test.jpg",
        type: "image",
        uploadedAt: "2024-01-01",
      }),
    );
    expect(result.mediaUrls).toHaveLength(1);
  });

  it("should remove media from user", async () => {
    db._seed("1", {
      media_urls: JSON.stringify([
        { url: "test.jpg", type: "image", uploadedAt: "2024-01-01" },
      ]),
    });
    const { Effect } = await import("effect");
    const result = await Effect.runPromise(repo.removeMedia("1", "test.jpg"));
    expect(result.mediaUrls).toHaveLength(0);
  });
});


describe("UserRepository quota methods", () => {
  const today = "2025-06-01T00:00:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(today));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createRepo(row: Record<string, unknown> = {}) {
    const db = createMockD1((sql, values) => {
      if (sql.includes("FROM users WHERE id =")) {
        return {
          results: [
            {
              id: "u1",
              subscription_tier: "free",
              daily_likes_used: 5,
              daily_likes_reset_at: today,
              daily_dislikes_used: 10,
              daily_dislikes_reset_at: today,
              daily_swipes_used: 3,
              daily_swipes_reset_at: today,
              referral_bonus_swipes: 0,
              ...row,
            },
          ],
        };
      }
      return { results: [] };
    });
    return { repo: new UserRepository(db), db };
  }

  describe("recordLike", () => {
    it("returns remaining likes for free user", async () => {
      const { repo } = createRepo();
      const { Effect } = await import("effect");
      const result = await Effect.runPromise(repo.recordLike("u1"));
      expect(result.remaining).toBe(9); // 15 - 5 - 1 = 9
      expect(result.total).toBe(15);
    });

    it("returns remaining likes for premium user", async () => {
      const { repo } = createRepo({ subscription_tier: "premium" });
      const { Effect } = await import("effect");
      const result = await Effect.runPromise(repo.recordLike("u1"));
      expect(result.total).toBe(9999);
    });

    it("returns zero remaining when at limit", async () => {
      const db = createMockD1((sql) => {
        if (sql.includes("FROM users WHERE id =")) {
          return {
            results: [
              {
                id: "u1",
                subscription_tier: "free",
                daily_likes_used: 15,
                daily_likes_reset_at: today,
                referral_bonus_swipes: 0,
              },
            ],
          };
        }
        return { results: [] };
      });
      const repo = new UserRepository(db);
      const { Effect } = await import("effect");
      const result = await Effect.runPromise(repo.recordLike("u1"));
      expect(result.remaining).toBe(0);
      expect(result.total).toBe(15);
    });

    it("throws NotFoundError when user missing", async () => {
      const db = createMockD1(() => ({ results: [] }));
      const repo = new UserRepository(db);
      const { Effect } = await import("effect");
      await expect(
        Effect.runPromise(repo.recordLike("missing")),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("recordDislike", () => {
    it("returns remaining dislikes for free user", async () => {
      const { repo } = createRepo();
      const { Effect } = await import("effect");
      const result = await Effect.runPromise(repo.recordDislike("u1"));
      expect(result.remaining).toBe(24); // 35 - 10 - 1 = 24
      expect(result.total).toBe(35);
    });

    it("throws NotFoundError when user missing", async () => {
      const db = createMockD1(() => ({ results: [] }));
      const repo = new UserRepository(db);
      const { Effect } = await import("effect");
      await expect(
        Effect.runPromise(repo.recordDislike("missing")),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("recordSwipe", () => {
    it("returns remaining swipes for free user", async () => {
      const { repo } = createRepo();
      const { Effect } = await import("effect");
      const result = await Effect.runPromise(repo.recordSwipe("u1"));
      expect(result.remaining).toBe(6); // 10 - 3 - 1 = 6
      expect(result.total).toBe(10);
    });

    it("throws NotFoundError when user missing", async () => {
      const db = createMockD1(() => ({ results: [] }));
      const repo = new UserRepository(db);
      const { Effect } = await import("effect");
      await expect(
        Effect.runPromise(repo.recordSwipe("missing")),
      ).rejects.toThrow(/not found/);
    });
  });

  describe("getInteractionStatus", () => {
    it("returns interaction status for existing user", async () => {
      const { repo } = createRepo();
      const { Effect } = await import("effect");
      const result = await Effect.runPromise(repo.getInteractionStatus("u1"));
      expect(result.likesRemaining).toBe(10); // 15 - 5
      expect(result.dislikesRemaining).toBe(25); // 35 - 10
      expect(result.tier).toBe("free");
    });

    it("throws NotFoundError when user missing", async () => {
      const db = createMockD1(() => ({ results: [] }));
      const repo = new UserRepository(db);
      const { Effect } = await import("effect");
      await expect(
        Effect.runPromise(repo.getInteractionStatus("missing")),
      ).rejects.toThrow(/not found/);
    });
  });
});
