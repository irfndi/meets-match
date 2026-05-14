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
  gender?: string;
  interests?: string[];
  photos?: string[];
  location?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  isActive?: boolean;
  isSleeping?: boolean;
  isProfileComplete?: boolean;
}

export const REQUIRED_FIELDS = [
  'displayName',
  'age',
  'gender',
  'bio',
  'location',
  'interests',
] as const;

export function getProfileCompleteness(user: UserProfile): {
  complete: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!user.displayName || user.displayName.trim().length === 0) {
    missing.push('displayName');
  }
  if (user.age === undefined || user.age === null) {
    missing.push('age');
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

  return { complete: missing.length === 0, missing };
}

export function getMissingFieldsDisplay(missing: string[]): string {
  const labels: Record<string, string> = {
    displayName: '👤 Name',
    age: '🎂 Age',
    gender: '⚧ Gender',
    bio: '📝 Bio',
    location: '📍 Location',
    interests: '🌟 Interests',
  };
  return missing.map((f) => labels[f] || f).join(', ');
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
