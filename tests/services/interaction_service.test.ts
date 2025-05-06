import { closeDbConnection, db } from "@/db";
import {
  type Interaction,
  type NewProfile,
  type NewUser,
  type Profile,
  type User,
  profiles,
  users,
} from "@/db/schema";
import { InteractionService } from "@/services/interaction_service";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";

// Helper function to quickly create users and profiles for testing
// Note: In a real app, this would likely be part of a UserService/ProfileService
async function createTestUser(
  userData: Partial<NewUser> = {},
  profileData: Partial<NewProfile> = {}
): Promise<{ user: User; profile: Profile }> {
  const defaultUser: NewUser = {
    telegramId: Math.floor(Math.random() * 1000000), // Ensure unique telegramId for tests
    telegramUsername: `testuser_${Date.now()}`,
    status: "active",
    ...userData,
  };
  const insertedUser = await db.insert(users).values(defaultUser).returning();
  if (!insertedUser[0]) throw new Error("Failed to create test user.");
  const user = insertedUser[0];

  const defaultProfile: NewProfile = {
    userId: user.id,
    name: "Test User Name",
    gender: "male",
    preferenceGender: "female",
    age: 30,
    ...profileData,
  };
  const insertedProfile = await db
    .insert(profiles)
    .values(defaultProfile)
    .returning();
  if (!insertedProfile[0]) throw new Error("Failed to create test profile.");

  return { user, profile: insertedProfile[0] };
}

describe("Interaction Service (Integration)", () => {
  let interactionService: InteractionService;
  let user1: User;
  let user2: User;
  let user3: User;

  // Setup users once before all tests in this describe block
  beforeAll(async () => {
    // Ensure a clean slate before starting tests in this file
    // Note: Depending on test runner order, other tests might have left data.
    // A more robust global setup might be needed for full isolation if tests interfere.
    await db.delete(users); // Clear users (and profiles via cascade) just once

    // Create test users needed for the suite
    user1 = (await createTestUser({ telegramId: 101 })).user;
    user2 = (await createTestUser({ telegramId: 102 })).user;
    user3 = (await createTestUser({ telegramId: 103 })).user;

    interactionService = new InteractionService(); // Initialize service once if stateless
  });

  beforeEach(async () => {
    // interactionService = new InteractionService(); // Initialize here if service has state
    // Reset interactions before each test for isolation
    await interactionService.__test__resetInteractions();
    // DO NOT delete users here anymore
    // await db.delete(users);

    // Users are already created in beforeAll
    // user1 = (await createTestUser({ telegramId: 101 })).user;
    // user2 = (await createTestUser({ telegramId: 102 })).user;
    // user3 = (await createTestUser({ telegramId: 103 })).user;
  });

  afterAll(async () => {
    // Optional: Clean up users created by this test suite
    // await db.delete(users).where(inArray(users.id, [user1.id, user2.id, user3.id]));

    // Close the database connection after all tests in this file run
    // Ensure this doesn't conflict if other test files need the connection
    // Consider moving connection closing to a global teardown
    // await closeDbConnection(); // Commenting out for now, let global handle it if needed
  });

  test("should add a new interaction", async () => {
    const type = "like";
    const interaction = await interactionService.addInteraction(
      user1.id,
      user2.id,
      type
    );

    expect(interaction).toBeDefined();
    expect(interaction.id).toBeTypeOf("number");
    expect(interaction.actorUserId).toBe(user1.id);
    expect(interaction.targetUserId).toBe(user2.id);
    expect(interaction.type).toBe(type);
    expect(interaction.reportReason).toBeNull();
    expect(interaction.createdAt).toBeInstanceOf(Date);

    const storedInteractions =
      await interactionService.__test__getInteractions();
    expect(storedInteractions).toHaveLength(1);
    expect(storedInteractions[0]).toEqual(interaction);
  });

  test("should add a report interaction with reason", async () => {
    const type = "report";
    const reason = "Inappropriate profile picture";
    const interaction = await interactionService.addInteraction(
      user1.id,
      user2.id,
      type,
      reason
    );

    expect(interaction).toBeDefined();
    expect(interaction.actorUserId).toBe(user1.id);
    expect(interaction.targetUserId).toBe(user2.id);
    expect(interaction.type).toBe(type);
    expect(interaction.reportReason).toBe(reason);
  });

  test("should throw error when adding interaction for same user", async () => {
    await expect(
      interactionService.addInteraction(user1.id, user1.id, "like")
    ).rejects.toThrow("User cannot interact with themselves.");
  });

  test("should record a like interaction", async () => {
    const interaction = await interactionService.recordLike(user1.id, user2.id);
    expect(interaction).toBeDefined();
    expect(interaction.type).toBe("like");
    expect(interaction.actorUserId).toBe(user1.id);
    expect(interaction.targetUserId).toBe(user2.id);
  });

  test("should record a dislike interaction", async () => {
    const interaction = await interactionService.recordDislike(
      user1.id,
      user2.id
    );
    expect(interaction).toBeDefined();
    expect(interaction.type).toBe("dislike");
    expect(interaction.actorUserId).toBe(user1.id);
    expect(interaction.targetUserId).toBe(user2.id);
  });

  test("should record a report interaction", async () => {
    const reason = "Spam account";
    const interaction = await interactionService.recordReport(
      user1.id,
      user2.id,
      reason
    );
    expect(interaction).toBeDefined();
    expect(interaction.type).toBe("report");
    expect(interaction.reportReason).toBe(reason);
    expect(interaction.actorUserId).toBe(user1.id);
    expect(interaction.targetUserId).toBe(user2.id);
  });

  test("should get interactions initiated by actor", async () => {
    await interactionService.recordLike(user1.id, user2.id);
    await interactionService.recordDislike(user1.id, user3.id);
    await interactionService.recordLike(user2.id, user1.id); // Interaction by another user

    const interactions = await interactionService.getInteractionsByActor(
      user1.id
    );

    expect(interactions).toHaveLength(2);
    // Interactions should be newest first
    expect(interactions[0]?.targetUserId).toBe(user3.id);
    expect(interactions[0]?.type).toBe("dislike");
    expect(interactions[1]?.targetUserId).toBe(user2.id);
    expect(interactions[1]?.type).toBe("like");
  });

  test("should return empty array if no interactions found for actor", async () => {
    const interactions = await interactionService.getInteractionsByActor(
      user1.id
    );
    expect(interactions).toEqual([]);
  });

  test("should get interactions targeted at user", async () => {
    await interactionService.recordLike(user1.id, user3.id);
    await interactionService.recordDislike(user2.id, user3.id);
    await interactionService.recordLike(user3.id, user1.id); // Interaction targeting another user

    const interactions = await interactionService.getInteractionsByTarget(
      user3.id
    );

    expect(interactions).toHaveLength(2);
    // Interactions should be newest first
    expect(interactions[0]?.actorUserId).toBe(user2.id);
    expect(interactions[0]?.type).toBe("dislike");
    expect(interactions[1]?.actorUserId).toBe(user1.id);
    expect(interactions[1]?.type).toBe("like");
  });

  test("should get the latest interaction between two users", async () => {
    await interactionService.recordLike(user1.id, user2.id); // Earlier
    await new Promise((resolve) => setTimeout(resolve, 10)); // Ensure timestamp difference
    await interactionService.recordDislike(user2.id, user1.id); // Later
    await new Promise((resolve) => setTimeout(resolve, 10));
    const latest = await interactionService.recordLike(user1.id, user2.id); // Latest

    const found = await interactionService.getLatestInteractionBetween(
      user1.id,
      user2.id
    );
    expect(found).toBeDefined();
    expect(found?.id).toBe(latest.id);
    expect(found?.type).toBe("like");

    const foundReverse = await interactionService.getLatestInteractionBetween(
      user2.id,
      user1.id
    );
    expect(foundReverse).toBeDefined();
    expect(foundReverse?.id).toBe(latest.id);
  });

  test("should return undefined if no interaction exists between two users", async () => {
    const found = await interactionService.getLatestInteractionBetween(
      user1.id,
      user2.id
    );
    expect(found).toBeUndefined();
  });

  test("hasLiked should return true if A liked B", async () => {
    await interactionService.recordLike(user1.id, user2.id);
    // The latest interaction is user2 disliking user1, so hasLiked(user1, user2) should be false.
    await interactionService.recordDislike(user2.id, user1.id);

    expect(await interactionService.hasLiked(user1.id, user2.id)).toBeFalsy();
  });

  test("hasLiked should return false if A disliked B or B liked A", async () => {
    await interactionService.recordDislike(user1.id, user2.id);
    expect(await interactionService.hasLiked(user1.id, user2.id)).toBeFalsy();

    await interactionService.__test__resetInteractions();
    await interactionService.recordLike(user2.id, user1.id); // B likes A
    expect(await interactionService.hasLiked(user1.id, user2.id)).toBeFalsy(); // A has not liked B
  });

  test("hasLiked should consider the latest interaction", async () => {
    await interactionService.recordLike(user1.id, user2.id);
    await new Promise((resolve) => setTimeout(resolve, 10)); // Wait briefly to ensure timestamp difference
    await interactionService.recordDislike(user1.id, user2.id); // A dislikes B later
    expect(await interactionService.hasLiked(user1.id, user2.id)).toBeFalsy();
  });

  test("hasDisliked should return true if A disliked B", async () => {
    await interactionService.recordDislike(user1.id, user2.id);
    // The latest interaction is user2 liking user1, so hasDisliked(user1, user2) should be false.
    await interactionService.recordLike(user2.id, user1.id);

    expect(
      await interactionService.hasDisliked(user1.id, user2.id)
    ).toBeFalsy();
  });

  test("hasDisliked should return false if A liked B or B disliked A", async () => {
    await interactionService.recordLike(user1.id, user2.id);
    expect(
      await interactionService.hasDisliked(user1.id, user2.id)
    ).toBeFalsy();

    await interactionService.__test__resetInteractions();
    await interactionService.recordDislike(user2.id, user1.id); // B dislikes A
    expect(
      await interactionService.hasDisliked(user1.id, user2.id)
    ).toBeFalsy(); // A has not disliked B
  });

  test("hasDisliked should consider the latest interaction", async () => {
    await interactionService.recordDislike(user1.id, user2.id);
    await new Promise((resolve) => setTimeout(resolve, 10)); // Wait briefly to ensure timestamp difference
    await interactionService.recordLike(user1.id, user2.id); // A likes B later
    expect(
      await interactionService.hasDisliked(user1.id, user2.id)
    ).toBeFalsy();
  });

  test("hasInteracted should return true if A liked B", async () => {
    await interactionService.recordLike(user1.id, user2.id);
    expect(
      await interactionService.hasInteracted(user1.id, user2.id)
    ).toBeTruthy();
  });

  test("hasInteracted should return true if A disliked B", async () => {
    await interactionService.recordDislike(user1.id, user2.id);
    expect(
      await interactionService.hasInteracted(user1.id, user2.id)
    ).toBeTruthy();
  });

  test("hasInteracted should return false if B interacted with A, but not A with B", async () => {
    await interactionService.recordLike(user2.id, user1.id);
    expect(
      await interactionService.hasInteracted(user1.id, user2.id)
    ).toBeFalsy();
  });

  test("hasInteracted should return false if A reported B", async () => {
    await interactionService.recordReport(user1.id, user2.id);
    expect(
      await interactionService.hasInteracted(user1.id, user2.id)
    ).toBeFalsy();
  });

  test("hasInteracted should return false if no interaction exists", async () => {
    expect(
      await interactionService.hasInteracted(user1.id, user2.id)
    ).toBeFalsy();
  });
});
