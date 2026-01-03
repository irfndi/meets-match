/**
 * Test data management utilities for integration and E2E tests.
 *
 * Provides consistent test data generation, tracking, and cleanup.
 */

/**
 * Generate a unique test user ID to avoid collisions across test runs.
 */
export function generateTestUserId(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Generate a unique test match ID.
 */
export function generateTestMatchId(): string {
  return `match-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a test user fixture with sensible defaults.
 * All values can be overridden via the overrides parameter.
 */
export function testUserFixture(
  overrides: Partial<{
    id: string;
    username: string;
    firstName: string;
    lastName: string;
    bio: string;
    age: number;
    gender: string;
    interests: string[];
    photos: string[];
    isActive: boolean;
    isSleeping: boolean;
    isProfileComplete: boolean;
    location: {
      latitude: number;
      longitude: number;
      city: string;
      country: string;
    };
    preferences: {
      minAge: number;
      maxAge: number;
      genderPreference: string[];
      maxDistance: number;
      notificationsEnabled: boolean;
      preferredLanguage: string;
      preferredCountry: string;
      premiumTier: string;
    };
  }> = {},
): Record<string, unknown> {
  const id = overrides.id ?? generateTestUserId();

  return {
    id,
    username: overrides.username ?? `testuser_${id.slice(-6)}`,
    firstName: overrides.firstName ?? 'Test',
    lastName: overrides.lastName ?? 'User',
    bio: overrides.bio ?? 'A test user for E2E testing',
    age: overrides.age ?? 25,
    gender: overrides.gender ?? 'male',
    interests: overrides.interests ?? ['testing', 'coding', 'automation'],
    photos: overrides.photos ?? [],
    isActive: overrides.isActive ?? true,
    isSleeping: overrides.isSleeping ?? false,
    isProfileComplete: overrides.isProfileComplete ?? true,
    location: overrides.location ?? {
      latitude: 37.5665,
      longitude: 126.978,
      city: 'Seoul',
      country: 'South Korea',
    },
    preferences: overrides.preferences ?? {
      minAge: 18,
      maxAge: 40,
      genderPreference: ['female'],
      maxDistance: 100,
      notificationsEnabled: true,
      preferredLanguage: 'en',
      preferredCountry: '',
      premiumTier: 'free',
    },
  };
}

/**
 * Create a test match fixture with sensible defaults.
 */
export function testMatchFixture(
  overrides: Partial<{
    id: string;
    user1Id: string;
    user2Id: string;
    status: string;
    user1Action: string;
    user2Action: string;
    score: number;
  }> = {},
): Record<string, unknown> {
  return {
    id: overrides.id ?? generateTestMatchId(),
    user1Id: overrides.user1Id ?? generateTestUserId(),
    user2Id: overrides.user2Id ?? generateTestUserId(),
    status: overrides.status ?? 'pending',
    user1Action: overrides.user1Action ?? 'none',
    user2Action: overrides.user2Action ?? 'none',
    score: overrides.score ?? 0.75,
  };
}

/**
 * Test data tracker for cleanup in integration tests.
 *
 * Usage:
 * ```typescript
 * const tracker = new TestDataTracker();
 * tracker.trackUser(userId);
 * // ... run tests ...
 * await tracker.cleanup(userService); // Deletes all tracked users
 * ```
 */
export class TestDataTracker {
  private readonly createdUsers = new Set<string>();
  private readonly createdMatches = new Set<string>();

  /**
   * Track a user ID for later cleanup.
   */
  trackUser(userId: string): void {
    this.createdUsers.add(userId);
  }

  /**
   * Track a match ID for later cleanup.
   */
  trackMatch(matchId: string): void {
    this.createdMatches.add(matchId);
  }

  /**
   * Get all tracked user IDs.
   */
  getTrackedUsers(): string[] {
    return Array.from(this.createdUsers);
  }

  /**
   * Get all tracked match IDs.
   */
  getTrackedMatches(): string[] {
    return Array.from(this.createdMatches);
  }

  /**
   * Clear all tracking (without cleanup).
   */
  reset(): void {
    this.createdUsers.clear();
    this.createdMatches.clear();
  }

  /**
   * Get count of tracked items.
   */
  get stats(): { users: number; matches: number } {
    return {
      users: this.createdUsers.size,
      matches: this.createdMatches.size,
    };
  }
}

/**
 * Global test data tracker instance for convenience.
 * Can be used across test files when not needing isolation.
 */
export const globalTestDataTracker = new TestDataTracker();

/**
 * Test IDs for the known test user (theprofcrypto).
 */
export const KNOWN_TEST_USER = {
  telegramId: '1082762347',
  username: 'theprofcrypto',
  firstName: 'The Prof.',
} as const;

/**
 * Helper to create multiple test users for matching scenarios.
 */
export function createTestUserPair(): {
  user1: Record<string, unknown>;
  user2: Record<string, unknown>;
} {
  const user1 = testUserFixture({
    gender: 'male',
    preferences: {
      minAge: 20,
      maxAge: 35,
      genderPreference: ['female'],
      maxDistance: 100,
      notificationsEnabled: true,
      preferredLanguage: 'en',
      preferredCountry: '',
      premiumTier: 'free',
    },
  });

  const user2 = testUserFixture({
    gender: 'female',
    preferences: {
      minAge: 20,
      maxAge: 35,
      genderPreference: ['male'],
      maxDistance: 100,
      notificationsEnabled: true,
      preferredLanguage: 'en',
      preferredCountry: '',
      premiumTier: 'free',
    },
  });

  return { user1, user2 };
}
