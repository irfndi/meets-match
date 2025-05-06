import { db } from "@/db";
import {
  type Interaction,
  type NewInteraction,
  interactions,
  users,
} from "@/db/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";

/**
 * Manages user interactions like likes, dislikes, and reports.
 */
export class InteractionService {
  /**
   * Adds a new interaction between two users.
   *
   * @param actorUserId - The ID of the user performing the action.
   * @param targetUserId - The ID of the user being acted upon.
   * @param type - The type of interaction ('like', 'dislike', 'report').
   * @param reportReason - Optional reason if the type is 'report'.
   * @returns The newly created interaction object.
   * @throws Error if insertion fails.
   */
  async addInteraction(
    actorUserId: number,
    targetUserId: number,
    type: Interaction["type"],
    reportReason?: string
  ): Promise<Interaction> {
    if (actorUserId === targetUserId) {
      throw new Error("User cannot interact with themselves.");
    }

    // Optional: Check if an interaction already exists? Overwrite or ignore?
    // For now, let's assume we can add multiple (e.g., dislike then like, or report after like)
    // A unique constraint could be added later if needed.

    const newInteraction: NewInteraction = {
      actorUserId,
      targetUserId,
      type,
      reportReason: type === "report" ? reportReason : undefined,
      // createdAt will be set by the database default
    };

    console.log(
      `[InteractionService] Adding interaction: ${actorUserId} ${type} ${targetUserId}`
    );
    const result = await db
      .insert(interactions)
      .values(newInteraction)
      .returning();

    // Explicitly check if a row was returned
    if (!result || result.length === 0 || !result[0]) {
      console.error(
        `[InteractionService] Failed to add interaction or retrieve result: ${actorUserId} ${type} ${targetUserId}`
      );
      throw new Error("Failed to add interaction.");
    }

    // Now result[0] is guaranteed to exist
    console.log(`[InteractionService] Added interaction ID: ${result[0].id}`);
    return result[0];
  }

  /**
   * Retrieves all interactions initiated by a specific user, newest first.
   *
   * @param actorUserId - The ID of the user whose interactions to fetch.
   * @returns An array of interactions.
   */
  async getInteractionsByActor(actorUserId: number): Promise<Interaction[]> {
    return await db
      .select()
      .from(interactions)
      .where(eq(interactions.actorUserId, actorUserId))
      .orderBy(desc(interactions.createdAt), desc(interactions.id)); // Add secondary sort key
  }

  /**
   * Retrieves all interactions targeted at a specific user, newest first.
   *
   * @param targetUserId - The ID of the user who received the interactions.
   * @returns An array of interactions.
   */
  async getInteractionsByTarget(targetUserId: number): Promise<Interaction[]> {
    return await db
      .select()
      .from(interactions)
      .where(eq(interactions.targetUserId, targetUserId))
      .orderBy(desc(interactions.createdAt), desc(interactions.id)); // Add secondary sort key
  }

  /**
   * Retrieves the most recent interaction between two specific users.
   *
   * @param userAId - The ID of the first user.
   * @param userBId - The ID of the second user.
   * @returns The latest interaction object if found, otherwise undefined.
   */
  async getLatestInteractionBetween(
    userAId: number,
    userBId: number
  ): Promise<Interaction | undefined> {
    const results = await db
      .select()
      .from(interactions)
      .where(
        or(
          and(
            eq(interactions.actorUserId, userAId),
            eq(interactions.targetUserId, userBId)
          ),
          and(
            eq(interactions.actorUserId, userBId),
            eq(interactions.targetUserId, userAId)
          )
        )
      )
      .orderBy(desc(interactions.createdAt), desc(interactions.id)) // Add secondary sort key
      .limit(1);

    return results[0]; // Returns the first element or undefined if empty
  }

  /**
   * Checks if user A has liked user B.
   *
   * @param actorUserId - The ID of the user who potentially liked (User A).
   * @param targetUserId - The ID of the user who was potentially liked (User B).
   * @returns True if a 'like' interaction from A to B exists, false otherwise.
   */
  async hasLiked(actorUserId: number, targetUserId: number): Promise<boolean> {
    const latestInteraction = await this.getLatestInteractionBetween(
      actorUserId,
      targetUserId
    );
    // Check if the latest interaction was A liking B
    return (
      !!latestInteraction &&
      latestInteraction.actorUserId === actorUserId &&
      latestInteraction.type === "like"
    );
  }

  /**
   * Checks if user A has disliked user B.
   *
   * @param actorUserId - The ID of the user who potentially disliked (User A).
   * @param targetUserId - The ID of the user who was potentially disliked (User B).
   * @returns True if a 'dislike' interaction from A to B exists, false otherwise.
   */
  async hasDisliked(
    actorUserId: number,
    targetUserId: number
  ): Promise<boolean> {
    const latestInteraction = await this.getLatestInteractionBetween(
      actorUserId,
      targetUserId
    );
    // Check if the latest interaction was A disliking B
    return (
      !!latestInteraction &&
      latestInteraction.actorUserId === actorUserId &&
      latestInteraction.type === "dislike"
    );
  }

  /**
   * Checks if user A has interacted with (liked or disliked) user B.
   * Does not check for reports.
   *
   * @param actorUserId - The ID of the user performing the action (User A).
   * @param targetUserId - The ID of the user being acted upon (User B).
   * @returns True if a 'like' or 'dislike' interaction exists from A to B, false otherwise.
   */
  async hasInteracted(
    actorUserId: number,
    targetUserId: number
  ): Promise<boolean> {
    const result = await db
      .select({ id: interactions.id, type: interactions.type })
      .from(interactions)
      .where(
        and(
          eq(interactions.actorUserId, actorUserId),
          eq(interactions.targetUserId, targetUserId),
          or(
            // Check for like OR dislike
            eq(interactions.type, "like"),
            eq(interactions.type, "dislike")
          )
        )
      )
      .limit(1); // We only need to know if *any* such interaction exists

    return !!result[0];
  }

  /**
   * Records a 'Like' interaction.
   * @param actorUserId The ID of the user liking.
   * @param targetUserId The ID of the user being liked.
   * @returns The created interaction.
   */
  async recordLike(
    actorUserId: number,
    targetUserId: number
  ): Promise<Interaction> {
    return this.addInteraction(actorUserId, targetUserId, "like");
  }

  /**
   * Records a 'Dislike' interaction.
   * @param actorUserId The ID of the user disliking.
   * @param targetUserId The ID of the user being disliked.
   * @returns The created interaction.
   */
  async recordDislike(
    actorUserId: number,
    targetUserId: number
  ): Promise<Interaction> {
    return this.addInteraction(actorUserId, targetUserId, "dislike");
  }

  /**
   * Records a 'Report' interaction.
   * @param actorUserId The ID of the user reporting.
   * @param targetUserId The ID of the user being reported.
   * @param reason Optional reason for the report.
   * @returns The created interaction.
   */
  async recordReport(
    actorUserId: number,
    targetUserId: number,
    reason?: string
  ): Promise<Interaction> {
    return this.addInteraction(actorUserId, targetUserId, "report", reason);
  }

  // --- Test Helpers ---

  /**
   * Deletes all interactions from the database. ONLY FOR TESTING.
   */
  async __test__resetInteractions(): Promise<void> {
    console.warn("[InteractionService Test Helper] Deleting all interactions.");
    await db.delete(interactions);
    // Removed problematic attempt to reset sqlite_sequence
  }

  /**
   * Gets all interactions directly from the database. ONLY FOR TESTING.
   */
  async __test__getInteractions(): Promise<Interaction[]> {
    console.warn("[InteractionService Test Helper] Getting all interactions.");
    return db.select().from(interactions);
  }
}
