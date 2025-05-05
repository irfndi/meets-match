import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, type SQL } from 'drizzle-orm';
import * as schema from "@/db/schema";
import type { NewUser, User, NewProfile, Profile, NewInteraction, Interaction } from "@/db/schema";

/**
 * Clears all entries from the users table.
 */
export async function clearUsers(db: BetterSQLite3Database<typeof schema>): Promise<void> {
  console.log("[Test DB Util] Clearing users table...");
  await db.delete(schema.users);
}

/**
 * Clears all entries from the profiles table.
 */
export async function clearProfiles(db: BetterSQLite3Database<typeof schema>): Promise<void> {
  console.log("[Test DB Util] Clearing profiles table...");
  await db.delete(schema.profiles);
}

/**
 * Clears all entries from the interactions table.
 */
export async function clearInteractions(db: BetterSQLite3Database<typeof schema>): Promise<void> {
  console.log("[Test DB Util] Clearing interactions table...");
  await db.delete(schema.interactions);
}

/**
 * Seeds a single user into the database.
 * @param db The Drizzle database instance.
 * @param userData The user data to insert.
 * @returns The inserted user.
 */
export async function seedUser(db: BetterSQLite3Database<typeof schema>, userData: NewUser): Promise<schema.User> {
  console.log(`[Test DB Util] Seeding user ID: ${userData.id ?? '(auto-generated)'}`);
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
export async function seedProfile(db: BetterSQLite3Database<typeof schema>, profileData: NewProfile): Promise<schema.Profile> {
   console.log(`[Test DB Util] Seeding profile for user ID: ${profileData.userId}`);
  const inserted = await db.insert(schema.profiles).values(profileData).returning();
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
export async function seedInteraction(db: BetterSQLite3Database<typeof schema>, interactionData: NewInteraction): Promise<schema.Interaction> {
  console.log(`[Test DB Util] Seeding interaction: ${interactionData.actorUserId} ${interactionData.type} ${interactionData.targetUserId}`);
  const inserted = await db.insert(schema.interactions).values(interactionData).returning();
   if (!inserted || inserted.length === 0 || !inserted[0]) {
    throw new Error(`Failed to seed interaction: ${JSON.stringify(interactionData)}`);
  }
  return inserted[0];
}

/**
 * Helper to seed multiple users and profiles, ensuring profiles link to users.
 * Assumes users and profiles arrays are ordered correctly or IDs are pre-set.
 */
export async function seedTestData(db: BetterSQLite3Database<typeof schema>, usersData: NewUser[], profilesData: NewProfile[]) {
  const seededUsers: Record<number, schema.User> = {};
  for (const userData of usersData) {
      const user = await seedUser(db, userData);
      if (user.id) { // Check if ID is defined
        seededUsers[user.id] = user;
      }
  }

  for (const profileData of profilesData) {
    // Ensure profileData.userId matches a seeded user ID
    if (!seededUsers[profileData.userId]) {
        console.warn(`[Test DB Util] Warning: Profile user ID ${profileData.userId} not found in seeded users. Skipping profile.`);
        continue;
    }
    await seedProfile(db, profileData);
  }
}

export type DrizzleDatabase = BetterSQLite3Database<typeof schema>;
