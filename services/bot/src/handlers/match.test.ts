import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'grammy';
import { Effect } from 'effect';

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
  let mockCtx: Partial<Context>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = {
      from: { id: 12345 } as any,
      reply: vi.fn().mockResolvedValue({}),
      callbackQuery: undefined,
      answerCallbackQuery: vi.fn().mockResolvedValue({}),
      editMessageText: vi.fn().mockResolvedValue({}),
      deleteMessage: vi.fn().mockResolvedValue({}),
    };
  });

  describe('matchCommand', () => {
    it('should show no matches message when no potential matches', async () => {
      vi.mocked(matchService.getPotentialMatches).mockReturnValue(
        Effect.succeed({ potentialMatches: [] }),
      );

      await matchCommand(mockCtx as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('No potential matches'),
        expect.any(Object),
      );
    });

    it('should display match profile when matches exist', async () => {
      vi.mocked(matchService.getPotentialMatches).mockReturnValue(
        Effect.succeed({
          potentialMatches: [
            {
              id: 'user2',
              firstName: 'Jane',
              age: 25,
              gender: 'female',
              bio: 'Hello!',
              interests: ['music', 'travel'],
              location: { city: 'Seoul', country: 'South Korea' },
            },
          ],
        }),
      );

      vi.mocked(matchService.createMatch).mockReturnValue(
        Effect.succeed({ match: { id: 'match123' } }),
      );

      await matchCommand(mockCtx as Context);

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

      await matchCommand(mockCtx as Context);

      expect(matchService.getPotentialMatches).not.toHaveBeenCalled();
    });
  });

  describe('matchCallbacks', () => {
    it('should handle next_match callback', async () => {
      mockCtx.callbackQuery = { data: 'next_match' } as any;

      vi.mocked(matchService.getPotentialMatches).mockReturnValue(
        Effect.succeed({ potentialMatches: [] }),
      );

      await matchCallbacks(mockCtx as Context);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalled();
    });

    it('should route like_ callback correctly', async () => {
      mockCtx.callbackQuery = { data: 'like_match123' } as any;

      vi.mocked(matchService.likeMatch).mockReturnValue(
        Effect.succeed({
          isMutual: false,
          match: { id: 'match123' },
        }),
      );

      await matchCallbacks(mockCtx as Context);

      expect(matchService.likeMatch).toHaveBeenCalledWith('match123', '12345');
    });

    it('should route dislike_ callback correctly', async () => {
      mockCtx.callbackQuery = { data: 'dislike_match123' } as any;

      vi.mocked(matchService.dislikeMatch).mockReturnValue(
        Effect.succeed({ match: { id: 'match123' } }),
      );

      await matchCallbacks(mockCtx as Context);

      expect(matchService.dislikeMatch).toHaveBeenCalledWith('match123', '12345');
    });
  });

  describe('handleLike', () => {
    it('should show mutual match message when mutual', async () => {
      vi.mocked(matchService.likeMatch).mockReturnValue(
        Effect.succeed({
          isMutual: true,
          match: { id: 'match123', user1Id: '12345', user2Id: 'user2' },
        }),
      );

      vi.mocked(matchService.getMatch).mockReturnValue(
        Effect.succeed({
          match: { id: 'match123', user1Id: '12345', user2Id: 'user2' },
        }),
      );

      await handleLike(mockCtx as Context, 'match123');

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining("It's a Match"),
        expect.any(Object),
      );
    });

    it('should show liked message when not mutual', async () => {
      vi.mocked(matchService.likeMatch).mockReturnValue(
        Effect.succeed({
          isMutual: false,
          match: { id: 'match123' },
        }),
      );

      await handleLike(mockCtx as Context, 'match123');

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Liked'),
        expect.any(Object),
      );
    });
  });

  describe('handleDislike', () => {
    it('should show passed message', async () => {
      vi.mocked(matchService.dislikeMatch).mockReturnValue(
        Effect.succeed({ match: { id: 'match123' } }),
      );

      await handleDislike(mockCtx as Context, 'match123');

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Passed'),
        expect.any(Object),
      );
    });
  });
});
