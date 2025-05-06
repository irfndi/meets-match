import type { Interaction, Profile, User } from "@/db/schema";
import * as schema from "@/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  ne,
  not,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite"; // Use bun-sqlite type
import { alias } from "drizzle-orm/sqlite-core"; // Use sqlite-core for alias
import type { InteractionService } from "./interaction_service";

// Define the type for the database instance using the specific driver type
type DrizzleDatabase = BunSQLiteDatabase<typeof schema>; // Update type alias

// --- Location Helper Functions ---

/**
 * Converts degrees to radians.
 */
function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculates the distance between two geographical points using the Haversine formula.
 *
 * @param lat1 Latitude of the first point.
 * @param lon1 Longitude of the first point.
 * @param lat2 Latitude of the second point.
 * @param lon2 Longitude of the second point.
 * @returns The distance in kilometers.
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radius of the Earth in kilometers

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const radLat1 = toRadians(lat1);
  const radLat2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(radLat1) *
      Math.cos(radLat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // Distance in km
  console.log(`Distance calculated for score: ${distance}`);
  return distance;
}

// --- End Location Helper Functions ---

// --- Scoring Helper Function ---

/**
 * Calculates a match score based on distance and age difference.
 * Lower score is better.
 *
 * @param currentUser The user seeking matches.
 * @param potentialMatch The potential match user.
 * @returns A numerical score.
 */
function calculateScore(currentUser: Profile, potentialMatch: Profile): number {
  let score = 0;
  let distance = 0;
  let ageDifference = 0;

  // Location component (ensure coordinates exist, though already checked in filter)
  if (
    currentUser.latitude !== null &&
    currentUser.longitude !== null &&
    potentialMatch.latitude !== null &&
    potentialMatch.longitude !== null
  ) {
    distance = calculateDistance(
      currentUser.latitude,
      currentUser.longitude,
      potentialMatch.latitude,
      potentialMatch.longitude
    );
    // Add distance directly to score (lower distance = lower score)
    score += distance;
  } else {
    // Handle case where location is missing, maybe assign a high penalty or log
    console.warn(
      `[Score] Location data missing for scoring pair: ${currentUser.userId} and ${potentialMatch.userId}`
    );
    score += 10000; // Assign a large penalty if location is crucial
  }

  // Age difference component (ensure ages exist)
  if (currentUser.age !== null && potentialMatch.age !== null) {
    ageDifference = Math.abs(currentUser.age - potentialMatch.age);
    // Add age difference (lower difference = lower score)
    // Weight age difference less than distance (e.g., multiply by a factor)
    score += ageDifference * 0.5;
  } else {
    // Handle case where age is missing
    console.warn(
      `[Score] Age data missing for scoring pair: ${currentUser.userId} and ${potentialMatch.userId}`
    );
    score += 50; // Assign a moderate penalty
  }

  console.log(
    `[Score] Profile ${potentialMatch.id} (User ${potentialMatch.userId}) for Seeker ${currentUser.userId}: ` +
      `Dist=${distance.toFixed(2)}, AgeDiff=${ageDifference}, ` +
      `Score=${score.toFixed(2)} (Dist + AgeDiff*0.5)`
  );
  return score;
}

// --- End Scoring Helper Function ---

/**
 * Helper function to check if a gender preference matches a specific gender.
 * @param preference The preference (Men, Women, Everyone).
 * @param gender The gender to check against (Man, Woman, NonBinary, etc.).
 * @returns True if the preference matches the gender, false otherwise.
 */
export function doesPreferenceMatchGender(
  preference: Profile["preferenceGender"],
  gender: Profile["gender"] | null
): boolean {
  // Handles null gender gracefully - preference cannot match null
  if (gender === null) {
    return false;
  }

  switch (preference) {
    case "both":
      return true; // 'both' preference matches any non-null gender
    case "male":
      return gender === "male";
    case "female":
      return gender === "female";
    default:
      console.warn(
        `[MatchPrefCheck] Encountered unexpected preference value: ${preference}`
      );
      return false; // Should not happen with schema constraints
  }
}

/**
 * Finds potential matches for the given user ID.
 * Filters based on mutual gender preference and prior interactions.
 * Scores matches based on proximity (distance, age) - lower score is better.
 *
 * @param db The Drizzle database instance.
 * @param seekerId The ID of the user seeking matches.
 * @returns A promise that resolves to an array of potential match Profiles.
 */
export async function findMatches(
  db: DrizzleDatabase, // Use the updated type alias
  seekerId: number
): Promise<MatchResult[]> {
  console.log(`[MatchingService] Finding matches for seeker ID: ${seekerId}`);

  // 1. Fetch the seeker's user and profile data
  const seekerData = await db
    .select()
    .from(schema.users)
    .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
    .where(eq(schema.users.id, seekerId))
    .limit(1);

  const currentUser = seekerData[0]?.users;
  const currentProfile = seekerData[0]?.profiles;

  if (!currentUser || !currentProfile) {
    console.error(
      `[MatchingService] Seeker user or profile not found for ID: ${seekerId}.`
    );
    return [];
  }

  console.log(`[MatchingService] Seeker ${currentUser.id} profile fetched.`);

  // Basic checks on seeker's profile
  if (currentUser.status !== "active") {
    console.log(
      `[MatchingService] Seeker ${seekerId} is not active (status: ${currentUser.status}). Cannot find matches.`
    );
    return [];
  }

  // Check required fields for matching on the seeker themselves
  if (
    !currentProfile.gender ||
    !currentProfile.preferenceGender ||
    currentProfile.age === null ||
    currentProfile.latitude === null ||
    currentProfile.longitude === null
  ) {
    console.error(
      `[MatchingService] Seeker ${seekerId}'s profile is missing required fields (gender, preference, age, location). Cannot find matches.`
    );
    return [];
  }

  // 2. Fetch IDs of users the seeker has interacted with (liked/disliked only)
  const seekerInteractions = await db
    .select()
    .from(schema.interactions)
    .where(eq(schema.interactions.actorUserId, seekerId));
  const interactedUserIds = new Set<number>(
    seekerInteractions
      .filter(
        (interaction) =>
          interaction.type === "like" || interaction.type === "dislike"
      )
      .map((interaction) => interaction.targetUserId)
  );
  console.log(
    `[MatchingService] Seeker ${seekerId} has interacted (liked/disliked) with ${interactedUserIds.size} users.`,
    Array.from(interactedUserIds)
  );

  // 3. Fetch Potential Matches with Drizzle Filters
  console.log(
    `[MatchingService] --- Fetching potential matches for seeker ${currentUser.id} ---`
  );

  // Ensure we use the schema-defined string values for filtering
  const seekerPref: "male" | "female" | "both" =
    currentProfile.preferenceGender as "male" | "female" | "both";
  const seekerGender: "male" | "female" | null = currentProfile.gender as
    | "male"
    | "female"
    | null;

  // Handle case where seeker gender is somehow null - they cannot match
  if (seekerGender === null) {
    console.warn(
      `[MatchingService] Seeker ${seekerId} has null gender, cannot find matches.`
    );
    return [];
  }

  // Build the where clause conditions
  const conditions = [
    ne(schema.users.id, seekerId), // Not the seeker themselves
    eq(schema.users.status, "active"), // User must be active
    isNotNull(schema.profiles.gender),
    isNotNull(schema.profiles.preferenceGender),
    isNotNull(schema.profiles.age),
    isNotNull(schema.profiles.latitude),
    isNotNull(schema.profiles.longitude),
    // --- Refactored Mutual Gender Preference Filter --- :
    and(
      // Condition 1: Seeker's preference matches potential match's gender
      // If seekerPref is 'both', any match gender is okay (handled by always true `sql`1=1``).
      // If seekerPref is specific, match's gender must equal it.
      seekerPref === "both" ? sql`1=1` : eq(schema.profiles.gender, seekerPref),

      // Condition 2: Potential match's preference matches seeker's gender
      // Match preference must be seeker's gender OR 'both'.
      or(
        eq(schema.profiles.preferenceGender, seekerGender),
        eq(schema.profiles.preferenceGender, "both")
      )
    ),
    // --- End Refactored Filter ---
  ];

  // Add interaction filter only if there are interacted users
  if (interactedUserIds.size > 0) {
    conditions.push(notInArray(schema.users.id, Array.from(interactedUserIds)));
  }

  // Execute the query
  const potentialMatchData = await db
    .select({
      user: schema.users,
      profile: schema.profiles,
    })
    .from(schema.users)
    .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
    .where(and(...conditions)); // Combine all conditions

  console.log(
    `[MatchingService] Found ${potentialMatchData.length} potential raw matches after DB filtering.`
  );

  // Filter out profiles that might be null due to left join issues (shouldn't happen with isNotNull checks, but safety first)
  const validPotentialMatches = potentialMatchData
    .filter((data) => data.profile !== null)
    .map((data) => data.profile as Profile); // Extract valid profiles

  if (validPotentialMatches.length === 0) {
    console.log(
      `[MatchingService] No potential matches found for user ${seekerId} after filtering.`
    );
    return [];
  }

  // 4. Calculate scores and sort
  console.log(
    `[MatchingService] Scoring ${validPotentialMatches.length} valid potential matches.`
  );
  const scoredMatches: MatchResult[] = validPotentialMatches.map(
    (matchProfile) => ({
      profile: matchProfile,
      score: calculateScore(currentProfile, matchProfile),
    })
  );

  // Sort by score ascending (lower is better)
  scoredMatches.sort((a, b) => a.score - b.score);

  // 5. Extract and Limit Results
  const finalResult = scoredMatches.slice(0, 5); // Limit to top 5

  console.log(
    `[MatchingService] Returning ${finalResult.length} best matches for user ${currentUser.id}:`,
    finalResult.map((m) => ({ userId: m.profile.userId, score: m.score })) // Log userId and score
  );
  return finalResult;
}

// Final type definition
export type MatchResult = {
  profile: Profile; // The matched user's profile
  score: number; // The calculated match score
};
