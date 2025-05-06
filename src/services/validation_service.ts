import type {
  UserPreferences,
  UserProfile,
  ValidationErrors,
} from "../models/user";
import { MAX_AGE, MIN_AGE } from "../models/user"; // Use regular import for constants

// Define the result type for validation functions
export type ValidationResult =
  | { success: true }
  | { success: false; errors: ValidationErrors };

/**
 * Validates user profile data.
 * TODO: Implement actual validation logic based on rules in models/user.ts
 *
 * @param profileData The profile data to validate.
 * @returns ValidationResult indicating success or failure.
 */
export function validateUserProfile(
  profileData: Partial<UserProfile>
): ValidationResult {
  const errors: ValidationErrors = {};

  // --- Add actual validation logic ---
  if (
    profileData.age !== undefined &&
    profileData.age !== null &&
    profileData.age < MIN_AGE
  ) {
    errors.age = [`Age must be ${MIN_AGE} or older.`];
  }
  // Add other profile validations here...
  // Example: Check firstName length, lastName length, description length etc.
  // based on constants imported from ../models/user

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }
  return { success: true };
}

/**
 * Validates user preferences data.
 * TODO: Implement actual validation logic.
 *
 * @param preferencesData The preferences data to validate.
 * @returns ValidationResult indicating success or failure.
 */
export function validateUserPreferences(
  preferencesData: Partial<UserPreferences>
): ValidationResult {
  const errors: ValidationErrors = {};

  // --- Add actual validation logic ---
  const { minAge, maxAge } = preferencesData;
  if (
    minAge !== undefined &&
    minAge !== null &&
    (minAge < MIN_AGE || minAge > MAX_AGE)
  ) {
    errors.minAge = [`Minimum age must be between ${MIN_AGE} and ${MAX_AGE}.`];
  }
  if (
    maxAge !== undefined &&
    maxAge !== null &&
    (maxAge < MIN_AGE || maxAge > MAX_AGE)
  ) {
    errors.maxAge = [`Maximum age must be between ${MIN_AGE} and ${MAX_AGE}.`];
  }
  if (
    minAge !== undefined &&
    minAge !== null &&
    maxAge !== undefined &&
    maxAge !== null &&
    minAge > maxAge
  ) {
    errors.ageRange = ["Minimum age cannot be greater than maximum age."];
  }
  // Add other preference validations here...

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }
  return { success: true };
}
