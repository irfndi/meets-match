/**
 * Test fixtures for bot tests
 *
 * These fixtures provide type-compatible mock data for protobuf messages.
 * Uses `as any` casting to bypass protobuf Message class requirements in tests.
 */

import type {
  GetPotentialMatchesResponse,
  CreateMatchResponse,
  LikeMatchResponse,
  DislikeMatchResponse,
  GetMatchResponse,
  GetMatchListResponse,
  Match,
} from '@meetsmatch/contracts/proto/meetsmatch/v1/match_pb.js';
import type {
  GetUserResponse,
  UpdateUserResponse,
  User,
  Location,
  Preferences,
} from '@meetsmatch/contracts/proto/meetsmatch/v1/user_pb.js';

// Mock Timestamp type (plain object without importing from protobuf)
interface MockTimestamp {
  seconds: bigint;
  nanos: number;
}

// Helper to create a mock Timestamp
export const createMockTimestamp = (date: Date = new Date()): MockTimestamp => ({
  seconds: BigInt(Math.floor(date.getTime() / 1000)),
  nanos: 0,
});

// Helper to create a complete mock User
export const createMockUser = (overrides: Record<string, unknown> = {}): User =>
  ({
    id: 'user123',
    username: 'testuser',
    firstName: 'Test',
    lastName: 'User',
    bio: 'Test bio',
    age: 25,
    gender: 'male',
    interests: ['coding', 'music'],
    photos: ['photo1.jpg'],
    location: createMockLocation(),
    preferences: createMockPreferences(),
    isActive: true,
    isSleeping: false,
    isProfileComplete: true,
    createdAt: createMockTimestamp(),
    updatedAt: createMockTimestamp(),
    lastActive: createMockTimestamp(),
    ...overrides,
  }) as unknown as User;

// Helper to create a mock Location
export const createMockLocation = (overrides: Record<string, unknown> = {}): Location =>
  ({
    latitude: 37.5665,
    longitude: 126.978,
    city: 'Seoul',
    country: 'South Korea',
    lastUpdated: createMockTimestamp(),
    ...overrides,
  }) as unknown as Location;

// Helper to create mock Preferences
export const createMockPreferences = (overrides: Record<string, unknown> = {}): Preferences =>
  ({
    minAge: 18,
    maxAge: 35,
    genderPreference: ['female'],
    relationshipType: ['dating'],
    maxDistance: 50,
    notificationsEnabled: true,
    preferredLanguage: 'en',
    preferredCountry: '',
    premiumTier: 'free',
    ...overrides,
  }) as unknown as Preferences;

// Helper to create a complete mock Match
export const createMockMatch = (overrides: Record<string, unknown> = {}): Match =>
  ({
    id: 'match123',
    user1Id: 'user1',
    user2Id: 'user2',
    status: 'pending',
    score: 0.85,
    createdAt: createMockTimestamp(),
    updatedAt: createMockTimestamp(),
    matchedAt: undefined,
    user1Action: '',
    user2Action: '',
    ...overrides,
  }) as unknown as Match;

// Response fixtures
export const createGetPotentialMatchesResponse = (
  potentialMatches: User[] = [],
): GetPotentialMatchesResponse =>
  ({
    potentialMatches,
  }) as unknown as GetPotentialMatchesResponse;

export const createCreateMatchResponse = (match?: Match): CreateMatchResponse =>
  ({
    match,
  }) as unknown as CreateMatchResponse;

export const createLikeMatchResponse = (isMutual: boolean, match?: Match): LikeMatchResponse =>
  ({
    isMutual,
    match,
  }) as unknown as LikeMatchResponse;

export const createDislikeMatchResponse = (match?: Match): DislikeMatchResponse =>
  ({
    match,
  }) as unknown as DislikeMatchResponse;

export const createGetMatchResponse = (match?: Match): GetMatchResponse =>
  ({
    match,
  }) as unknown as GetMatchResponse;

export const createGetMatchListResponse = (matches: Match[] = []): GetMatchListResponse =>
  ({
    matches,
  }) as unknown as GetMatchListResponse;

export const createGetUserResponse = (user?: User | null): GetUserResponse =>
  ({
    user,
  }) as unknown as GetUserResponse;

export const createUpdateUserResponse = (user?: User): UpdateUserResponse =>
  ({
    user,
  }) as unknown as UpdateUserResponse;

// Import vi from vitest for the mock context helper
import { vi } from 'vitest';

// Mock grammy Context helper with proper typing
export interface MockContext {
  from: { id: number } | undefined;
  reply: ReturnType<typeof vi.fn>;
  callbackQuery: { data: string } | undefined;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
  deleteMessage: ReturnType<typeof vi.fn>;
}

export const createMockContext = (overrides: Partial<MockContext> = {}): MockContext => ({
  from: { id: 12345 },
  reply: vi.fn().mockResolvedValue({}),
  callbackQuery: undefined,
  answerCallbackQuery: vi.fn().mockResolvedValue({}),
  editMessageText: vi.fn().mockResolvedValue({}),
  deleteMessage: vi.fn().mockResolvedValue({}),
  ...overrides,
});
