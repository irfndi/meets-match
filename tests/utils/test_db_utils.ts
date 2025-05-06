import * as schema from "@/db/schema";
import type {
  Interaction,
  NewInteraction,
  NewProfile,
  NewUser,
  Profile,
  User,
} from "@/db/schema";
import { type SQL, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

/**
 * Clears all entries from the users table.
 */
export async function clearUsers(
  db: BunSQLiteDatabase<typeof schema>
): Promise<void> {
  console.log("[Test DB Util] Clearing users table...");
  await db.delete(schema.users);
}

/**
 * Clears all entries from the profiles table.
 */
export async function clearProfiles(
  db: BunSQLiteDatabase<typeof schema>
): Promise<void> {
  console.log("[Test DB Util] Clearing profiles table...");
  await db.delete(schema.profiles);
}

/**
 * Clears all entries from the interactions table.
 */
export async function clearInteractions(
  db: BunSQLiteDatabase<typeof schema>
): Promise<void> {
  console.log("[Test DB Util] Clearing interactions table...");
  await db.delete(schema.interactions);
}

/**
 * Seeds a single user into the database.
 * @param db The Drizzle database instance.
 * @param userData The user data to insert.
 * @returns The inserted user.
 */
export async function seedUser(
  db: BunSQLiteDatabase<typeof schema>,
  userData: NewUser
): Promise<schema.User> {
  console.log(
    `[Test DB Util] Seeding user ID: ${userData.id ?? "(auto-generated)"}`
  );
  const inserted = await db.insert(schema.users).values(userData).returning();
  if (!inserted || inserted.length === 0 || !inserted[0]) {
    throw new Error(`Failed to seed user: ${JSON.stringify(userData)}`);
  }
  return inserted[0];
}

/**
 * Seeds a single profile into the database.
 * @param db The Drizzle database instance.
 * @param profileData The profile data to insert.
 * @returns The inserted profile.
 */
export async function seedProfile(
  db: BunSQLiteDatabase<typeof schema>,
  profileData: NewProfile
): Promise<schema.Profile> {
  console.log(
    `[Test DB Util] Seeding profile for user ID: ${profileData.userId}`
  );
  const inserted = await db
    .insert(schema.profiles)
    .values(profileData)
    .returning();
  if (!inserted || inserted.length === 0 || !inserted[0]) {
    throw new Error(`Failed to seed profile: ${JSON.stringify(profileData)}`);
  }
  return inserted[0];
}

/**
 * Seeds a single interaction into the database.
 * @param db The Drizzle database instance.
 * @param interactionData The interaction data to insert.
 * @returns The inserted interaction.
 */
export async function seedInteraction(
  db: BunSQLiteDatabase<typeof schema>,
  interactionData: NewInteraction
): Promise<schema.Interaction> {
  console.log(
    `[Test DB Util] Seeding interaction: ${interactionData.actorUserId} like ${interactionData.targetUserId}`
  );
  const inserted = await db
    .insert(schema.interactions)
    .values(interactionData)
    .returning();
  if (!inserted || inserted.length === 0 || !inserted[0]) {
    throw new Error(
      `Failed to seed interaction: ${JSON.stringify(interactionData)}`
    );
  }
  return inserted[0];
}

/**
 * Helper to seed multiple users and profiles, ensuring profiles link to users.
 * Assumes users and profiles arrays are ordered correctly or IDs are pre-set.
 */
export async function seedTestData(
  db: BunSQLiteDatabase<typeof schema>,
  count: number
) {
  const seededUsers: schema.User[] = [];
  const seededProfiles: schema.Profile[] = [];
  const seededInteractions: schema.Interaction[] = [];

  // Seed Users and Profiles
  for (let i = 0; i < count; i++) {
    const userData: schema.NewUser = {
      telegramId: 100000000 + i, // Ensure unique telegram IDs
      telegramUsername: `testuser${i}`,
      status: "active",
    };
    const user = await seedUser(db, userData);
    if (!user?.id) {
      console.error(
        "[Test DB Util] Failed to seed user, skipping subsequent operations for this user."
      );
      continue;
    }
    seededUsers.push(user);

    const profileData: schema.NewProfile = {
      userId: user.id,
      name: `Test User ${i}`,
      age: 20 + i,
      gender: i % 2 === 0 ? "male" : "female",
      preferenceGender: i % 2 !== 0 ? "male" : "female",
      bio: `Bio for user ${i}`,
    };
    const profile = await seedProfile(db, profileData);
    if (profile) {
      seededProfiles.push(profile);
    }
  }

  // Seed Interactions (e.g., everyone likes everyone else)
  for (let i = 0; i < seededUsers.length; i++) {
    const actorUser = seededUsers[i];
    if (!actorUser?.id) continue; // Skip if actor user ID is missing

    for (let j = 0; j < seededUsers.length; j++) {
      if (i === j) continue; // Users don't interact with themselves
      const targetUser = seededUsers[j];
      if (!targetUser?.id) continue; // Skip if target user ID is missing

      const interactionData: schema.NewInteraction = {
        actorUserId: actorUser.id,
        targetUserId: targetUser.id,
        type: "like",
      };
      const interaction = await seedInteraction(db, interactionData);
      if (interaction) {
        seededInteractions.push(interaction);
      }
    }
  }

  // Return the seeded data (optional, as test is not using it)
  // return { users: seededUsers, profiles: seededProfiles, interactions: seededInteractions };
}

export type DrizzleDatabase = BunSQLiteDatabase<typeof schema>;
