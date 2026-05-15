import type { MyContext } from '../types.js';
import type { Env } from '../index.js';
import { ApiServiceClient } from '../services/api-client.js';

export interface UserProfile {
  id: string;
  displayName?: string;
  username?: string;
  lastName?: string;
  bio?: string;
  age?: number;
  birthDate?: string;
  gender?: string;
  interests?: string[];
  mediaUrls?: Array<{ url: string; type: string; uploadedAt: string }>;
  location?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  isActive?: boolean;
  isSleeping?: boolean;
  isProfileComplete?: boolean;
  phoneNumber?: string;
  language?: string;
  subscriptionTier?: string;
  hiddenFromMatches?: boolean;
  mediaDeletedAt?: string;
  lastInteractionAt?: string;
}

export const REQUIRED_FIELDS = [
  'displayName',
  'birthDate',
  'gender',
  'bio',
  'location',
  'interests',
  'mediaUrls',
] as const;

export function isPhoneVerified(user: UserProfile): boolean {
  return !!user.phoneNumber && user.phoneNumber.trim().length > 0;
}

export function getProfileCompleteness(user: UserProfile): {
  complete: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!user.displayName || user.displayName.trim().length === 0) {
    missing.push('displayName');
  }
  if (!user.birthDate || user.birthDate.trim().length === 0) {
    missing.push('birthDate');
  }
  if (!user.gender) {
    missing.push('gender');
  }
  if (!user.bio || user.bio.trim().length === 0) {
    missing.push('bio');
  }
  if (!user.location || (!user.location.city && !user.location.latitude)) {
    missing.push('location');
  }
  if (!user.interests || user.interests.length === 0) {
    missing.push('interests');
  }
  if (!user.mediaUrls || user.mediaUrls.length === 0) {
    missing.push('mediaUrls');
  }

  return { complete: missing.length === 0, missing };
}

export function getMissingFieldsDisplay(missing: string[]): string {
  const labels: Record<string, string> = {
    displayName: '👤 Name',
    birthDate: '🎂 Age',
    gender: '⚧ Gender',
    bio: '📝 Bio',
    location: '📍 Location',
    interests: '🌟 Interests',
    mediaUrls: '📸 Media',
  };
  return missing.map((f) => labels[f] || f).join(', ');
}

// --- Birthdate helpers ---

const BIRTHDATE_REGEX = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])\.(\d{4})$/;

export function parseBirthDate(input: string): { day: number; month: number; year: number; iso: string } | null {
  const match = input.trim().match(BIRTHDATE_REGEX);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  // Validate actual date
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  // Validate age range (12–80)
  const now = new Date();
  let age = now.getFullYear() - year;
  const m = now.getMonth() - (month - 1);
  if (m < 0 || (m === 0 && now.getDate() < day)) {
    age--;
  }
  if (age < 12 || age > 80) return null;

  return { day, month, year, iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

export function computeAgeFromBirthDate(birthDate: string): number | undefined {
  // Try parsing as ISO format YYYY-MM-DD first (database storage format)
  const isoMatch = birthDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    const now = new Date();
    let age = now.getFullYear() - year;
    const m = now.getMonth() - (month - 1);
    if (m < 0 || (m === 0 && now.getDate() < day)) {
      age--;
    }
    if (age >= 12 && age <= 80) return age;
  }

  // Fallback to DD.MM.YYYY format (user input format)
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

export function isBirthdayToday(birthDate: string | undefined): boolean {
  if (!birthDate) return false;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export async function ensureUserExists(
  ctx: MyContext,
  env: Env
): Promise<{ user: UserProfile; created: boolean } | null> {
  if (!ctx.from) return null;

  const client = new ApiServiceClient(env.API_SERVICE);
  const userId = String(ctx.from.id);

  // Try to fetch existing user
  try {
    const response = await client.getUser({ userId });
    if (response.user) {
      return { user: response.user as UserProfile, created: false };
    }
  } catch {
    // User doesn't exist or API error — proceed to create
  }

  // Create user if not found
  try {
    const response = await client.createUser({
      user: {
        id: userId,
        username: ctx.from.username ?? undefined,
        displayName: ctx.from.first_name,
        isActive: true,
      },
    });
    return { user: response.user as UserProfile, created: true };
  } catch (error) {
    console.error('Failed to create user in ensureUserExists:', error);
    return null;
  }
}

export async function updateUserProfileComplete(
  env: Env,
  userId: string,
  isComplete: boolean
): Promise<boolean> {
  try {
    const response = await env.API_SERVICE.fetch(
      new Request(`http://api/users/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({ user: { isProfileComplete: isComplete } }),
        headers: { 'Content-Type': 'application/json' },
      })
    );
    return response.ok;
  } catch {
    return false;
  }
}
