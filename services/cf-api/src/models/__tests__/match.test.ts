import { describe, it, expect, vi } from "vitest";
import { Effect, Cause, Exit } from "effect";
import { MatchRepository, calculateMatchScore, haversine } from "../match.js";
import { UserRepository } from "../user.js";
import {
  computeDefaultPreferences,
  NotFoundError,
  ValidationError,
  DatabaseError,
} from "@meetsmatch/cf-shared";

function createMockD1(
  candidates: Array<Record<string, unknown>> = [],
  currentUser: Record<string, unknown> | null = null,
) {
  const capturedSql: string[] = [];
  const capturedValues: unknown[][] = [];

  const mockD1 = {
    prepare: vi.fn((sql: string) => {
      capturedSql.push(sql);
      return {
        bind: vi.fn((...values: unknown[]) => {
          capturedValues.push(values);
          return {
            run: vi.fn(async () => ({ success: true })),
            first: vi.fn(async () => {
              if (sql.includes("FROM users WHERE id =") && currentUser) {
                return currentUser;
              }
              if (sql.includes("FROM notifications WHERE id =")) {
                return null;
              }
              if (sql.includes("COUNT(*)")) {
                return { c: 0 };
              }
              return null;
            }),
            all: vi.fn(async () => {
              if (sql.includes("FROM users")) {
                return { results: candidates };
              }
              return { results: [] };
            }),
          };
        }),
      };
    }),
    batch: vi.fn(async (statements: unknown[]) => ({ success: true })),
    _capturedSql: capturedSql,
    _capturedValues: capturedValues,
  } as unknown as D1Database & {
    _capturedSql: string[];
    _capturedValues: unknown[][];
  };

  return mockD1;
}

function createDbRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "100",
    first_name: "Test",
    age: 25,
    gender: "female",
    interests: JSON.stringify(["music", "travel"]),
    photos: "[]",
    location: JSON.stringify({ latitude: 0, longitude: 0 }),
    preferences: JSON.stringify({
      minAge: 20,
      maxAge: 30,
      genderPreference: ["male"],
      maxDistance: 50,
    }),
    is_active: 1,
    is_profile_complete: 1,
    ...overrides,
  };
}

function createUser(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "100",
    username: undefined,
    displayName: "Test",
    lastName: undefined,
    bio: undefined,
    age: 25,
    gender: "female",
    interests: ["music", "travel"],
    photos: [],
    location: { latitude: 0, longitude: 0 },
    preferences: {
      minAge: 20,
      maxAge: 30,
      genderPreference: ["male"],
      maxDistance: 50,
    },
    isActive: true,
    isSleeping: false,
    isProfileComplete: true,
    phoneNumber: undefined,
    language: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    lastActive: undefined,
    ...overrides,
  };
}

describe("haversine", () => {
  it("calculates distance between two points", () => {
    const dist = haversine(0, 0, 1, 0);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(112);
  });

  it("returns 0 for same point", () => {
    expect(haversine(10, 20, 10, 20)).toBe(0);
  });
});

describe("calculateMatchScore", () => {
  it("gives perfect score for identical profiles at same location", () => {
    const user = createUser({
      interests: ["music", "travel"],
      preferences: {
        minAge: 25,
        maxAge: 25,
        genderPreference: ["female"],
        maxDistance: 50,
      },
      location: { latitude: 0, longitude: 0 },
    });
    const score = calculateMatchScore(user as any, user as any);
    expect(score.location).toBe(1);
    expect(score.interests).toBe(1);
    expect(score.preferences).toBe(1);
    expect(score.total).toBe(1);
  });

  it("gives 0 location score when no location", () => {
    const user1 = createUser({ location: { latitude: 0, longitude: 0 } });
    const user2 = createUser({ location: undefined });
    const score = calculateMatchScore(user1 as any, user2 as any);
    expect(score.location).toBe(0);
  });

  it("gives 0 interests score with no common interests", () => {
    const user1 = createUser({ interests: ["music"] });
    const user2 = createUser({ interests: ["sports"] });
    const score = calculateMatchScore(user1 as any, user2 as any);
    expect(score.interests).toBe(0);
  });

  it("penalizes distant location beyond maxDistance", () => {
    const user1 = createUser({
      location: { latitude: 0, longitude: 0 },
      preferences: { maxDistance: 100 },
    });
    const user2 = createUser({
      location: { latitude: 0, longitude: 1 },
    });
    const score = calculateMatchScore(user1 as any, user2 as any);
    // Distance ~111km, maxDist 100km, so outside range => 0
    expect(score.location).toBe(0);
  });

  it("penalizes non-matching preferences", () => {
    const user1 = createUser({
      age: 25,
      preferences: { minAge: 30, maxAge: 40, genderPreference: ["male"] },
    });
    const user2 = createUser({
      age: 20,
      gender: "female",
    });
    const score = calculateMatchScore(user1 as any, user2 as any);
    expect(score.preferences).toBe(0);
  });

  it("weights correctly: location 30%, interests 40%, preferences 30%", () => {
    const user1 = createUser({
      interests: ["music"],
      preferences: { maxDistance: 100 },
      location: { latitude: 0, longitude: 0 },
    });
    const user2 = createUser({
      interests: ["music", "sports"],
      location: { latitude: 0, longitude: 0 },
      age: 25,
      gender: "female",
    });
    const score = calculateMatchScore(user1 as any, user2 as any);
    // location: same point => 1.0 * 0.3 = 0.3
    // interests: 1 common / 2 union = 0.5 * 0.4 = 0.2
    // preferences: only maxDistance applies (no minAge/maxAge/genderPreference/relationshipType)
    // So prefChecks = 0, score.preferences = 0
    // total = 0.3 + 0.2 + 0 = 0.5
    expect(score.location).toBe(1);
    expect(score.interests).toBe(0.5);
    expect(score.preferences).toBe(0);
    expect(score.total).toBeCloseTo(0.5, 5);
  });

  it("gives 0 location score when both users have geocoded coordinates", () => {
    const user1 = createUser({
      location: { latitude: -6.2, longitude: 106.8, source: "geocoded" },
    });
    const user2 = createUser({
      location: { latitude: -6.2, longitude: 106.8, source: "geocoded" },
    });
    const score = calculateMatchScore(user1 as any, user2 as any);
    expect(score.location).toBe(0);
  });

  it("gives 0 location score when one user has geocoded coordinates", () => {
    const user1 = createUser({
      location: { latitude: 0, longitude: 0, source: "gps" },
    });
    const user2 = createUser({
      location: { latitude: -6.2, longitude: 106.8, source: "geocoded" },
    });
    const score = calculateMatchScore(user1 as any, user2 as any);
    expect(score.location).toBe(0);
  });
});

describe("MatchRepository.getPotentialMatches SQL", () => {
  it("includes age and gender preference filters in SQL", async () => {
    const currentUser = createDbRow({
      id: "1",
      preferences: JSON.stringify({
        minAge: 20,
        maxAge: 30,
        genderPreference: ["male", "non-binary"],
      }),
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    const sql = mockD1._capturedSql.find((s) => s.includes("FROM users u"));
    expect(sql).toContain("u.age >= ?");
    expect(sql).toContain("u.age <= ?");
    expect(sql).toContain("u.gender IN (?,?)");

    const values = mockD1._capturedValues.find((v) => v.length >= 8);
    expect(values).toContain(20);
    expect(values).toContain(30);
    expect(values).toContain("male");
    expect(values).toContain("non-binary");
  });

  it("includes is_active and is_profile_complete filters in SQL", async () => {
    const currentUser = createDbRow({ id: "1", preferences: "{}" });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    const sql = mockD1._capturedSql.find((s) => s.includes("FROM users u"));
    expect(sql).toContain("u.is_active = 1");
    expect(sql).toContain("u.is_profile_complete = 1");
  });

  it("keeps gender filter even when relaxing filters", async () => {
    const currentUser = createDbRow({
      id: "1",
      preferences: JSON.stringify({
        minAge: 20,
        maxAge: 30,
        genderPreference: ["female"],
      }),
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({
        userId: "1",
        limit: 10,
        relaxFilters: true,
      }),
    );

    const sql = mockD1._capturedSql.find((s) => s.includes("FROM users u"));
    // Soft relax still applies age bounds (±3 years) and gender filter
    expect(sql).toContain("u.age >= ?");
    expect(sql).toContain("u.age <= ?");
    expect(sql).toContain("u.gender IN (?)");

    const values = mockD1._capturedValues.find((v) =>
      v.some((x) => x === "female"),
    );
    expect(values).toBeDefined();
    expect(values).toContain("female");
    // With minAge=20, maxAge=30, soft relax becomes 17-33
    expect(values).toContain(17);
    expect(values).toContain(33);
  });

  it("applies default gender preference when user has empty preferences", async () => {
    const currentUser = createDbRow({
      id: "1",
      gender: "male",
      age: 25,
      preferences: "{}",
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    const sql = mockD1._capturedSql.find((s) => s.includes("FROM users u"));
    expect(sql).toContain("u.gender IN (?)");

    const values = mockD1._capturedValues.find((v) =>
      v.some((x) => x === "female"),
    );
    expect(values).toBeDefined();
    expect(values).toContain("female");
    // Default age range: 25-7=18, 25+7=32
    expect(values).toContain(18);
    expect(values).toContain(32);
  });

  it("applies default opposite-sex preference for female users", async () => {
    const currentUser = createDbRow({
      id: "1",
      gender: "female",
      age: 30,
      preferences: "{}",
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    const values = mockD1._capturedValues.find((v) =>
      v.some((x) => x === "male"),
    );
    expect(values).toBeDefined();
    expect(values).toContain("male");
  });

  it("applies all-genders default for 'other' gender with empty prefs", async () => {
    const currentUser = createDbRow({
      id: "1",
      gender: "other",
      age: 28,
      preferences: "{}",
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    const sql = mockD1._capturedSql.find((s) => s.includes("FROM users u"));
    expect(sql).toContain("u.gender IN (?,?,?,?)");

    const values = mockD1._capturedValues.find((v) =>
      v.some((x) => x === "male"),
    );
    expect(values).toBeDefined();
    expect(values).toContain("male");
    expect(values).toContain("female");
    expect(values).toContain("other");
    expect(values).toContain("prefer_not_to_say");
  });

  it("applies all-genders default for 'prefer_not_to_say' gender with empty prefs", async () => {
    const currentUser = createDbRow({
      id: "1",
      gender: "prefer_not_to_say",
      age: 28,
      preferences: "{}",
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    const sql = mockD1._capturedSql.find((s) => s.includes("FROM users u"));
    expect(sql).toContain("u.gender IN (?,?,?,?)");

    const values = mockD1._capturedValues.find((v) =>
      v.some((x) => x === "male"),
    );
    expect(values).toBeDefined();
    expect(values).toContain("male");
    expect(values).toContain("female");
    expect(values).toContain("other");
    expect(values).toContain("prefer_not_to_say");
  });

  it("does not override existing gender preference with defaults", async () => {
    const currentUser = createDbRow({
      id: "1",
      gender: "male",
      age: 25,
      preferences: JSON.stringify({
        genderPreference: ["male", "other"],
        minAge: 20,
        maxAge: 40,
      }),
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    const values = mockD1._capturedValues.find((v) =>
      v.some((x) => x === "male"),
    );
    expect(values).toBeDefined();
    expect(values).toContain("male");
    expect(values).toContain("other");
    expect(values).not.toContain("female");
    expect(values).toContain(20);
    expect(values).toContain(40);
  });

  it("applies gender default when stored preference array is empty", async () => {
    const currentUser = createDbRow({
      id: "1",
      gender: "male",
      age: 25,
      preferences: JSON.stringify({
        genderPreference: [],
      }),
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    const sql = mockD1._capturedSql.find((s) => s.includes("FROM users u"));
    expect(sql).toContain("u.gender IN (?)");

    const values = mockD1._capturedValues.find((v) =>
      v.some((x) => x === "female"),
    );
    expect(values).toBeDefined();
    expect(values).toContain("female");
  });

  it("preserves existing age prefs and only fills missing gender default", async () => {
    const currentUser = createDbRow({
      id: "1",
      gender: "male",
      age: 25,
      preferences: JSON.stringify({
        minAge: 22,
        maxAge: 35,
        maxDistance: 50,
      }),
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    const values = mockD1._capturedValues.find((v) =>
      v.some((x) => x === "female"),
    );
    expect(values).toBeDefined();
    expect(values).toContain("female");
    expect(values).toContain(22);
    expect(values).toContain(35);
    expect(values).not.toContain(18);
    expect(values).not.toContain(32);
  });
});

describe("MatchRepository.getPotentialMatches JS filtering", () => {
  it("filters out candidates beyond maxDistance", async () => {
    const currentUser = createDbRow({
      id: "1",
      location: JSON.stringify({ latitude: 0, longitude: 0 }),
      preferences: JSON.stringify({ maxDistance: 10 }),
    });
    const candidates = [
      createDbRow({
        id: "2",
        location: JSON.stringify({ latitude: 0, longitude: 0.05 }),
        first_name: "Near",
        preferences: "{}",
      }),
      createDbRow({
        id: "3",
        location: JSON.stringify({ latitude: 0, longitude: 2 }),
        first_name: "Far",
        preferences: "{}",
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("does not hard-filter geocoded users by distance", async () => {
    const currentUser = createDbRow({
      id: "1",
      location: JSON.stringify({
        latitude: 0,
        longitude: 0,
        source: "geocoded",
      }),
      preferences: JSON.stringify({ maxDistance: 10 }),
    });
    const candidates = [
      createDbRow({
        id: "2",
        location: JSON.stringify({
          latitude: 0,
          longitude: 100,
          source: "geocoded",
        }),
        first_name: "FarGeocoded",
        preferences: "{}",
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("respects cooldown for disliked profiles", async () => {
    const now = new Date().toISOString();
    const currentUser = createDbRow({ id: "1", preferences: "{}" });
    const candidates = [
      createDbRow({
        id: "2",
        first_name: "RecentDislike",
        preferences: "{}",
        match_status: "rejected",
        user1_id: "1",
        user2_id: "2",
        user1_action: "dislike",
        user2_action: "none",
        match_updated_at: now,
      }),
      createDbRow({
        id: "3",
        first_name: "OldDislike",
        preferences: "{}",
        match_status: "rejected",
        user1_id: "1",
        user2_id: "3",
        user1_action: "dislike",
        user2_action: "none",
        match_updated_at: new Date(
          Date.now() - 4 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("respects cooldown for skipped profiles", async () => {
    const now = new Date().toISOString();
    const currentUser = createDbRow({ id: "1", preferences: "{}" });
    const candidates = [
      createDbRow({
        id: "2",
        first_name: "RecentSkip",
        preferences: "{}",
        match_status: "pending",
        user1_id: "1",
        user2_id: "2",
        user1_action: "skip",
        user2_action: "none",
        match_updated_at: now,
      }),
      createDbRow({
        id: "3",
        first_name: "OldSkip",
        preferences: "{}",
        match_status: "pending",
        user1_id: "1",
        user2_id: "3",
        user1_action: "skip",
        user2_action: "none",
        match_updated_at: new Date(
          Date.now() - 24 * 60 * 60 * 1000,
        ).toISOString(),
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("returns empty array for inactive current user", async () => {
    const currentUser = createDbRow({
      id: "1",
      is_active: 0,
      preferences: "{}",
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(0);
  });

  it("returns empty array for incomplete profile", async () => {
    const currentUser = createDbRow({
      id: "1",
      is_profile_complete: 0,
      preferences: "{}",
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(0);
  });

  it("records profile views for returned candidates", async () => {
    const currentUser = createDbRow({ id: "1", preferences: "{}" });
    const candidates = [
      createDbRow({ id: "2", first_name: "A", preferences: "{}" }),
      createDbRow({ id: "3", first_name: "B", preferences: "{}" }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    expect(mockD1.batch).toHaveBeenCalled();
    const batchCalls = (mockD1.batch as any).mock.calls;
    expect(batchCalls[0][0]).toHaveLength(2);
  });

  it("excludes blocked users via SQL", async () => {
    const currentUser = createDbRow({ id: "1", preferences: "{}" });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );

    const sql = mockD1._capturedSql.find((s) => s.includes("FROM users u"));
    expect(sql).toContain("blocks");
    expect(sql).toContain("NOT EXISTS");
  });

  it("filters out candidates whose preferences exclude current user (bidirectional)", async () => {
    const currentUser = createDbRow({
      id: "1",
      age: 31,
      gender: "male",
      location: JSON.stringify({ latitude: 0, longitude: 0 }),
      preferences: JSON.stringify({ maxDistance: 100 }),
    });
    const candidates = [
      createDbRow({
        id: "2",
        first_name: "TooYoung",
        age: 20,
        gender: "female",
        location: JSON.stringify({ latitude: 0, longitude: 0 }),
        preferences: JSON.stringify({
          minAge: 25,
          maxAge: 30,
          genderPreference: ["male"],
          maxDistance: 100,
        }),
      }),
      createDbRow({
        id: "3",
        first_name: "GoodMatch",
        age: 20,
        gender: "female",
        location: JSON.stringify({ latitude: 0, longitude: 0 }),
        preferences: JSON.stringify({
          minAge: 25,
          maxAge: 35,
          genderPreference: ["male"],
          maxDistance: 100,
        }),
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("filters out candidates whose gender preference excludes current user", async () => {
    const currentUser = createDbRow({
      id: "1",
      age: 25,
      gender: "male",
      preferences: "{}",
    });
    const candidates = [
      createDbRow({
        id: "2",
        first_name: "WantsFemale",
        preferences: JSON.stringify({ genderPreference: ["female"] }),
      }),
      createDbRow({
        id: "3",
        first_name: "WantsMale",
        preferences: JSON.stringify({ genderPreference: ["male"] }),
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("bypasses skip cooldown when other user liked us", async () => {
    const now = new Date().toISOString();
    const currentUser = createDbRow({ id: "1", preferences: "{}" });
    const candidates = [
      createDbRow({
        id: "2",
        first_name: "SkippedButLikedBack",
        preferences: "{}",
        match_status: "pending",
        user1_id: "1",
        user2_id: "2",
        user1_action: "skip",
        user2_action: "like",
        match_updated_at: now,
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("includes expired pending likes (>30 days) in results", async () => {
    const currentUser = createDbRow({ id: "1", preferences: "{}" });
    const candidates = [
      createDbRow({
        id: "2",
        first_name: "StaleLike",
        preferences: "{}",
        match_status: "pending",
        user1_id: "1",
        user2_id: "2",
        user1_action: "like",
        user2_action: "none",
        match_updated_at: new Date(
          Date.now() - 31 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });

  it("excludes fresh pending likes (<30 days)", async () => {
    const currentUser = createDbRow({ id: "1", preferences: "{}" });
    const candidates = [
      createDbRow({
        id: "2",
        first_name: "FreshLike",
        preferences: "{}",
        match_status: "pending",
        user1_id: "1",
        user2_id: "2",
        user1_action: "like",
        user2_action: "none",
        match_updated_at: new Date().toISOString(),
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(0);
  });

  it("includes old mutual matches for recycling", async () => {
    const currentUser = createDbRow({ id: "1", preferences: "{}" });
    const candidates = [
      createDbRow({
        id: "2",
        first_name: "OldMatch",
        preferences: "{}",
        match_status: "matched",
        user1_id: "1",
        user2_id: "2",
        user1_action: "like",
        user2_action: "like",
        matched_at: new Date(
          Date.now() - 31 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(
      matchRepo.getPotentialMatches({ userId: "1", limit: 10 }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2");
  });
});

describe("MatchRepository.getPendingLikes", () => {
  it("excludes blocked users from pending likes", async () => {
    const mockD1 = createMockD1(
      [],
      createDbRow({ id: "1", preferences: "{}" }),
    );
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(matchRepo.getPendingLikes({ userId: "1" }));

    const sql = mockD1._capturedSql.find((s) => s.includes("FROM matches m"));
    expect(sql).toContain("blocks");
    expect(sql).toContain("NOT EXISTS");
  });
});

describe("computeDefaultPreferences", () => {
  it("returns opposite-sex preference for male users", () => {
    const result = computeDefaultPreferences({
      gender: "male",
      age: 25,
    });
    expect(result.genderPreference).toEqual(["female"]);
    expect(result.minAge).toBe(18);
    expect(result.maxAge).toBe(32);
    expect(result.maxDistance).toBe(25);
  });

  it("returns opposite-sex preference for female users", () => {
    const result = computeDefaultPreferences({
      gender: "female",
      age: 30,
    });
    expect(result.genderPreference).toEqual(["male"]);
    expect(result.minAge).toBe(23);
    expect(result.maxAge).toBe(37);
  });

  it("returns all-genders preference for 'other' gender", () => {
    const result = computeDefaultPreferences({
      gender: "other",
      age: 28,
    });
    expect(result.genderPreference).toEqual([
      "male",
      "female",
      "other",
      "prefer_not_to_say",
    ]);
  });

  it("returns all-genders preference for 'prefer_not_to_say' gender", () => {
    const result = computeDefaultPreferences({
      gender: "prefer_not_to_say",
      age: 28,
    });
    expect(result.genderPreference).toEqual([
      "male",
      "female",
      "other",
      "prefer_not_to_say",
    ]);
  });

  it("clamps minAge to 12 and maxAge to 80", () => {
    const result = computeDefaultPreferences({
      gender: "male",
      age: 15,
    });
    expect(result.minAge).toBe(12); // 15-7=8, clamped to 12
    expect(result.maxAge).toBe(22); // 15+7=22

    const resultOld = computeDefaultPreferences({
      gender: "male",
      age: 78,
    });
    expect(resultOld.minAge).toBe(71); // 78-7=71
    expect(resultOld.maxAge).toBe(80); // 78+7=85, clamped to 80
  });

  it("handles missing age gracefully", () => {
    const result = computeDefaultPreferences({
      gender: "male",
    });
    expect(result.genderPreference).toEqual(["female"]);
    expect(result.minAge).toBeUndefined();
    expect(result.maxAge).toBeUndefined();
    expect(result.maxDistance).toBe(25);
  });

  it("handles missing gender gracefully", () => {
    const result = computeDefaultPreferences({
      age: 25,
    });
    expect(result.genderPreference).toBeUndefined();
    expect(result.minAge).toBe(18);
    expect(result.maxAge).toBe(32);
  });

  it("falls back to birthDate when age is missing", () => {
    const birthYear = new Date().getFullYear() - 25;
    const birthDate = `${birthYear}-01-01`;
    const result = computeDefaultPreferences({
      gender: "male",
      birthDate,
    });
    expect(result.minAge).toBe(18);
    expect(result.maxAge).toBe(32);
  });
});

// ─── CRUD Test Helpers ───────────────────────────────────────────────────────

/**
 * Create a sequential mock D1Database where each .first() call returns
 * the next result from the queue. Suitable for CRUD methods that make
 * multiple sequential DB calls.
 */
function createSequentialMockD1(
  firstQueue: Array<Record<string, unknown> | null>,
) {
  let firstIdx = 0;
  const capturedSql: string[] = [];
  const capturedValues: unknown[][] = [];

  const mockD1 = {
    prepare: vi.fn((sql: string) => {
      capturedSql.push(sql);
      return {
        bind: vi.fn((...values: unknown[]) => {
          capturedValues.push(values);
          return {
            run: vi.fn(async () => ({ success: true })),
            first: vi.fn(async () => {
              const result = firstQueue[firstIdx++];
              return result !== undefined ? result : null;
            }),
            all: vi.fn(async () => ({ results: [] })),
          };
        }),
      };
    }),
    batch: vi.fn(async () => ({ success: true })),
    _capturedSql: capturedSql,
    _capturedValues: capturedValues,
    _firstIdx: () => firstIdx,
  };

  return mockD1;
}

/**
 * Build a DB row (snake_case) matching what toMatch() expects.
 */
function createMatchRow(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: "match-1",
    user1_id: "user-a",
    user2_id: "user-b",
    status: "pending",
    score: "{}",
    created_at: "2025-01-01 00:00:00",
    updated_at: "2025-01-01 00:00:00",
    matched_at: null,
    user1_action: "none",
    user2_action: "none",
    like_message: null,
    ...overrides,
  };
}

// ─── getById ─────────────────────────────────────────────────────────────────

describe("MatchRepository.getById", () => {
  it("returns the match when found", async () => {
    const row = createMatchRow({ id: "m1" });
    const mockD1 = createSequentialMockD1([row]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(repo.getById({ matchId: "m1" }));

    expect(result.id).toBe("m1");
    expect(result.user1Id).toBe("user-a");
    expect(result.user2Id).toBe("user-b");
    expect(result.status).toBe("PENDING");
  });

  it("throws NotFoundError when match is not found", async () => {
    const mockD1 = createSequentialMockD1([null]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const exit = await Effect.runPromiseExit(repo.getById({ matchId: "m1" }));

    expect(Exit.isFailure(exit)).toBe(true);
    const err = Cause.failureOption(exit.cause);
    expect(err._tag).toBe("Some");
    expect(err.value).toBeInstanceOf(NotFoundError);
    expect((err.value as NotFoundError).entity).toBe("Match");
    expect((err.value as NotFoundError).id).toBe("m1");
  });

  it("queries by matchId in the SQL", async () => {
    const row = createMatchRow({ id: "m1" });
    const mockD1 = createSequentialMockD1([row]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    await Effect.runPromise(repo.getById({ matchId: "m1" }));

    expect(mockD1._capturedSql[0]).toContain("WHERE id = ?");
    expect(mockD1._capturedValues[0]).toContain("m1");
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe("MatchRepository.create", () => {
  it("creates a new match when pair does not exist", async () => {
    const mockD1 = createSequentialMockD1([null]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.create({ user1Id: "user-b", user2Id: "user-a" }),
    );

    expect(result.status).toBe("PENDING");
    expect(result.id).toBeTruthy();
    expect(result.user1Id).toBe("user-a");
    expect(result.user2Id).toBe("user-b");
  });

  it("returns existing match when pair already exists", async () => {
    const existingRow = createMatchRow({
      id: "existing-match",
      user1_id: "user-a",
      user2_id: "user-b",
      status: "pending",
    });
    const mockD1 = createSequentialMockD1([existingRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.create({ user1Id: "user-a", user2Id: "user-b" }),
    );

    expect(result.id).toBe("existing-match");
    expect(result.user1Id).toBe("user-a");
    expect(result.user2Id).toBe("user-b");
  });

  it("does not insert when match already exists", async () => {
    const existingRow = createMatchRow({ id: "existing-match" });
    const mockD1 = createSequentialMockD1([existingRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    await Effect.runPromise(
      repo.create({ user1Id: "user-a", user2Id: "user-b" }),
    );

    // Only SELECT should have been called, no INSERT
    const sqls = mockD1._capturedSql;
    expect(sqls).toHaveLength(1);
    expect(sqls[0]).toContain("SELECT");
  });

  it("sorts user IDs so user1Id < user2Id", async () => {
    const mockD1 = createSequentialMockD1([null]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.create({ user1Id: "zzz", user2Id: "aaa" }),
    );

    expect(result.user1Id).toBe("aaa");
    expect(result.user2Id).toBe("zzz");
  });
});

// ─── like ────────────────────────────────────────────────────────────────────

describe("MatchRepository.like", () => {
  it("successfully likes a pending match (non-mutual)", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "none",
    });
    const updatedRow = createMatchRow({
      status: "pending",
      user1_action: "LIKE",
      user2_action: "none",
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.like({ matchId: "match-1", userId: "user-a" }),
    );

    expect(result.isMutual).toBe(false);
    expect(result.match.status).toBe("PENDING");
    expect(result.match.user1Action).toBe("LIKE");
  });

  it("detects mutual match when other user already liked", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "like",
      user2_action: "none",
    });
    const finalRow = createMatchRow({
      status: "matched",
      user1_action: "LIKE",
      user2_action: "LIKE",
      matched_at: "2025-01-02 00:00:00",
    });
    const mockD1 = createSequentialMockD1([initialRow, finalRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.like({ matchId: "match-1", userId: "user-b" }),
    );

    expect(result.isMutual).toBe(true);
    expect(result.match.status).toBe("MATCHED");
  });

  it("like with message updates like_message column", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "none",
    });
    const updatedRow = createMatchRow({
      status: "pending",
      user1_action: "LIKE",
      user2_action: "none",
      like_message: JSON.stringify({
        fromUserId: "user-a",
        text: "Hello!",
        mediaUrl: null,
        createdAt: "2025-01-01T00:00:00.000Z",
      }),
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.like({
        matchId: "match-1",
        userId: "user-a",
        message: { text: "Hello!" },
      }),
    );

    expect(result.isMutual).toBe(false);
    expect(result.match.likeMessage).toBeDefined();
    expect(result.match.likeMessage?.text).toBe("Hello!");
  });

  it("like with mediaUrl in message", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "none",
    });
    const updatedRow = createMatchRow({
      status: "pending",
      user1_action: "LIKE",
      user2_action: "none",
      like_message: JSON.stringify({
        fromUserId: "user-a",
        text: null,
        mediaUrl: "https://example.com/photo.jpg",
        createdAt: "2025-01-01T00:00:00.000Z",
      }),
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.like({
        matchId: "match-1",
        userId: "user-a",
        message: { mediaUrl: "https://example.com/photo.jpg" },
      }),
    );

    expect(result.match.likeMessage?.mediaUrl).toBe(
      "https://example.com/photo.jpg",
    );
  });

  it("throws ValidationError when user is not part of the match", async () => {
    const row = createMatchRow({
      user1_id: "other-a",
      user2_id: "other-b",
    });
    const mockD1 = createSequentialMockD1([row]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const exit = await Effect.runPromiseExit(
      repo.like({ matchId: "match-1", userId: "user-c" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const err = Cause.failureOption(exit.cause);
    expect(err.value).toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError when match does not exist", async () => {
    const mockD1 = createSequentialMockD1([null]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const exit = await Effect.runPromiseExit(
      repo.like({ matchId: "match-1", userId: "user-a" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const err = Cause.failureOption(exit.cause);
    expect(err.value).toBeInstanceOf(NotFoundError);
  });

  it("like as user2 works correctly", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "none",
    });
    const updatedRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "LIKE",
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.like({ matchId: "match-1", userId: "user-b" }),
    );

    expect(result.match.user2Action).toBe("LIKE");
  });

  it("mutual match as user2 when user1 already liked", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "like",
      user2_action: "none",
    });
    const finalRow = createMatchRow({
      status: "matched",
      user1_action: "LIKE",
      user2_action: "LIKE",
      matched_at: "2025-01-02 00:00:00",
    });
    const mockD1 = createSequentialMockD1([initialRow, finalRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.like({ matchId: "match-1", userId: "user-b" }),
    );

    expect(result.isMutual).toBe(true);
  });
});

// ─── dislike ─────────────────────────────────────────────────────────────────

describe("MatchRepository.dislike", () => {
  it("dislikes a match and sets status to rejected", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "none",
    });
    const updatedRow = createMatchRow({
      status: "rejected",
      user1_action: "DISLIKE",
      user2_action: "none",
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.dislike({ matchId: "match-1", userId: "user-a" }),
    );

    expect(result.status).toBe("REJECTED");
    expect(result.user1Action).toBe("DISLIKE");
  });

  it("dislike as user2 works", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "none",
    });
    const updatedRow = createMatchRow({
      status: "rejected",
      user1_action: "none",
      user2_action: "DISLIKE",
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.dislike({ matchId: "match-1", userId: "user-b" }),
    );

    expect(result.status).toBe("REJECTED");
    expect(result.user2Action).toBe("DISLIKE");
  });

  it("throws ValidationError when user is not part of the match", async () => {
    const row = createMatchRow({
      user1_id: "other-a",
      user2_id: "other-b",
    });
    const mockD1 = createSequentialMockD1([row]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const exit = await Effect.runPromiseExit(
      repo.dislike({ matchId: "match-1", userId: "user-c" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const err = Cause.failureOption(exit.cause);
    expect(err.value).toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError when match does not exist", async () => {
    const mockD1 = createSequentialMockD1([null]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const exit = await Effect.runPromiseExit(
      repo.dislike({ matchId: "match-1", userId: "user-a" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const err = Cause.failureOption(exit.cause);
    expect(err.value).toBeInstanceOf(NotFoundError);
  });
});

// ─── skip ────────────────────────────────────────────────────────────────────

describe("MatchRepository.skip", () => {
  it("skips a match without changing status", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "none",
    });
    const updatedRow = createMatchRow({
      status: "pending",
      user1_action: "SKIP",
      user2_action: "none",
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.skip({ matchId: "match-1", userId: "user-a" }),
    );

    expect(result.status).toBe("PENDING");
    expect(result.user1Action).toBe("SKIP");
  });

  it("skip as user2 works", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "none",
    });
    const updatedRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "SKIP",
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.skip({ matchId: "match-1", userId: "user-b" }),
    );

    expect(result.status).toBe("PENDING");
    expect(result.user2Action).toBe("SKIP");
  });

  it("throws ValidationError when user is not part of the match", async () => {
    const row = createMatchRow({
      user1_id: "other-a",
      user2_id: "other-b",
    });
    const mockD1 = createSequentialMockD1([row]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const exit = await Effect.runPromiseExit(
      repo.skip({ matchId: "match-1", userId: "user-c" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const err = Cause.failureOption(exit.cause);
    expect(err.value).toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError when match does not exist", async () => {
    const mockD1 = createSequentialMockD1([null]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const exit = await Effect.runPromiseExit(
      repo.skip({ matchId: "match-1", userId: "user-a" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const err = Cause.failureOption(exit.cause);
    expect(err.value).toBeInstanceOf(NotFoundError);
  });
});

// ─── undo ────────────────────────────────────────────────────────────────────

describe("MatchRepository.undo", () => {
  it("returns restored:false when action is NONE", async () => {
    const row = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "none",
    });
    const mockD1 = createSequentialMockD1([row]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.undo({ matchId: "match-1", userId: "user-a" }),
    );

    expect(result.restored).toBe(false);
    expect(result.match.user1Action).toBe("NONE");
  });

  it("undoes a skip and reverts action to none", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "skip",
      user2_action: "none",
    });
    const updatedRow = createMatchRow({
      status: "pending",
      user1_action: "NONE",
      user2_action: "none",
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.undo({ matchId: "match-1", userId: "user-a" }),
    );

    expect(result.restored).toBe(true);
    expect(result.match.user1Action).toBe("NONE");
    expect(result.match.status).toBe("PENDING");
  });

  it("undoes a mutual match and reverts status to pending", async () => {
    const initialRow = createMatchRow({
      status: "matched",
      user1_action: "like",
      user2_action: "like",
      matched_at: "2025-01-02 00:00:00",
    });
    const updatedRow = createMatchRow({
      status: "pending",
      user1_action: "NONE",
      user2_action: "LIKE",
      matched_at: null,
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.undo({ matchId: "match-1", userId: "user-a" }),
    );

    expect(result.restored).toBe(true);
    expect(result.match.status).toBe("PENDING");
    expect(result.match.user1Action).toBe("NONE");
    expect(result.match.matchedAt).toBeUndefined();
  });

  it("undoes a rejection and reverts status to pending", async () => {
    const initialRow = createMatchRow({
      status: "rejected",
      user1_action: "dislike",
      user2_action: "none",
    });
    const updatedRow = createMatchRow({
      status: "pending",
      user1_action: "NONE",
      user2_action: "none",
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.undo({ matchId: "match-1", userId: "user-a" }),
    );

    expect(result.restored).toBe(true);
    expect(result.match.status).toBe("PENDING");
    expect(result.match.user1Action).toBe("NONE");
  });

  it("undo as user2 works for skip", async () => {
    const initialRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "skip",
    });
    const updatedRow = createMatchRow({
      status: "pending",
      user1_action: "none",
      user2_action: "NONE",
    });
    const mockD1 = createSequentialMockD1([initialRow, updatedRow]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.undo({ matchId: "match-1", userId: "user-b" }),
    );

    expect(result.restored).toBe(true);
    expect(result.match.user2Action).toBe("NONE");
  });

  it("throws ValidationError when user is not part of the match", async () => {
    const row = createMatchRow({
      user1_id: "other-a",
      user2_id: "other-b",
    });
    const mockD1 = createSequentialMockD1([row]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const exit = await Effect.runPromiseExit(
      repo.undo({ matchId: "match-1", userId: "user-c" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const err = Cause.failureOption(exit.cause);
    expect(err.value).toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError when match does not exist", async () => {
    const mockD1 = createSequentialMockD1([null]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const exit = await Effect.runPromiseExit(
      repo.undo({ matchId: "match-1", userId: "user-a" }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    const err = Cause.failureOption(exit.cause);
    expect(err.value).toBeInstanceOf(NotFoundError);
  });
});

// ─── getList ─────────────────────────────────────────────────────────────────

describe("MatchRepository.getList", () => {
  function createSequentialMockD1WithAll(
    allResults: Array<Record<string, unknown>>,
    firstResults: Array<Record<string, unknown> | null> = [],
  ) {
    let firstIdx = 0;
    const capturedSql: string[] = [];
    const capturedValues: unknown[][] = [];

    const mockD1 = {
      prepare: vi.fn((sql: string) => {
        capturedSql.push(sql);
        return {
          bind: vi.fn((...values: unknown[]) => {
            capturedValues.push(values);
            return {
              run: vi.fn(async () => ({ success: true })),
              first: vi.fn(async () => {
                const result = firstResults[firstIdx++];
                return result !== undefined ? result : null;
              }),
              all: vi.fn(async () => ({
                results: allResults,
              })),
            };
          }),
        };
      }),
      batch: vi.fn(async () => ({ success: true })),
      _capturedSql: capturedSql,
      _capturedValues: capturedValues,
    };

    return mockD1;
  }

  it("returns all matches for a user", async () => {
    const rows = [
      createMatchRow({ id: "m1", status: "pending" }),
      createMatchRow({ id: "m2", status: "matched" }),
    ];
    const mockD1 = createSequentialMockD1WithAll(rows);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(repo.getList({ userId: "user-a" }));

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("m1");
    expect(result[1].id).toBe("m2");
  });

  it("filters by status when provided", async () => {
    const rows = [createMatchRow({ id: "m1", status: "matched" })];
    const mockD1 = createSequentialMockD1WithAll(rows);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    await Effect.runPromise(
      repo.getList({ userId: "user-a", status: "MATCHED" }),
    );

    const sql = mockD1._capturedSql[0];
    expect(sql).toContain("status = ?");
  });

  it("includes LIMIT and OFFSET when provided", async () => {
    const mockD1 = createSequentialMockD1WithAll([]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    await Effect.runPromise(
      repo.getList({ userId: "user-a", limit: 5, offset: 10 }),
    );

    const sql = mockD1._capturedSql[0];
    expect(sql).toContain("LIMIT ?");
    expect(sql).toContain("OFFSET ?");
  });

  it("queries for both user1_id and user2_id", async () => {
    const mockD1 = createSequentialMockD1WithAll([]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    await Effect.runPromise(repo.getList({ userId: "user-a" }));

    const sql = mockD1._capturedSql[0];
    expect(sql).toContain("user1_id = ?");
    expect(sql).toContain("user2_id = ?");
    expect(mockD1._capturedValues[0]).toContain("user-a");
  });

  it("returns empty array when no matches exist", async () => {
    const mockD1 = createSequentialMockD1WithAll([]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(repo.getList({ userId: "user-a" }));

    expect(result).toHaveLength(0);
  });
});

// ─── getPendingLikes (extended) ──────────────────────────────────────────────

describe("MatchRepository.getPendingLikes (extended)", () => {
  function createPendingLikesMockD1(
    allResults: Array<Record<string, unknown>>,
  ) {
    const capturedSql: string[] = [];
    const capturedValues: unknown[][] = [];

    const mockD1 = {
      prepare: vi.fn((sql: string) => {
        capturedSql.push(sql);
        return {
          bind: vi.fn((...values: unknown[]) => {
            capturedValues.push(values);
            return {
              run: vi.fn(async () => ({ success: true })),
              first: vi.fn(async () => null),
              all: vi.fn(async () => ({
                results: allResults,
              })),
            };
          }),
        };
      }),
      batch: vi.fn(async () => ({ success: true })),
      _capturedSql: capturedSql,
      _capturedValues: capturedValues,
    };

    return mockD1;
  }

  it("returns users who liked the current user", async () => {
    const rows = [
      {
        id: "user-b",
        username: "bob",
        first_name: "Bob",
        last_name: null,
        bio: null,
        age: 28,
        gender: "male",
        interests: JSON.stringify(["music"]),
        media_urls: "[]",
        location: "{}",
        preferences: "{}",
        is_active: 1,
        is_profile_complete: 1,
      },
    ];
    const mockD1 = createPendingLikesMockD1(rows);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.getPendingLikes({ userId: "user-a" }),
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("user-b");
    expect(result[0].displayName).toBe("Bob");
  });

  it("returns empty array when no pending likes", async () => {
    const mockD1 = createPendingLikesMockD1([]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    const result = await Effect.runPromise(
      repo.getPendingLikes({ userId: "user-a" }),
    );

    expect(result).toHaveLength(0);
  });

  it("queries with correct pending-likes filter", async () => {
    const mockD1 = createPendingLikesMockD1([]);

    const repo = new MatchRepository(mockD1 as unknown as D1Database);
    await Effect.runPromise(repo.getPendingLikes({ userId: "user-a" }));

    const sql = mockD1._capturedSql[0];
    expect(sql).toContain("m.status = 'pending'");
    expect(sql).toContain("m.user2_action = 'like'");
    expect(sql).toContain("m.user1_action = 'none'");
  });
});
