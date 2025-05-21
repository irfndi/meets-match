import BetterSqlite3 from "better-sqlite3";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import * as schema from "@/db/schema";
import { Gender, GenderPreference } from "@/models/user"; // Import necessary enums from models
import { eq } from "drizzle-orm"; // Import eq separately
import { drizzle as drizzleBetterSqlite3, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate as migrateBetterSqlite3 } from "drizzle-orm/better-sqlite3/migrator";
import type { DrizzleDatabase } from "./test_db_utils"; // This type in test_db_utils.ts will also need update
import {
  clearInteractions,
  clearProfiles,
  clearUsers,
  seedInteraction,
  seedProfile,
  seedTestData,
  seedUser,
} from "./test_db_utils";

// --- Test Suite Setup ---
let sqlite: BetterSqlite3;
let db: BetterSQLite3Database<typeof schema>;

// Use an in-memory database for testing utils
beforeAll(async () => {
  sqlite = new BetterSqlite3(":memory:");
  db = drizzleBetterSqlite3(sqlite, { schema });
  // Apply migrations to set up the schema in the in-memory database
  await migrateBetterSqlite3(db, { migrationsFolder: "migrations" });
  console.log("[Test DB Utils Test] In-memory DB initialized.");
});

afterAll(() => {
  sqlite.close();
  console.log("[Test DB Utils Test] In-memory DB closed.");
});

// Clear all tables before each test in this suite
beforeEach(async () => {
  await clearInteractions(db);
  await clearProfiles(db);
  await clearUsers(db);
});

// --- Test Suite ---
describe("Test DB Utils", () => {
  const testUserData: schema.NewUser = {
    telegramId: 123456789,
    telegramUsername: "testuser",
    status: "active", // Use string literal
  };

  // --- clearUsers ---
  it("clearUsers should remove all users", async () => {
    await db.insert(schema.users).values(testUserData); // Seed one user
    let users = await db.select().from(schema.users);
    expect(users.length).toBe(1);

    await clearUsers(db);
    users = await db.select().from(schema.users);
    expect(users.length).toBe(0);
  });

  // --- clearProfiles ---
  it("clearProfiles should remove all profiles", async () => {
    // Need a user first to satisfy foreign key
    const users = await db
      .insert(schema.users)
      .values(testUserData)
      .returning();
    if (!users || users.length === 0 || !users[0]) {
      throw new Error("Failed to seed user for profile test setup");
    }
    const userId = users[0].id;
    const testProfileData: schema.NewProfile = {
      userId: userId,
      name: "Test User", // Use single 'name' field
      age: 30,
      gender: "male", // Use string literal matching schema
      bio: "Test bio",
      preferenceGender: "female", // Add missing required field
    };
    await db.insert(schema.profiles).values(testProfileData);
    let profiles = await db.select().from(schema.profiles);
    expect(profiles.length).toBe(1);

    await clearProfiles(db);
    profiles = await db.select().from(schema.profiles);
    expect(profiles.length).toBe(0);
  });

  // --- clearInteractions ---
  it("clearInteractions should remove all interactions", async () => {
    // Need two users first
    const users1 = await db
      .insert(schema.users)
      .values(testUserData)
      .returning();
    const users2 = await db
      .insert(schema.users)
      .values({ ...testUserData, telegramId: 987654321 })
      .returning();

    if (!users1?.[0]?.id || !users2?.[0]?.id) {
      // Use optional chaining and check for ID
      throw new Error("Failed to seed users for interaction test setup");
    }
    const user1Id = users1[0].id;
    const user2Id = users2[0].id;

    const testInteractionData: schema.NewInteraction = {
      actorUserId: user1Id,
      targetUserId: user2Id,
      type: "like", // Use string literal matching schema
    };
    await db.insert(schema.interactions).values(testInteractionData);
    let interactions = await db.select().from(schema.interactions);
    expect(interactions.length).toBe(1);

    await clearInteractions(db);
    interactions = await db.select().from(schema.interactions);
    expect(interactions.length).toBe(0);
  });

  // --- seedUser ---
  it("seedUser should insert a user and return it", async () => {
    const seededUser = await seedUser(db, testUserData);
    expect(seededUser).toBeDefined();
    expect(seededUser.id).toBeDefined();
    expect(seededUser.telegramId).toBe(testUserData.telegramId);
    expect(seededUser.telegramUsername).toBe(testUserData.telegramUsername);
    expect(seededUser.status).toBe(testUserData.status);

    // Verify in DB
    const users = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, seededUser.id));
    expect(users.length).toBe(1);
    expect(users[0]).toEqual(seededUser);
  });

  // --- seedProfile ---
  it("seedProfile should insert a profile and return it", async () => {
    const seededUser = await seedUser(db, testUserData);
    if (!seededUser) {
      throw new Error("Failed to seed user for profile test");
    }
    const profileData: schema.NewProfile = {
      userId: seededUser.id,
      name: "Seed Profile",
      age: 25,
      gender: "female",
      preferenceGender: "male",
      bio: "Profile bio",
    };
    const seededProfile = await seedProfile(db, profileData);
    expect(seededProfile).toBeDefined();
    expect(seededProfile.userId).toBe(seededUser.id);
    expect(seededProfile.name).toBe(profileData.name);
    expect(seededProfile.age).toBe(profileData.age);
    expect(seededProfile.gender).toBe(profileData.gender);

    // Verify it's in the DB
    const profileFromDb = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.id, seededProfile.id));
    expect(profileFromDb.length).toBe(1);
    expect(profileFromDb[0]).toEqual(seededProfile);
  });

  // --- seedInteraction ---
  it("seedInteraction should insert an interaction and return it", async () => {
    const user1 = await seedUser(db, testUserData);
    const user2 = await seedUser(db, {
      ...testUserData,
      telegramId: 987654321,
    });
    if (!user1 || !user2) {
      throw new Error("Failed to seed users for interaction test");
    }
    const interactionData: schema.NewInteraction = {
      actorUserId: user1.id,
      targetUserId: user2.id,
      type: "like",
    };
    const seededInteraction = await seedInteraction(db, interactionData);
    expect(seededInteraction).toBeDefined();
    expect(seededInteraction.actorUserId).toBe(user1.id);
    expect(seededInteraction.targetUserId).toBe(user2.id);
    expect(seededInteraction.type).toBe(interactionData.type);

    // Verify it's in the DB
    const interactionFromDb = await db
      .select()
      .from(schema.interactions)
      .where(eq(schema.interactions.id, seededInteraction.id));
    expect(interactionFromDb.length).toBe(1);
    expect(interactionFromDb[0]).toEqual(seededInteraction);
  });

  // --- seedTestData ---
  it("seedTestData should insert multiple users, profiles, and interactions", async () => {
    const count = 3;
    await seedTestData(db, count); // Call the function, assume void return

    // Assert database state
    const usersFromDb = await db.select().from(schema.users);
    const profilesFromDb = await db.select().from(schema.profiles);
    const interactionsFromDb = await db.select().from(schema.interactions);
    expect(usersFromDb).toHaveLength(count);
    expect(profilesFromDb).toHaveLength(count);
    // Check interactions based on seedTestData logic (n * (n-1))
    expect(interactionsFromDb).toHaveLength(count * (count - 1));

    // Check consistency (e.g., profile user ID matches a seeded user ID)
    const userIds = usersFromDb.map((u: schema.User) => u.id);
    expect(
      profilesFromDb.every((p: schema.Profile) => userIds.includes(p.userId))
    ).toBe(true);
  });
});
