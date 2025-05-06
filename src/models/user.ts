/**
 * Represents the gender options for a user.
 */
export enum Gender {
  Man = "Man",
  Woman = "Woman",
  NonBinary = "Non-binary",
  // Add other options as needed
}

/**
 * Represents the gender preferences for matching.
 */
export enum GenderPreference {
  Men = "Men",
  Women = "Women",
  Everyone = "Everyone",
}

/**
 * Represents user preferences for matching.
 */
export interface UserPreferences {
  minAge: number | null; // Added camelCase field
  maxAge: number | null; // Added camelCase field
  gender: GenderPreference | null; // Added camelCase field
  // gender_preference: GenderPreference; // Removed snake_case field
}

/**
 * Validation Constants
 */
export const MIN_AGE = 18;
export const MAX_AGE = 99;
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 50;
export const MIN_DESCRIPTION_LENGTH = 10;
export const MAX_DESCRIPTION_LENGTH = 250;

/**
 * Represents a user in the system (Internal Model Type).
 * NOTE: This is used for defining result shapes, not direct DB interaction.
 * DB interaction uses the type inferred from `db/schema.ts`.
 */
export type User = {
  id: number;
  telegramId: number; // Renamed to camelCase
  telegramUsername?: string | null; // Renamed to camelCase
  firstName: string | null; // Renamed to camelCase
  lastName: string | null; // Renamed to camelCase
  age: number | null;
  gender: Gender | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  createdAt: Date; // Renamed to camelCase
  updatedAt: Date; // Renamed to camelCase
  isActive: boolean; // Renamed to camelCase
  isBanned: boolean; // Renamed to camelCase
  isComplete: boolean;
  status: "active" | "inactive" | "banned" | "deleted";
};

/**
 * Represents the shape of data used for updating a user profile.
 * Excludes fields that shouldn't be directly updatable.
 */
export type UserUpdate = Partial<
  Omit<
    User,
    | "id"
    | "telegramId" // Use camelCase name
    | "createdAt" // Use camelCase name
    | "updatedAt" // Use camelCase name
    | "isActive" // Use camelCase name
    | "isBanned" // Use camelCase name
    | "status"
    | "isComplete"
  >
>;

/**
 * Represents the result of an attempt to update a user.
 */
export type UserUpdateResult =
  | { success: true; user: User } // Uses the internal User type
  | { success: false; errors: ValidationErrors };

/**
 * Default user preferences.
 */
export const defaultPreferences: UserPreferences = {
  minAge: MIN_AGE, // Added default
  maxAge: MAX_AGE, // Added default
  gender: GenderPreference.Everyone, // Added default
  // gender_preference: GenderPreference.Everyone, // Removed snake_case
};

/**
 * Type definition for validation errors. Keys are field names, values are arrays of error messages.
 */
export type ValidationErrors = Record<string, string[]>; // Changed to string array

/**
 * Type representing the core user profile data structure
 */
export type UserProfile = {
  userId: number;
  firstName: string | null;
  lastName: string | null;
  age: number | null;
  gender: Gender | null; // Aligned with Gender enum
  description: string | null;
};

// Result type for profile updates
export type UserProfileResult = {
  success: boolean;
  profile?: UserProfile;
  isComplete?: boolean;
  errors?: ValidationErrors;
};

// Result type for preferences updates
export type PreferencesResult = {
  success: boolean;
  preferences?: UserPreferences;
  errors?: ValidationErrors;
};

import type { User as SchemaUser } from "../db/schema"; // Import DB schema type

/**
 * Combined result type for general user operations (create, update status)
 * NOTE: The `user` property here uses the internal `User` type from this file.
 * Service functions currently return the `SchemaUser` type from `db/schema.ts` on success.
 * This might need further alignment depending on how results are consumed.
 */
export type CreateUserResult =
  | { success: true; user: SchemaUser; created: boolean } // Use SchemaUser here
  | { success: false; errors: ValidationErrors };

export type UserResult =
  | { success: true; user: SchemaUser }
  | { success: false; errors: ValidationErrors };
