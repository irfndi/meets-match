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
  gender_preference: GenderPreference;
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
 * Represents a user in the system.
 */
export interface User {
  id: number; // Telegram User ID
  telegram_username?: string | null; // Optional Telegram username
  name: string | null;
  age: number | null;
  gender: Gender | null; // Use the Gender enum
  latitude: number | null;
  longitude: number | null;
  description: string | null; // User's description
  preferences: UserPreferences; // Make non-nullable
  created_at: Date;
  updated_at: Date;
  is_active: boolean;
  is_banned: boolean;
  is_complete: boolean; // Flag indicating if profile setup is done
}

/**
 * Represents the shape of data used for updating a user profile.
 * Excludes fields that shouldn't be directly updatable.
 */
export type UserUpdate = Partial<
  Omit<
    User,
    | "id"
    | "created_at"
    | "updated_at"
    | "is_active"
    | "is_banned"
    | "telegram_username"
  >
>;

/**
 * Default user preferences.
 */
export const defaultPreferences: UserPreferences = {
  gender_preference: GenderPreference.Everyone, // Use enum value
};

/**
 * Type definition for validation errors. Can be nested for preferences.
 */
export type ValidationErrors = { [key: string]: string | ValidationErrors };

// Define the result type for the updateUser operation
export type UserUpdateResult =
  | { success: true; user: User }
  | { success: false; errors: ValidationErrors };
