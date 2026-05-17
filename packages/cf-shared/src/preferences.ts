import type { Preferences } from "./contracts/user.js";

export interface DefaultPreferenceInput {
  age?: number;
  birthDate?: string;
  gender?: string;
}

const BIRTHDATE_REGEX = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(\d{4})$/;

function parseBirthDate(
  input: string,
): { day: number; month: number; year: number } | null {
  const match = input.trim().match(BIRTHDATE_REGEX);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - year;
  const m = now.getMonth() - (month - 1);
  if (m < 0 || (m === 0 && now.getDate() < day)) {
    age--;
  }
  if (age < 12 || age > 80) return null;

  return { day, month, year };
}

export function computeAgeFromBirthDate(birthDate: string): number | undefined {
  const isoMatch = birthDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);

    // Validate actual calendar date
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return undefined;
    }

    const now = new Date();
    let age = now.getFullYear() - year;
    const m = now.getMonth() - (month - 1);
    if (m < 0 || (m === 0 && now.getDate() < day)) {
      age--;
    }
    if (age >= 12 && age <= 80) return age;
  }

  const parsed = parseBirthDate(birthDate);
  if (!parsed) return undefined;
  const now = new Date();
  let age = now.getFullYear() - parsed.year;
  const m = now.getMonth() - (parsed.month - 1);
  if (m < 0 || (m === 0 && now.getDate() < parsed.day)) {
    age--;
  }
  return age;
}

export function computeDefaultPreferences(
  input: DefaultPreferenceInput,
): Partial<Preferences> {
  const age =
    input.age ??
    (input.birthDate ? computeAgeFromBirthDate(input.birthDate) : undefined);

  const genderPreference = input.gender
    ? input.gender === "male"
      ? (["female"] as const)
      : input.gender === "female"
        ? (["male"] as const)
        : (["male", "female", "other", "prefer_not_to_say"] as const)
    : undefined;

  const normalizedAge = age != null ? Math.max(12, Math.min(80, age)) : undefined;
  const minAge = normalizedAge != null ? Math.max(12, normalizedAge - 7) : undefined;
  const maxAge = normalizedAge != null ? Math.min(80, normalizedAge + 7) : undefined;
  const maxDistance = 25;

  const defaults: Record<string, unknown> = {};
  if (genderPreference) defaults.genderPreference = genderPreference;
  if (minAge != null) defaults.minAge = minAge;
  if (maxAge != null) defaults.maxAge = maxAge;
  defaults.maxDistance = maxDistance;

  return defaults as Partial<Preferences>;
}
