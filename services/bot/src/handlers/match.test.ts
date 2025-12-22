import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'grammy';
import { Effect } from 'effect';

import {
  createMockUser,
  createMockMatch,
  createMockLocation,
  createGetPotentialMatchesResponse,
  createCreateMatchResponse,
  createLikeMatchResponse,
  createDislikeMatchResponse,
  createGetMatchResponse,
  createMockContext,
} from '../test/fixtures.js';

// Mock the services to return Effect values
vi.mock('../services/matchService.js', () => ({
  matchService: {
    getPotentialMatches: vi.fn(),
    createMatch: vi.fn(),
    likeMatch: vi.fn(),
    dislikeMatch: vi.fn(),
    getMatch: vi.fn(),
  },
}));

vi.mock('../services/userService.js', () => ({
  userService: {
    getUser: vi.fn(),
  },
}));

import { matchService } from '../services/matchService.js';
import { matchCommand, matchCallbacks, handleLike, handleDislike } from './match.js';

describe('Match Handler', () => {
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = createMockContext();
  });

  describe('matchCommand', () => {
    it('should show no matches message when no potential matches', async () => {
      vi.mocked(matchService.getPotentialMatches).mockReturnValue(
        Effect.succeed(createGetPotentialMatchesResponse([])),
      );

      await matchCommand(mockCtx as unknown as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('No potential matches'),
        expect.any(Object),
      );
    });

    it('should display match profile when matches exist', async () => {
      const potentialUser = createMockUser({
        id: 'user2',
        firstName: 'Jane',
        age: 25,
        gender: 'female',
        bio: 'Hello!',
        interests: ['music', 'travel'],
        location: createMockLocation({ city: 'Seoul', country: 'South Korea' }),
      });

      vi.mocked(matchService.getPotentialMatches).mockReturnValue(
        Effect.succeed(createGetPotentialMatchesResponse([potentialUser])),
      );

      vi.mocked(matchService.createMatch).mockReturnValue(
        Effect.succeed(createCreateMatchResponse(createMockMatch({ id: 'match123' }))),
      );

      await matchCommand(mockCtx as unknown as Context);

      expect(matchService.createMatch).toHaveBeenCalledWith('12345', 'user2');
      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Jane'),
        expect.objectContaining({
          parse_mode: 'Markdown',
        }),
      );
    });

    it('should not process if no user ID', async () => {
      mockCtx.from = undefined;

      await matchCommand(mockCtx as unknown as Context);

      expect(matchService.getPotentialMatches).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(matchService.getPotentialMatches).mockReturnValue(
        Effect.fail(new Error('Network error')),
      );

      await matchCommand(mockCtx as unknown as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('something went wrong'),
        expect.any(Object),
      );
    });
  });

  describe('matchCallbacks', () => {
    it('should handle next_match callback', async () => {
      mockCtx.callbackQuery = { data: 'next_match' } as any;

      vi.mocked(matchService.getPotentialMatches).mockReturnValue(
        Effect.succeed(createGetPotentialMatchesResponse([])),
      );

      await matchCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalled();
    });

    it('should handle view_matches callback', async () => {
      mockCtx.callbackQuery = { data: 'view_matches' } as any;

      await matchCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalled();
      expect(mockCtx.reply).toHaveBeenCalled();
    });

    it('should route like_ callback correctly', async () => {
      mockCtx.callbackQuery = { data: 'like_match123' } as any;

      vi.mocked(matchService.likeMatch).mockReturnValue(
        Effect.succeed(
          createLikeMatchResponse(false, createMockMatch({ id: 'match123' })),
        ),
      );

      await matchCallbacks(mockCtx as unknown as Context);

      expect(matchService.likeMatch).toHaveBeenCalledWith('match123', '12345');
    });

    it('should route dislike_ callback correctly', async () => {
      mockCtx.callbackQuery = { data: 'dislike_match123' } as any;

      vi.mocked(matchService.dislikeMatch).mockReturnValue(
        Effect.succeed(createDislikeMatchResponse(createMockMatch({ id: 'match123' }))),
      );

      await matchCallbacks(mockCtx as unknown as Context);

      expect(matchService.dislikeMatch).toHaveBeenCalledWith('match123', '12345');
    });

    it('should do nothing if no callback data', async () => {
      mockCtx.callbackQuery = undefined;

      await matchCallbacks(mockCtx as unknown as Context);

      expect(matchService.likeMatch).not.toHaveBeenCalled();
      expect(matchService.dislikeMatch).not.toHaveBeenCalled();
    });
  });

  describe('handleLike', () => {
    it('should show mutual match message when mutual', async () => {
      const match = createMockMatch({
        id: 'match123',
        user1Id: '12345',
        user2Id: 'user2',
        status: 'matched',
      });

      vi.mocked(matchService.likeMatch).mockReturnValue(
        Effect.succeed(createLikeMatchResponse(true, match)),
      );

      vi.mocked(matchService.getMatch).mockReturnValue(
        Effect.succeed(createGetMatchResponse(match)),
      );

      await handleLike(mockCtx as unknown as Context, 'match123');

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("It's a Match"),
        expect.any(Object),
      );
    });

    it('should show liked message when not mutual', async () => {
      vi.mocked(matchService.likeMatch).mockReturnValue(
        Effect.succeed(
          createLikeMatchResponse(false, createMockMatch({ id: 'match123' })),
        ),
      );

      await handleLike(mockCtx as unknown as Context, 'match123');

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Liked'),
        expect.any(Object),
      );
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(matchService.likeMatch).mockReturnValue(
        Effect.fail(new Error('Network error')),
      );

      await handleLike(mockCtx as unknown as Context, 'match123');

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Something went wrong');
    });
  });

  describe('handleDislike', () => {
    it('should show passed message', async () => {
      vi.mocked(matchService.dislikeMatch).mockReturnValue(
        Effect.succeed(createDislikeMatchResponse(createMockMatch({ id: 'match123' }))),
      );

      await handleDislike(mockCtx as unknown as Context, 'match123');

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Passed'),
        expect.any(Object),
      );
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(matchService.dislikeMatch).mockReturnValue(
        Effect.fail(new Error('Network error')),
      );

      await handleDislike(mockCtx as unknown as Context, 'match123');

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Something went wrong');
    });
  });
});
