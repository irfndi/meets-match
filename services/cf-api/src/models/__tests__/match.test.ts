import { describe, it, expect, vi } from 'vitest';
import { Effect } from 'effect';
import { MatchRepository, calculateMatchScore, haversine } from '../match.js';
import { UserRepository } from '../user.js';

function createMockD1(candidates: Array<Record<string, unknown>> = [], currentUser: Record<string, unknown> | null = null) {
  const capturedSql: string[] = [];
  const capturedValues: unknown[][] = [];

  const mockD1 = {
    prepare: vi.fn((sql: string) => {
      capturedSql.push(sql);
      return {
        bind: vi.fn((...values: unknown[]) => {
          capturedValues.push(values);
          return {
            run: vi.fn(async () => ({ success: true })),
            first: vi.fn(async () => {
              if (sql.includes('FROM users WHERE id =') && currentUser) {
                return currentUser;
              }
              if (sql.includes('FROM notifications WHERE id =')) {
                return null;
              }
              if (sql.includes('COUNT(*)')) {
                return { c: 0 };
              }
              return null;
            }),
            all: vi.fn(async () => {
              if (sql.includes('FROM users')) {
                return { results: candidates };
              }
              return { results: [] };
            }),
          };
        }),
      };
    }),
    batch: vi.fn(async (statements: unknown[]) => ({ success: true })),
    _capturedSql: capturedSql,
    _capturedValues: capturedValues,
  } as unknown as D1Database & { _capturedSql: string[]; _capturedValues: unknown[][] };

  return mockD1;
}

function createDbRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: '100',
    first_name: 'Test',
    age: 25,
    gender: 'female',
    interests: JSON.stringify(['music', 'travel']),
    photos: '[]',
    location: JSON.stringify({ latitude: 0, longitude: 0 }),
    preferences: JSON.stringify({ minAge: 20, maxAge: 30, genderPreference: ['male'], maxDistance: 50 }),
    is_active: 1,
    is_profile_complete: 1,
    ...overrides,
  };
}

function createUser(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: '100',
    username: undefined,
    displayName: 'Test',
    lastName: undefined,
    bio: undefined,
    age: 25,
    gender: 'female',
    interests: ['music', 'travel'],
    photos: [],
    location: { latitude: 0, longitude: 0 },
    preferences: { minAge: 20, maxAge: 30, genderPreference: ['male'], maxDistance: 50 },
    isActive: true,
    isSleeping: false,
    isProfileComplete: true,
    phoneNumber: undefined,
    language: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    lastActive: undefined,
    ...overrides,
  };
}

describe('haversine', () => {
  it('calculates distance between two points', () => {
    const dist = haversine(0, 0, 1, 0);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(112);
  });

  it('returns 0 for same point', () => {
    expect(haversine(10, 20, 10, 20)).toBe(0);
  });
});

describe('calculateMatchScore', () => {
  it('gives perfect score for identical profiles at same location', () => {
    const user = createUser({
      interests: ['music', 'travel'],
      preferences: { minAge: 25, maxAge: 25, genderPreference: ['female'], maxDistance: 50 },
      location: { latitude: 0, longitude: 0 },
    });
    const score = calculateMatchScore(user as any, user as any);
    expect(score.location).toBe(1);
    expect(score.interests).toBe(1);
    expect(score.preferences).toBe(1);
    expect(score.total).toBe(1);
  });

  it('gives 0 location score when no location', () => {
    const user1 = createUser({ location: { latitude: 0, longitude: 0 } });
    const user2 = createUser({ location: undefined });
    const score = calculateMatchScore(user1 as any, user2 as any);
    expect(score.location).toBe(0);
  });

  it('gives 0 interests score with no common interests', () => {
    const user1 = createUser({ interests: ['music'] });
    const user2 = createUser({ interests: ['sports'] });
    const score = calculateMatchScore(user1 as any, user2 as any);
    expect(score.interests).toBe(0);
  });

  it('penalizes distant location beyond maxDistance', () => {
    const user1 = createUser({
      location: { latitude: 0, longitude: 0 },
      preferences: { maxDistance: 100 },
    });
    const user2 = createUser({
      location: { latitude: 0, longitude: 1 },
    });
    const score = calculateMatchScore(user1 as any, user2 as any);
    // Distance ~111km, maxDist 100km, so outside range => 0
    expect(score.location).toBe(0);
  });

  it('penalizes non-matching preferences', () => {
    const user1 = createUser({
      age: 25,
      preferences: { minAge: 30, maxAge: 40, genderPreference: ['male'] },
    });
    const user2 = createUser({
      age: 20,
      gender: 'female',
    });
    const score = calculateMatchScore(user1 as any, user2 as any);
    expect(score.preferences).toBe(0);
  });

  it('weights correctly: location 30%, interests 40%, preferences 30%', () => {
    const user1 = createUser({
      interests: ['music'],
      preferences: { maxDistance: 100 },
      location: { latitude: 0, longitude: 0 },
    });
    const user2 = createUser({
      interests: ['music', 'sports'],
      location: { latitude: 0, longitude: 0 },
      age: 25,
      gender: 'female',
    });
    const score = calculateMatchScore(user1 as any, user2 as any);
    // location: same point => 1.0 * 0.3 = 0.3
    // interests: 1 common / 2 union = 0.5 * 0.4 = 0.2
    // preferences: only maxDistance applies (no minAge/maxAge/genderPreference/relationshipType)
    // So prefChecks = 0, score.preferences = 0
    // total = 0.3 + 0.2 + 0 = 0.5
    expect(score.location).toBe(1);
    expect(score.interests).toBe(0.5);
    expect(score.preferences).toBe(0);
    expect(score.total).toBeCloseTo(0.5, 5);
  });
});

describe('MatchRepository.getPotentialMatches SQL', () => {
  it('includes age and gender preference filters in SQL', async () => {
    const currentUser = createDbRow({
      id: '1',
      preferences: JSON.stringify({ minAge: 20, maxAge: 30, genderPreference: ['male', 'non-binary'] }),
    });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(matchRepo.getPotentialMatches({ userId: '1', limit: 10 }));

    const sql = mockD1._capturedSql.find((s) => s.includes('FROM users u'));
    expect(sql).toContain('u.age >= ?');
    expect(sql).toContain('u.age <= ?');
    expect(sql).toContain('u.gender IN (?,?)');

    const values = mockD1._capturedValues.find((v) => v.length >= 8);
    expect(values).toContain(20);
    expect(values).toContain(30);
    expect(values).toContain('male');
    expect(values).toContain('non-binary');
  });

  it('includes is_active and is_profile_complete filters in SQL', async () => {
    const currentUser = createDbRow({ id: '1', preferences: '{}' });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(matchRepo.getPotentialMatches({ userId: '1', limit: 10 }));

    const sql = mockD1._capturedSql.find((s) => s.includes('FROM users u'));
    expect(sql).toContain('u.is_active = 1');
    expect(sql).toContain('u.is_profile_complete = 1');
  });
});

describe('MatchRepository.getPotentialMatches JS filtering', () => {
  it('filters out candidates beyond maxDistance', async () => {
    const currentUser = createDbRow({
      id: '1',
      location: JSON.stringify({ latitude: 0, longitude: 0 }),
      preferences: JSON.stringify({ maxDistance: 10 }),
    });
    const candidates = [
      createDbRow({ id: '2', location: JSON.stringify({ latitude: 0, longitude: 0.05 }), first_name: 'Near', preferences: '{}' }),
      createDbRow({ id: '3', location: JSON.stringify({ latitude: 0, longitude: 2 }), first_name: 'Far', preferences: '{}' }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(matchRepo.getPotentialMatches({ userId: '1', limit: 10 }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('respects cooldown for disliked profiles', async () => {
    const now = new Date().toISOString();
    const currentUser = createDbRow({ id: '1', preferences: '{}' });
    const candidates = [
      createDbRow({
        id: '2',
        first_name: 'RecentDislike',
        preferences: '{}',
        match_status: 'rejected',
        user1_id: '1',
        user2_id: '2',
        user1_action: 'dislike',
        user2_action: 'none',
        match_updated_at: now,
      }),
      createDbRow({
        id: '3',
        first_name: 'OldDislike',
        preferences: '{}',
        match_status: 'rejected',
        user1_id: '1',
        user2_id: '3',
        user1_action: 'dislike',
        user2_action: 'none',
        match_updated_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(matchRepo.getPotentialMatches({ userId: '1', limit: 10 }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('respects cooldown for skipped profiles', async () => {
    const now = new Date().toISOString();
    const currentUser = createDbRow({ id: '1', preferences: '{}' });
    const candidates = [
      createDbRow({
        id: '2',
        first_name: 'RecentSkip',
        preferences: '{}',
        match_status: 'pending',
        user1_id: '1',
        user2_id: '2',
        user1_action: 'skip',
        user2_action: 'none',
        match_updated_at: now,
      }),
      createDbRow({
        id: '3',
        first_name: 'OldSkip',
        preferences: '{}',
        match_status: 'pending',
        user1_id: '1',
        user2_id: '3',
        user1_action: 'skip',
        user2_action: 'none',
        match_updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(matchRepo.getPotentialMatches({ userId: '1', limit: 10 }));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('3');
  });

  it('returns empty array for inactive current user', async () => {
    const currentUser = createDbRow({ id: '1', is_active: 0, preferences: '{}' });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(matchRepo.getPotentialMatches({ userId: '1', limit: 10 }));
    expect(result).toHaveLength(0);
  });

  it('returns empty array for incomplete profile', async () => {
    const currentUser = createDbRow({ id: '1', is_profile_complete: 0, preferences: '{}' });
    const mockD1 = createMockD1([], currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    const result = await Effect.runPromise(matchRepo.getPotentialMatches({ userId: '1', limit: 10 }));
    expect(result).toHaveLength(0);
  });

  it('records profile views for returned candidates', async () => {
    const currentUser = createDbRow({ id: '1', preferences: '{}' });
    const candidates = [
      createDbRow({ id: '2', first_name: 'A', preferences: '{}' }),
      createDbRow({ id: '3', first_name: 'B', preferences: '{}' }),
    ];

    const mockD1 = createMockD1(candidates, currentUser);
    const userRepo = new UserRepository(mockD1);
    const matchRepo = new MatchRepository(mockD1, userRepo);

    await Effect.runPromise(matchRepo.getPotentialMatches({ userId: '1', limit: 10 }));

    expect(mockD1.batch).toHaveBeenCalled();
    const batchCalls = (mockD1.batch as any).mock.calls;
    expect(batchCalls[0][0]).toHaveLength(2);
  });
});
