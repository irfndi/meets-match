import type {
  User,
  UserPreferences,
  UserUpdate,
  UserUpdateResult,
  ValidationErrors,
} from "../models/user";
import { defaultPreferences } from "../models/user"; // Import value separately
import {
  Gender, // Import enum
  GenderPreference, // Import enum
  MAX_AGE,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MIN_AGE,
  MIN_DESCRIPTION_LENGTH, // Import constant
  MIN_NAME_LENGTH, // Import constant
} from "../models/user";

// --- Constants for Validation ---
// Removed MIN_NAME_LENGTH constant

// In-memory store for users (replace with actual DB later)
export const users: Map<number, User> = new Map();

// Export the map directly ONLY for testing reset purposes
// In a real app, avoid exporting mutable state like this.
export const __test__resetUsers = () => {
  console.log("[UserService] Resetting in-memory user store for test.");
  users.clear();
};

/**
 * Retrieves a user by their Telegram ID.
 *
 * @param userId The Telegram user ID.
 * @returns The user object or null if not found.
 */
export async function getUserById(userId: number): Promise<User | null> {
  console.log(`[UserService] Attempting to get user: ${userId}`);
  const user = users.get(userId);
  return user ? { ...user } : null; // Return a copy to prevent mutation
}

/**
 * Creates a new user or retrieves an existing one.
 * Initializes with default preferences if creating.
 *
 * @param userId The Telegram user ID.
 * @param username Optional Telegram username.
 * @returns The created or existing user object.
 */
export async function findOrCreateUser(
  userId: number,
  username?: string
): Promise<User> {
  // Use const since 'user' is not reassigned in this primary scope
  const user = await getUserById(userId);
  if (user) {
    console.log(`[UserService] Found existing user: ${userId}`);
    // Optionally update username if it changed or wasn't set
    if (username && user.telegram_username !== username) {
      // Create a mutable copy for modification
      const mutableUser = { ...user };
      mutableUser.telegram_username = username;
      mutableUser.updated_at = new Date();
      users.set(userId, mutableUser); // Save updated user
      console.log(`[UserService] Updated username for user: ${userId}`);
      return mutableUser; // Return the modified copy
    }
    // Fetch again directly from the map before returning to ensure latest state
    const latestUser = await getUserById(userId);
    // Should not be null here as we found 'user' just before, but check defensively
    return latestUser ?? user; // Return latest, fallback to initial 'user' if somehow null
  }

  console.log(`[UserService] Creating new user: ${userId}`);
  const now = new Date();
  const newUser: User = {
    id: userId,
    telegram_username: username ?? null,
    name: null,
    age: null,
    gender: null,
    description: null, // Initialize description
    latitude: null,
    longitude: null,
    preferences: { ...defaultPreferences }, // Initialize with defaults
    created_at: now,
    updated_at: now,
    is_active: true,
    is_banned: false,
    is_complete: false,
  };

  users.set(userId, { ...newUser });
  return { ...newUser }; // Return a copy
}

/**
 * Validates a user update object.
 * @param updates The partial user data to validate.
 * @returns A dictionary of validation errors, empty if valid.
 */
export function validateUserUpdate(updates: UserUpdate): {
  valid: boolean;
  errors: ValidationErrors;
} {
  const errors: ValidationErrors = {};
  console.log(
    "[validateUserUpdate] Validating updates:",
    JSON.stringify(updates, null, 2)
  );

  if (updates.name !== undefined && updates.name !== null) {
    console.log("[validateUserUpdate] Validating name:", updates.name);
    if (
      typeof updates.name !== "string" ||
      updates.name.length < MIN_NAME_LENGTH
    ) {
      errors.name = `Name must be a string with at least ${MIN_NAME_LENGTH} characters.`;
      console.log("[validateUserUpdate] Name validation FAILED.");
    } else if (updates.name.length > MAX_NAME_LENGTH) {
      errors.name = `Name must be at most ${MAX_NAME_LENGTH} characters.`;
      console.log("[validateUserUpdate] Name validation FAILED.");
    }
  }

  if (updates.age !== undefined && updates.age !== null) {
    console.log("[validateUserUpdate] Validating age:", updates.age);
    if (typeof updates.age !== "number" || !Number.isInteger(updates.age)) {
      errors.age = "Age must be an integer.";
    } else if (updates.age < MIN_AGE) {
      errors.age = `Age must be at least ${MIN_AGE}.`;
    } else if (updates.age > MAX_AGE) {
      errors.age = `Age must be at most ${MAX_AGE}.`;
    }
  }

  if (updates.gender !== undefined && updates.gender !== null) {
    console.log("[validateUserUpdate] Validating gender:", updates.gender);
    // Ensure updates.gender is treated as Gender type for the check
    if (!Object.values(Gender).includes(updates.gender)) {
      // Use imported Gender enum
      errors.gender = `Invalid gender specified. Allowed: ${Object.values(Gender).join(", ")}.`;
      console.log("[validateUserUpdate] Gender validation FAILED.");
    }
  }

  if (updates.description !== undefined && updates.description !== null) {
    console.log(
      "[validateUserUpdate] Validating description:",
      updates.description
    );
    if (
      typeof updates.description !== "string" ||
      updates.description.length < MIN_DESCRIPTION_LENGTH
    ) {
      // Use imported MIN_DESCRIPTION_LENGTH
      errors.description = `Description must be a string with at least ${MIN_DESCRIPTION_LENGTH} characters.`; // Use imported MIN_DESCRIPTION_LENGTH
      console.log("[validateUserUpdate] Description validation FAILED.");
    } else if (updates.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.description = `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`;
      console.log("[validateUserUpdate] Description validation FAILED.");
    }
  }

  // Check preferences only if the preferences object itself exists
  if (
    updates.preferences &&
    updates.preferences.gender_preference !== undefined &&
    updates.preferences.gender_preference !== null
  ) {
    console.log(
      "[validateUserUpdate] Validating preferences:",
      JSON.stringify(updates.preferences)
    );
    console.log(
      "[validateUserUpdate] Validating gender_preference:",
      updates.preferences.gender_preference
    );
    if (
      !Object.values(GenderPreference).includes(
        updates.preferences.gender_preference
      )
    ) {
      // Use imported GenderPreference enum
      if (!errors.preferences || typeof errors.preferences !== "object") {
        errors.preferences = {}; // Initialize nested error object if needed or if it's not an object
      }
      // Ensure nested preference error is typed correctly
      (errors.preferences as ValidationErrors).gender_preference =
        `Invalid gender preference specified. Allowed: ${Object.values(GenderPreference).join(", ")}.`; // Use imported GenderPreference enum
      console.log("[validateUserUpdate] Gender Preference validation FAILED.");
    }
  }

  console.log(
    "[validateUserUpdate] Validation complete. Errors:",
    JSON.stringify(errors)
  );

  const valid = Object.keys(errors).length === 0;
  return { valid, errors };
}

/**
 * Updates specific fields of a user after validation.
 * NOTE: This function previously contained inline validation, which has been moved
 *       to `validateUserUpdate`.
 *
 * @param userId The Telegram user ID.
 * @param updates A validated partial object containing the fields to update.
 * @returns An object containing the updated user or null, and any validation errors.
 */
export async function updateUser(
  userId: number,
  updates: UserUpdate
): Promise<UserUpdateResult> {
  const currentUser = await getUserById(userId);
  if (!currentUser) {
    console.error(
      `[UserService] Attempted to update non-existent user: ${userId}`
    );
    return { success: false, errors: { general: "User not found" } };
  }

  // Validate first
  const validationErrors = validateUserUpdate(updates);
  if (!validationErrors.valid) {
    console.error(
      `[UserService] Update validation failed for user ${userId}:`,
      validationErrors.errors
    );
    // Ensure the return type matches the UserUpdateResult failure case
    return { success: false, errors: validationErrors.errors };
  }

  // Spread existing user first
  let updatedUser: User = { ...currentUser }; // Start with a copy

  // Separate preferences from other updates
  const { preferences: preferencesUpdate, ...otherUpdates } = updates;

  // Apply other updates by spreading
  updatedUser = { ...updatedUser, ...otherUpdates };

  // Merge preferences if they exist in the update, ensuring preferences object exists
  if (preferencesUpdate) {
    updatedUser.preferences = {
      ...(updatedUser.preferences ?? defaultPreferences), // Use defaults if null
      ...preferencesUpdate,
    };
  }

  // Recalculate completion status based on the *final* updatedUser state
  updatedUser.is_complete = await isProfileComplete(updatedUser);
  console.log(
    `[UserService] Profile complete status for user ${userId}: ${updatedUser.is_complete}`
  );

  // Explicitly update the timestamp
  updatedUser.updated_at = new Date();

  users.set(userId, { ...updatedUser }); // Store a copy of the updated user
  console.log(`[UserService] User ${userId} updated successfully.`);
  return { success: true, user: updatedUser }; // Return the updated copy
}

/**
 * Updates the Telegram username for a given user.
 *
 * @param userId The ID of the user to update.
 * @param username The new Telegram username.
 * @returns The updated user object or null if the user was not found.
 */
export async function updateTelegramUsername(
  userId: number,
  username: string | undefined
): Promise<User | null> {
  const user = users.get(userId); // Get the current user object
  if (user) {
    // Create a new object with the updated username and timestamp
    const updatedUser = {
      ...user, // Copy existing properties
      telegram_username: username, // Set the new username (or undefined)
      updated_at: new Date() // Set the new timestamp
    };
    users.set(userId, updatedUser); // Explicitly set the updated object back into the map
    console.log(`[UserService] Updated username for user: ${userId}`);
    return { ...updatedUser }; // Return a copy
  }
  // Fetch again directly from the map before returning to ensure latest state
  console.error(`[UserService] User not found for username update: ${userId}`);
  return null; // User not found
}

/**
 * Updates user preferences.
 *
 * @param userId The Telegram user ID.
 * @param prefUpdates Partial preferences object.
 * @returns The updated user object or null if user/preferences don't exist.
 */
export async function updatePreferences(
  userId: number,
  prefUpdates: Partial<UserPreferences>
): Promise<User | null> {
  const user = await getUserById(userId); // Use getUserById
  if (!user) {
    console.error(
      `[UserService] User not found for preference update: ${userId}`
    );
    return null;
  }

  console.log(
    `[UserService] Updating preferences for user: ${userId} with`,
    prefUpdates
  );

  // --- Validation & Filtering ---
  const validPrefUpdates: Partial<UserPreferences> = {};

  if (prefUpdates.gender_preference !== undefined) {
    if (
      Object.values(GenderPreference).includes(prefUpdates.gender_preference)
    ) {
      validPrefUpdates.gender_preference = prefUpdates.gender_preference;
    } else {
      console.warn(
        `[UserService] Invalid gender_preference ignored for user ${userId}: ${prefUpdates.gender_preference}`
      );
      // Optionally return an error or just ignore
    }
  }
  // Add validation for other preferences if they exist

  // Check if there are any valid updates left
  if (Object.keys(validPrefUpdates).length === 0) {
    console.log(
      `[UserService] No valid preference updates provided for user: ${userId}`
    );
    return user; // Return original user, no changes made
  }

  const updatedPreferences = { ...user.preferences, ...validPrefUpdates };
  const updatedUser = {
    ...user,
    preferences: updatedPreferences,
    updated_at: new Date(), // Re-add timestamp update
  };

  // 1. Try checking profile completion
  let isComplete: boolean;
  try {
    // Check completion synchronously
    isComplete = isProfileComplete(updatedUser);
  } catch (error) {
    console.error(`[UserService] Error during profile completion check for user ${userId}:`, error);
    return null; // Fail fast if completion check errors
  }

  // 2. If completion check succeeded, try updating the user store
  try {
    users.set(userId, updatedUser); // Update the store
    console.log(`[UserService] Preferences updated directly for user: ${userId}`);
    return updatedUser; // Return user if store update is successful
  } catch (error) {
    console.error(`[UserService] Error saving user after preference update for user ${userId}:`, error);
    return null; // Return null if store update fails
  }
}

/**
 * Retrieves all users from the store.
 * @returns An array of all user objects.
 */
export function getAllUsers(): User[] {
  // No async needed for Map iteration
  return Array.from(users.values());
}

/**
 * Checks if a user's profile is complete.
 * @param user The user object to check.
 * @returns True if the profile is complete, false otherwise.
 */
export function isProfileComplete(user: Partial<User> | null): boolean {
  // Handle null or undefined user input gracefully
  if (!user) {
    console.debug("[isProfileComplete] Called with null/undefined user.");
    return false;
  }

  // Check if all essential profile fields are filled *and valid*
  const isComplete =
    !!user.name &&
    user.name.length >= MIN_NAME_LENGTH &&
    user.name.length <= MAX_NAME_LENGTH &&
    user.age != null && // Use explicit null check
    user.age >= MIN_AGE &&
    user.age <= MAX_AGE &&
    !!user.gender &&
    !!user.description &&
    user.description.length >= MIN_DESCRIPTION_LENGTH &&
    user.description.length <= MAX_DESCRIPTION_LENGTH &&
    !!user.preferences?.gender_preference; // Must have a gender preference

  console.debug(
    `[isProfileComplete] Checking completion for user ${user?.id}: ` +
      `name=${user?.name}, age=${user?.age}, gender=${user?.gender}, ` +
      `description=${user?.description}, pref=${user?.preferences?.gender_preference} -> ${isComplete}`
  );
  return isComplete;
}
