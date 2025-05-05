import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { findMatches } from "@/services/matching_service";
import { InteractionService } from "@/services/interaction_service";
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from "@/db/schema";
import type { Profile, User, NewUser, NewProfile, Interaction } from "@/db/schema";
import { clearUsers, clearProfiles, clearInteractions, seedUser, seedProfile, type DrizzleDatabase } from "../utils/test_db_utils"; // Use imported seed functions

let db: DrizzleDatabase;
let interactionService: InteractionService;
let sqlite: Database.Database;

// Mock the InteractionService
vi.mock("@/services/interaction_service");

describe("Matching Service Integration Tests", () => {

  beforeEach(async () => {
    console.log("[DB] Initializing in-memory SQLite for test...");
    try {
      // Create a new in-memory SQLite database instance for each test
      sqlite = new Database(':memory:');
      db = drizzle(sqlite, { schema });

      console.log("[DB] Running migrations on in-memory DB...");
      await migrate(db, { migrationsFolder: "migrations" }); // Use 'migrations' folder

    } catch (error) {
      console.error("Failed setup for in-memory SQLite:", error);
      throw new Error(`Test DB setup failed. Error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Clearing is not strictly necessary as :memory: DB is fresh each time,
    // but keep for structure/potential future file-based test DBs.
    console.log("[MatchingService Test] Clearing tables...");
    await clearInteractions(db);
    await clearProfiles(db);
    await clearUsers(db);

    // Setup InteractionService mock (or a real instance if needed)
    interactionService = new InteractionService(); // Note: This uses an in-memory store based on MEMORY[cb2ac13e]
    vi.mocked(interactionService.getInteractionsByActor).mockResolvedValue([]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    // Close the in-memory database connection after each test
    if (sqlite) {
      sqlite.close();
    }
  });

  it("should return an empty array if seeker has no profile", async () => {
    const seekerId = 1;
    await seedUser(db, { id: seekerId, telegramId: 123, status: 'active', createdAt: new Date(), updatedAt: new Date() }); 

    const matches = await findMatches(db, interactionService, seekerId);

    expect(matches).toHaveLength(0);
  });

  it("should return an empty array if the seeker status is not active", async () => {
    const seekerId = 1;
    // Seed user with inactive status
    const seekerUserData: NewUser = { id: seekerId, telegramId: 456, status: 'inactive', createdAt: new Date(), updatedAt: new Date() };
    // Seed a *complete* profile for this inactive user
    const completeProfileData: NewProfile = {
      userId: seekerId,
      name: "Seeker",
      gender: "male", // Provide valid data
      preferenceGender: "both", // Provide valid data
      age: 30, // Add required age
      latitude: 0, longitude: 0,
      bio: "Test description",
      createdAt: new Date(), updatedAt: new Date()
    };

    await seedUser(db, seekerUserData);
    await seedProfile(db, completeProfileData);

    const matches = await findMatches(db, interactionService, seekerId);

    expect(matches).toHaveLength(0);
  });

  it("should return an empty array if the seeker status is not active", async () => {
    const seekerId = 2;
    const inactiveUserData: NewUser = { id: seekerId, telegramId: 789, status: 'inactive', createdAt: new Date(), updatedAt: new Date() };
    const completeProfileData: NewProfile = { userId: seekerId,
      name: "Inactive Seeker",
      gender: schema.profiles.gender.enumValues[1],
      preferenceGender: schema.profiles.preferenceGender.enumValues[0],
      age: 30,
      latitude: 10, longitude: 10,
      bio: "Inactive profile",
      createdAt: new Date(), updatedAt: new Date() };

    await seedUser(db, inactiveUserData);
    await seedProfile(db, completeProfileData);

    const matches = await findMatches(
      db,
      interactionService,
      seekerId
    );

    expect(matches).toHaveLength(0);
  });

  it("should find potential matches based on gender preference", async () => {
    const seekerId = 1;
    const potentialMatchId = 2;

    const seekerUser: NewUser = { id: seekerId, telegramId: 111, status: 'active', createdAt: new Date(), updatedAt: new Date() };
    const seekerProfile: NewProfile = { userId: seekerId, name: "Seeker W", gender: 'female', preferenceGender: 'male', age: 25, latitude: 0, longitude: 0, bio: "Desc", createdAt: new Date(), updatedAt: new Date() };

    const matchUser: NewUser = { id: potentialMatchId, telegramId: 222, status: 'active', createdAt: new Date(), updatedAt: new Date() };
    const matchProfile: NewProfile = { userId: potentialMatchId, name: "Match M", gender: 'male', preferenceGender: 'female', age: 28, latitude: 0.1, longitude: 0.1, bio: "Desc", createdAt: new Date(), updatedAt: new Date() };

    const otherUser: NewUser = { id: 3, telegramId: 333, status: 'active', createdAt: new Date(), updatedAt: new Date() };
    const otherProfile: NewProfile = { userId: 3, name: "Other W", gender: 'female', preferenceGender: 'female', age: 27, latitude: 1, longitude: 1, bio: "Desc", createdAt: new Date(), updatedAt: new Date() };

    await seedUser(db, seekerUser);
    await seedProfile(db, seekerProfile);
    await seedUser(db, matchUser);
    await seedProfile(db, matchProfile);
    await seedUser(db, otherUser);
    await seedProfile(db, otherProfile);

    const matches = await findMatches(
      db,
      interactionService,
      seekerId
    );

    expect(matches).toBeDefined();
    if (matches.length > 0) {
      expect(matches[0]?.profile.userId).toBe(potentialMatchId); 
      expect(matches[0]?.score).toBeDefined();
    } else {
      throw new Error("Expected matches not found");
    }
    expect(matches.some((m) => m.profile.userId === otherUser.id)).toBe(false);
  });

  it("should exclude candidates the seeker has already interacted with (liked/disliked)", async () => {
    const seekerId = 10;
    const candidateId = 11;
    const candidateId2 = 12;
    const likedCandidateId = 13;

    await seedUser(db, { id: seekerId, telegramId: 1010, status: 'active', createdAt: new Date(), updatedAt: new Date() });
    await seedProfile(db, { userId: seekerId, name: "Seeker Ten", gender: 'male', preferenceGender: 'female', age: 30, latitude: 1.0, longitude: 1.0, bio: "Seeker bio", city: "Test City", country: "Test Country", createdAt: new Date(), updatedAt: new Date() });

    await seedUser(db, { id: candidateId, telegramId: 1111, status: 'active', createdAt: new Date(), updatedAt: new Date() });
    await seedProfile(db, { userId: candidateId, name: "Candidate Eleven", gender: 'female', preferenceGender: 'male', age: 28, latitude: 1.1, longitude: 1.1, bio: "Candidate bio", city: "Test City", country: "Test Country", createdAt: new Date(), updatedAt: new Date() });

    await seedUser(db, { id: candidateId2, telegramId: 1212, status: 'active', createdAt: new Date(), updatedAt: new Date() });
    await seedProfile(db, { userId: candidateId2, name: "Candidate Twelve", gender: 'female', preferenceGender: 'male', age: 32, latitude: 1.2, longitude: 1.2, bio: "Candidate 2 bio", city: "Test City", country: "Test Country", createdAt: new Date(), updatedAt: new Date() });

    await seedUser(db, { id: likedCandidateId, telegramId: 1313, status: 'active', createdAt: new Date(), updatedAt: new Date() });
    await seedProfile(db, { userId: likedCandidateId, name: "Candidate Thirteen", gender: 'female', preferenceGender: 'male', age: 29, latitude: 0.9, longitude: 0.9, bio: "Liked Candidate bio", city: "Test City", country: "Test Country", createdAt: new Date(), updatedAt: new Date() });

    vi.mocked(interactionService.getInteractionsByActor).mockResolvedValue([
      { id: 1, actorUserId: seekerId, targetUserId: likedCandidateId, type: 'like', reportReason: null, createdAt: new Date() }
    ]);

    const matches = await findMatches(db, interactionService, seekerId);

    expect(matches).toBeDefined();
    expect(matches).toHaveLength(2); 

    if (matches[0]) {
      expect(matches[0].profile.userId).toBe(candidateId);
      expect(matches[0].profile.name).toBe("Candidate Eleven");
    } else {
      throw new Error("Expected first match (Candidate 11) not found");
    }
    if (matches[1]) {
      expect(matches[1].profile.userId).toBe(candidateId2);
      expect(matches[1].profile.name).toBe("Candidate Twelve");
    } else {
      throw new Error("Expected second match (Candidate 12) not found");
    }

    expect(matches.some((m) => m.profile.userId === likedCandidateId)).toBe(false);
  });

  // Add more tests: different gender preferences, locations, ages, existing interactions etc.
});
