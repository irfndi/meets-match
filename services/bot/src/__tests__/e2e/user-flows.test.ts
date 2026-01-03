/**
 * E2E Tests for all user flows in the MeetMatch bot.
 *
 * These tests simulate complete user journeys through the bot,
 * testing command handlers and callback interactions.
 *
 * Note: These tests mock the services to control responses.
 * For true integration tests, see ../integration/bot-api.test.ts
 */

import { Code, ConnectError } from '@connectrpc/connect';
import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCreateMatchResponse,
  createDislikeMatchResponse,
  createGetMatchListResponse,
  createGetMatchResponse,
  createGetPotentialMatchesResponse,
  createGetUserResponse,
  createLikeMatchResponse,
  createMockCallbackContext,
  createMockContext,
  createMockMatch,
  createMockUser,
  createUpdateUserResponse,
  replyContains,
} from '../../test/fixtures.js';

// Mock services
vi.mock('../../services/userService.js', () => ({
  userService: {
    createUser: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
  },
}));

vi.mock('../../services/matchService.js', () => ({
  matchService: {
    getPotentialMatches: vi.fn(),
    createMatch: vi.fn(),
    likeMatch: vi.fn(),
    dislikeMatch: vi.fn(),
    getMatchList: vi.fn(),
    getMatch: vi.fn(),
    skipMatch: vi.fn(),
  },
}));

import { handleDislike, handleLike, matchCallbacks, matchCommand } from '../../handlers/match.js';
import { matchesCallbacks, matchesCommand } from '../../handlers/matches.js';
import { profileCommand } from '../../handlers/profile.js';
import { settingsCallbacks, settingsCommand } from '../../handlers/settings.js';
// Import handlers after mocking
import { startCommand } from '../../handlers/start.js';
import { matchService } from '../../services/matchService.js';
import { userService } from '../../services/userService.js';

describe('E2E: New User Onboarding Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete: /start -> creates user -> shows welcome', async () => {
    // Arrange
    const ctx = createMockContext({
      from: { id: 123456, username: 'newuser', first_name: 'New', last_name: 'User' },
    });
    const mockUser = createMockUser({ id: '123456', firstName: 'New' });

    vi.mocked(userService.createUser).mockReturnValue(Effect.succeed({ user: mockUser }) as any);

    // Act
    await startCommand(ctx as any);

    // Assert
    expect(userService.createUser).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, 'Welcome to MeetMatch')).toBe(true);
    expect(replyContains(ctx, '/profile')).toBe(true);
    expect(replyContains(ctx, '/match')).toBe(true);
  });

  it('should handle returning user with /start (AlreadyExists)', async () => {
    // Arrange
    const ctx = createMockContext({
      from: { id: 123456, username: 'existinguser' },
    });

    // Simulate AlreadyExists error
    vi.mocked(userService.createUser).mockReturnValue(
      Effect.fail(new ConnectError('User exists', Code.AlreadyExists)) as any,
    );

    // Act
    await startCommand(ctx as any);

    // Assert - should still show welcome message
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, 'Welcome to MeetMatch')).toBe(true);
  });
});

describe('E2E: Profile Management Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show profile with /profile command', async () => {
    // Arrange
    const mockUser = createMockUser({
      id: '12345',
      firstName: 'Test',
      lastName: 'User',
      age: 28,
      gender: 'male',
      bio: 'Hello world',
    });

    const ctx = createMockContext({ from: { id: 12345 } });
    vi.mocked(userService.getUser).mockReturnValue(
      Effect.succeed(createGetUserResponse(mockUser)) as any,
    );

    // Act
    await profileCommand(ctx as any);

    // Assert
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, 'Profile')).toBe(true);
    expect(replyContains(ctx, 'Test')).toBe(true);
    expect(replyContains(ctx, '28')).toBe(true);
  });

  it('should handle user not found (no /start)', async () => {
    // Arrange
    const ctx = createMockContext({ from: { id: 99999 } });
    vi.mocked(userService.getUser).mockReturnValue(
      Effect.fail(new ConnectError('Not found', Code.NotFound)) as any,
    );

    // Act
    await profileCommand(ctx as any);

    // Assert
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, '/start')).toBe(true);
  });

  it('should handle null user response', async () => {
    // Arrange
    const ctx = createMockContext({ from: { id: 12345 } });
    vi.mocked(userService.getUser).mockReturnValue(
      Effect.succeed(createGetUserResponse(null)) as any,
    );

    // Act
    await profileCommand(ctx as any);

    // Assert
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, '/start')).toBe(true);
  });
});

describe('E2E: Matching Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete: /match -> shows potential match', async () => {
    // Arrange
    const potentialMatch = createMockUser({
      id: 'match123',
      firstName: 'Jane',
      age: 25,
      gender: 'female',
      bio: 'Love hiking',
      interests: ['hiking', 'photography'],
    });

    const createdMatch = createMockMatch({
      id: 'matchRecord123',
      user1Id: '12345',
      user2Id: 'match123',
    });

    const ctx = createMockContext({ from: { id: 12345 } });
    vi.mocked(matchService.getPotentialMatches).mockReturnValue(
      Effect.succeed(createGetPotentialMatchesResponse([potentialMatch])) as any,
    );
    vi.mocked(matchService.createMatch).mockReturnValue(
      Effect.succeed(createCreateMatchResponse(createdMatch)) as any,
    );

    // Act
    await matchCommand(ctx as any);

    // Assert
    expect(matchService.getPotentialMatches).toHaveBeenCalledWith('12345', 1);
    expect(matchService.createMatch).toHaveBeenCalledWith('12345', 'match123');
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, 'Jane')).toBe(true);
    expect(replyContains(ctx, '25')).toBe(true);
    expect(replyContains(ctx, 'Do you like this match')).toBe(true);
    // Verify inline keyboard with Like/Pass buttons was passed
    const replyCall = ctx.reply.mock.calls[0];
    expect(replyCall[1]).toHaveProperty('reply_markup');
  });

  it('should handle no potential matches scenario', async () => {
    // Arrange
    const ctx = createMockContext({ from: { id: 12345 } });
    vi.mocked(matchService.getPotentialMatches).mockReturnValue(
      Effect.succeed(createGetPotentialMatchesResponse([])) as any,
    );

    // Act
    await matchCommand(ctx as any);

    // Assert
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, 'No potential matches')).toBe(true);
  });

  it('should handle like action -> liked message (not mutual)', async () => {
    // Arrange
    const ctx = createMockCallbackContext('like_match123', { from: { id: 12345 } });
    vi.mocked(matchService.likeMatch).mockReturnValue(
      Effect.succeed(createLikeMatchResponse(false, createMockMatch())) as any,
    );

    // Act
    await handleLike(ctx as any, 'match123');

    // Assert
    expect(matchService.likeMatch).toHaveBeenCalledWith('match123', '12345');
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalled();
    // Should show "Liked!" message
  });

  it('should handle like action -> mutual match notification', async () => {
    // Arrange
    const matchedMatch = createMockMatch({
      id: 'match123',
      user1Id: '12345',
      user2Id: 'other123',
      status: 'matched',
    });

    const ctx = createMockCallbackContext('like_match123', { from: { id: 12345 } });
    vi.mocked(matchService.likeMatch).mockReturnValue(
      Effect.succeed(createLikeMatchResponse(true, matchedMatch)) as any,
    );
    vi.mocked(matchService.getMatch).mockReturnValue(
      Effect.succeed(createGetMatchResponse(matchedMatch)) as any,
    );

    // Act
    await handleLike(ctx as any, 'match123');

    // Assert
    expect(matchService.likeMatch).toHaveBeenCalledWith('match123', '12345');
    expect(ctx.editMessageText).toHaveBeenCalled();
    // Should show "It's a Match!" message
  });

  it('should handle dislike action -> passed message', async () => {
    // Arrange
    const ctx = createMockCallbackContext('dislike_match123', { from: { id: 12345 } });
    vi.mocked(matchService.dislikeMatch).mockReturnValue(
      Effect.succeed(createDislikeMatchResponse(createMockMatch())) as any,
    );

    // Act
    await handleDislike(ctx as any, 'match123');

    // Assert
    expect(matchService.dislikeMatch).toHaveBeenCalledWith('match123', '12345');
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalled();
    // Should show "Passed" message
  });

  it('should handle next_match callback', async () => {
    // Arrange
    const potentialMatch = createMockUser({ id: 'next123', firstName: 'NextPerson' });
    const createdMatch = createMockMatch({ id: 'newMatch' });

    const ctx = createMockCallbackContext('next_match', { from: { id: 12345 } });
    vi.mocked(matchService.getPotentialMatches).mockReturnValue(
      Effect.succeed(createGetPotentialMatchesResponse([potentialMatch])) as any,
    );
    vi.mocked(matchService.createMatch).mockReturnValue(
      Effect.succeed(createCreateMatchResponse(createdMatch)) as any,
    );

    // Act
    await matchCallbacks(ctx as any);

    // Assert
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.deleteMessage).toHaveBeenCalled();
  });
});

describe('E2E: Matches List Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show mutual matches with /matches', async () => {
    // Arrange
    const match1 = createMockMatch({
      id: 'mutualMatch1',
      user1Id: '12345',
      user2Id: 'partner1',
      status: 'matched',
    });

    const partnerUser = createMockUser({
      id: 'partner1',
      firstName: 'Partner',
      age: 26,
    });

    const ctx = createMockContext({ from: { id: 12345 } });
    vi.mocked(matchService.getMatchList).mockReturnValue(
      Effect.succeed(createGetMatchListResponse([match1])) as any,
    );
    vi.mocked(userService.getUser).mockReturnValue(
      Effect.succeed(createGetUserResponse(partnerUser)) as any,
    );

    // Act
    await matchesCommand(ctx as any);

    // Assert
    expect(matchService.getMatchList).toHaveBeenCalledWith('12345');
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, 'Your Matches')).toBe(true);
    expect(replyContains(ctx, 'Partner')).toBe(true);
  });

  it('should handle empty matches list', async () => {
    // Arrange
    const ctx = createMockContext({ from: { id: 12345 } });
    vi.mocked(matchService.getMatchList).mockReturnValue(
      Effect.succeed(createGetMatchListResponse([])) as any,
    );

    // Act
    await matchesCommand(ctx as any);

    // Assert
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, "don't have any matches")).toBe(true);
    expect(replyContains(ctx, '/match')).toBe(true);
  });

  it('should view match profile from list', async () => {
    // Arrange
    const matchedUser = createMockUser({
      id: 'viewUser123',
      firstName: 'ViewPerson',
      age: 27,
      gender: 'female',
      bio: 'Test bio',
      interests: ['reading', 'travel'],
    });

    const ctx = createMockCallbackContext('view_match_user_viewUser123', { from: { id: 12345 } });
    vi.mocked(userService.getUser).mockReturnValue(
      Effect.succeed(createGetUserResponse(matchedUser)) as any,
    );

    // Act
    await matchesCallbacks(ctx as any);

    // Assert
    expect(userService.getUser).toHaveBeenCalledWith('viewUser123');
    expect(ctx.editMessageText).toHaveBeenCalled();
  });

  it('should handle matches_close callback', async () => {
    // Arrange
    const ctx = createMockCallbackContext('matches_close', { from: { id: 12345 } });

    // Act
    await matchesCallbacks(ctx as any);

    // Assert
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.deleteMessage).toHaveBeenCalled();
  });
});

describe('E2E: Settings Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show settings menu with /settings', async () => {
    // Arrange
    const userWithPrefs = createMockUser({
      id: '12345',
      preferences: {
        minAge: 20,
        maxAge: 35,
        genderPreference: ['female'],
        maxDistance: 50,
        notificationsEnabled: true,
        preferredLanguage: 'en',
      },
    });

    const ctx = createMockContext({ from: { id: 12345 } });
    vi.mocked(userService.getUser).mockReturnValue(
      Effect.succeed(createGetUserResponse(userWithPrefs)) as any,
    );

    // Act
    await settingsCommand(ctx as any);

    // Assert
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, 'Settings')).toBe(true);
    expect(replyContains(ctx, 'Age Range')).toBe(true);
    expect(replyContains(ctx, '20 - 35')).toBe(true);
  });

  it('should update age range preference', async () => {
    // Arrange
    const ctx = createMockCallbackContext('age_25_35', { from: { id: 12345 } });
    vi.mocked(userService.updateUser).mockReturnValue(
      Effect.succeed(createUpdateUserResponse(createMockUser())) as any,
    );

    // Act
    await settingsCallbacks(ctx as any);

    // Assert
    expect(userService.updateUser).toHaveBeenCalledWith('12345', {
      preferences: { minAge: 25, maxAge: 35 },
    });
    expect(ctx.editMessageText).toHaveBeenCalled();
  });

  it('should update distance preference', async () => {
    // Arrange
    const ctx = createMockCallbackContext('dist_50', { from: { id: 12345 } });
    vi.mocked(userService.updateUser).mockReturnValue(
      Effect.succeed(createUpdateUserResponse(createMockUser())) as any,
    );

    // Act
    await settingsCallbacks(ctx as any);

    // Assert
    expect(userService.updateUser).toHaveBeenCalledWith('12345', {
      preferences: { maxDistance: 50 },
    });
  });

  it('should update gender preference', async () => {
    // Arrange
    const ctx = createMockCallbackContext('gender_pref_female', { from: { id: 12345 } });
    vi.mocked(userService.updateUser).mockReturnValue(
      Effect.succeed(createUpdateUserResponse(createMockUser())) as any,
    );

    // Act
    await settingsCallbacks(ctx as any);

    // Assert
    expect(userService.updateUser).toHaveBeenCalledWith('12345', {
      preferences: { genderPreference: ['female'] },
    });
  });

  it('should toggle notifications', async () => {
    // Arrange - user has notifications enabled
    const userWithNotifs = createMockUser({
      id: '12345',
      preferences: { notificationsEnabled: true },
    });

    const ctx = createMockCallbackContext('settings_notifications', { from: { id: 12345 } });
    vi.mocked(userService.getUser).mockReturnValue(
      Effect.succeed(createGetUserResponse(userWithNotifs)) as any,
    );
    vi.mocked(userService.updateUser).mockReturnValue(
      Effect.succeed(createUpdateUserResponse(createMockUser())) as any,
    );

    // Act
    await settingsCallbacks(ctx as any);

    // Assert - should toggle to disabled
    expect(userService.updateUser).toHaveBeenCalledWith('12345', {
      preferences: { notificationsEnabled: false },
    });
  });

  it('should update language preference', async () => {
    // Arrange
    const ctx = createMockCallbackContext('lang_es', { from: { id: 12345 } });
    vi.mocked(userService.updateUser).mockReturnValue(
      Effect.succeed(createUpdateUserResponse(createMockUser())) as any,
    );

    // Act
    await settingsCallbacks(ctx as any);

    // Assert
    expect(userService.updateUser).toHaveBeenCalledWith('12345', {
      preferences: { preferredLanguage: 'es' },
    });
  });

  it('should close settings menu', async () => {
    // Arrange
    const ctx = createMockCallbackContext('settings_close', { from: { id: 12345 } });

    // Act
    await settingsCallbacks(ctx as any);

    // Assert
    expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    expect(ctx.deleteMessage).toHaveBeenCalled();
  });

  it('should show age range sub-menu', async () => {
    // Arrange
    const ctx = createMockCallbackContext('settings_age_range', { from: { id: 12345 } });

    // Act
    await settingsCallbacks(ctx as any);

    // Assert
    expect(ctx.editMessageText).toHaveBeenCalled();
  });

  it('should show distance sub-menu', async () => {
    // Arrange
    const ctx = createMockCallbackContext('settings_distance', { from: { id: 12345 } });

    // Act
    await settingsCallbacks(ctx as any);

    // Assert
    expect(ctx.editMessageText).toHaveBeenCalled();
  });

  it('should show gender preference sub-menu', async () => {
    // Arrange
    const ctx = createMockCallbackContext('settings_gender', { from: { id: 12345 } });

    // Act
    await settingsCallbacks(ctx as any);

    // Assert
    expect(ctx.editMessageText).toHaveBeenCalled();
  });

  it('should show language sub-menu', async () => {
    // Arrange
    const ctx = createMockCallbackContext('settings_language', { from: { id: 12345 } });

    // Act
    await settingsCallbacks(ctx as any);

    // Assert
    expect(ctx.editMessageText).toHaveBeenCalled();
  });
});

describe('E2E: Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle service errors gracefully in match command', async () => {
    // Arrange
    const ctx = createMockContext({ from: { id: 12345 } });
    vi.mocked(matchService.getPotentialMatches).mockReturnValue(
      Effect.fail(new Error('Service unavailable')) as any,
    );

    // Act
    await matchCommand(ctx as any);

    // Assert - should show error message, not crash
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, 'wrong')).toBe(true);
  });

  it('should handle service errors gracefully in settings', async () => {
    // Arrange
    const ctx = createMockContext({ from: { id: 12345 } });
    vi.mocked(userService.getUser).mockReturnValue(Effect.fail(new Error('Database error')) as any);

    // Act
    await settingsCommand(ctx as any);

    // Assert
    expect(ctx.reply).toHaveBeenCalled();
    expect(replyContains(ctx, 'wrong')).toBe(true);
  });

  it('should handle missing ctx.from gracefully', async () => {
    // Arrange
    const ctx = createMockContext({ from: undefined });

    // Act - should not throw
    await matchCommand(ctx as any);
    await settingsCommand(ctx as any);
    await matchesCommand(ctx as any);

    // Assert - no crash
    expect(true).toBe(true);
  });
});

describe('E2E: Complete User Journey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete full journey: start -> profile -> match -> mutual -> view matches', async () => {
    const userId = 12345;
    const partnerId = 'partner123';

    // Step 1: Start command
    const startCtx = createMockContext({
      from: { id: userId, username: 'journeyuser', first_name: 'Journey' },
    });
    vi.mocked(userService.createUser).mockReturnValue(
      Effect.succeed({ user: createMockUser({ id: String(userId) }) }) as any,
    );
    await startCommand(startCtx as any);
    expect(replyContains(startCtx, 'Welcome')).toBe(true);

    // Step 2: View profile
    const profileCtx = createMockContext({ from: { id: userId } });
    vi.mocked(userService.getUser).mockReturnValue(
      Effect.succeed(
        createGetUserResponse(createMockUser({ id: String(userId), firstName: 'Journey' })),
      ) as any,
    );
    await profileCommand(profileCtx as any);
    expect(replyContains(profileCtx, 'Journey')).toBe(true);

    // Step 3: Start matching
    const matchCtx = createMockContext({ from: { id: userId } });
    const potentialMatch = createMockUser({ id: partnerId, firstName: 'Partner' });
    const createdMatch = createMockMatch({
      id: 'journey-match',
      user1Id: String(userId),
      user2Id: partnerId,
    });

    vi.mocked(matchService.getPotentialMatches).mockReturnValue(
      Effect.succeed(createGetPotentialMatchesResponse([potentialMatch])) as any,
    );
    vi.mocked(matchService.createMatch).mockReturnValue(
      Effect.succeed(createCreateMatchResponse(createdMatch)) as any,
    );
    await matchCommand(matchCtx as any);
    expect(replyContains(matchCtx, 'Partner')).toBe(true);

    // Step 4: Like and get mutual match
    const likeCtx = createMockCallbackContext('like_journey-match', { from: { id: userId } });
    vi.mocked(matchService.likeMatch).mockReturnValue(
      Effect.succeed(createLikeMatchResponse(true, createdMatch)) as any,
    );
    vi.mocked(matchService.getMatch).mockReturnValue(
      Effect.succeed(createGetMatchResponse(createdMatch)) as any,
    );
    await handleLike(likeCtx as any, 'journey-match');
    expect(likeCtx.editMessageText).toHaveBeenCalled();

    // Step 5: View matches list
    const matchesCtx = createMockContext({ from: { id: userId } });
    vi.mocked(matchService.getMatchList).mockReturnValue(
      Effect.succeed(createGetMatchListResponse([createdMatch])) as any,
    );
    vi.mocked(userService.getUser).mockReturnValue(
      Effect.succeed(createGetUserResponse(potentialMatch)) as any,
    );
    await matchesCommand(matchesCtx as any);
    expect(replyContains(matchesCtx, 'Your Matches')).toBe(true);
    expect(replyContains(matchesCtx, 'Partner')).toBe(true);
  });
});
