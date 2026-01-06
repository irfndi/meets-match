/**
 * Test fixtures for bot tests
 *
 * These fixtures provide type-compatible mock data for protobuf messages.
 * Uses `as any` casting to bypass protobuf Message class requirements in tests.
 */

import type {
  CreateMatchResponse,
  DislikeMatchResponse,
  GetMatchListResponse,
  GetMatchResponse,
  GetPotentialMatchesResponse,
  LikeMatchResponse,
  Match,
} from '@meetsmatch/contracts/proto/meetsmatch/v1/match_pb.js';
import type {
  GetUserResponse,
  Location,
  Preferences,
  UpdateUserResponse,
  User,
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

import type { SkipMatchResponse } from '@meetsmatch/contracts/proto/meetsmatch/v1/match_pb.js';
import type { CreateUserResponse } from '@meetsmatch/contracts/proto/meetsmatch/v1/user_pb.js';
// Import vi from vitest for the mock context helper
import { vi } from 'vitest';

// Additional response fixtures
export const createCreateUserResponse = (user?: User): CreateUserResponse =>
  ({
    user,
  }) as unknown as CreateUserResponse;

export const createSkipMatchResponse = (match?: Match): SkipMatchResponse =>
  ({
    match,
  }) as unknown as SkipMatchResponse;

// Mock grammy Context helper with proper typing
export interface MockContext {
  from: { id: number; username?: string; first_name?: string; last_name?: string } | undefined;
  chat: { id: number; type: string } | undefined;
  message: { text?: string; message_id?: number } | undefined;
  reply: ReturnType<typeof vi.fn>;
  callbackQuery: { data: string; message?: { message_id: number } } | undefined;
  answerCallbackQuery: ReturnType<typeof vi.fn>;
  editMessageText: ReturnType<typeof vi.fn>;
  deleteMessage: ReturnType<typeof vi.fn>;
  replyWithPhoto: ReturnType<typeof vi.fn>;
  replyWithMediaGroup: ReturnType<typeof vi.fn>;
}

export const createMockContext = (overrides: Partial<MockContext> = {}): MockContext => ({
  from: { id: 12345, username: 'testuser', first_name: 'Test', last_name: 'User' },
  chat: { id: 12345, type: 'private' },
  message: { text: '', message_id: 1 },
  reply: vi.fn().mockResolvedValue({ message_id: 1 }),
  callbackQuery: undefined,
  answerCallbackQuery: vi.fn().mockResolvedValue(true),
  editMessageText: vi.fn().mockResolvedValue({ message_id: 1 }),
  deleteMessage: vi.fn().mockResolvedValue(true),
  replyWithPhoto: vi.fn().mockResolvedValue({ message_id: 1 }),
  replyWithMediaGroup: vi.fn().mockResolvedValue([{ message_id: 1 }]),
  ...overrides,
});

/**
 * Create a mock context with callback query data.
 * Useful for testing inline button handlers.
 */
export const createMockCallbackContext = (
  callbackData: string,
  overrides: Partial<MockContext> = {},
): MockContext =>
  createMockContext({
    callbackQuery: { data: callbackData, message: { message_id: 1 } },
    ...overrides,
  });

/**
 * Mock session data structure for conversation tests.
 */
export interface MockSession {
  profileEdit?: {
    step: string;
    data: Record<string, unknown>;
  };
  conversation?: string;
  __language_code?: string;
}

/**
 * Create a mock session for conversation tests.
 */
export const createMockSession = (overrides: Partial<MockSession> = {}): MockSession => ({
  profileEdit: undefined,
  conversation: undefined,
  __language_code: 'en',
  ...overrides,
});

/**
 * Extended mock context with session support for conversation tests.
 */
export interface MockConversationContext extends MockContext {
  session: MockSession;
  conversation: {
    enter: ReturnType<typeof vi.fn>;
    exit: ReturnType<typeof vi.fn>;
    skip: ReturnType<typeof vi.fn>;
  };
}

/**
 * Create a mock context with conversation support.
 * Useful for testing multi-step conversation flows.
 */
export const createMockConversationContext = (
  overrides: Partial<MockConversationContext> = {},
): MockConversationContext => ({
  ...createMockContext(overrides),
  session: overrides.session ?? createMockSession(),
  conversation: overrides.conversation ?? {
    enter: vi.fn().mockResolvedValue(undefined),
    exit: vi.fn().mockResolvedValue(undefined),
    skip: vi.fn().mockResolvedValue(undefined),
  },
});

/**
 * Helper to simulate a sequence of user interactions for E2E tests.
 * Returns an array of mock contexts representing each step.
 */
export function createInteractionSequence(
  userId: number,
  steps: Array<{ text?: string; callback?: string }>,
): MockContext[] {
  return steps.map((step, index) => {
    if (step.callback) {
      return createMockCallbackContext(step.callback, {
        from: { id: userId },
        message: { text: '', message_id: index + 1 },
      });
    }
    return createMockContext({
      from: { id: userId },
      message: { text: step.text ?? '', message_id: index + 1 },
    });
  });
}

/**
 * Helper to extract reply messages from a mock context for assertions.
 */
export function getReplyMessages(ctx: MockContext): string[] {
  return ctx.reply.mock.calls.map((call: unknown[]) => {
    const message = call[0];
    return typeof message === 'string' ? message : JSON.stringify(message);
  });
}

/**
 * Helper to check if a specific text was included in any reply.
 */
export function replyContains(ctx: MockContext, text: string): boolean {
  return getReplyMessages(ctx).some((msg) => msg.includes(text));
}

/**
 * Helper to get the last reply message from a mock context.
 */
export function getLastReply(ctx: MockContext): string | undefined {
  const messages = getReplyMessages(ctx);
  return messages[messages.length - 1];
}
