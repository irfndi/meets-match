import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'grammy';
import { Effect } from 'effect';

// Mock the services to return Effect values
vi.mock('../services/matchService.js', () => ({
  matchService: {
    getMatchList: vi.fn(),
  },
}));

vi.mock('../services/userService.js', () => ({
  userService: {
    getUser: vi.fn(),
  },
}));

import { matchService } from '../services/matchService.js';
import { userService } from '../services/userService.js';
import { matchesCommand, matchesCallbacks } from './matches.js';

describe('Matches List Handler', () => {
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

  describe('matchesCommand', () => {
    it('should show no matches message when list is empty', async () => {
      vi.mocked(matchService.getMatchList).mockReturnValue(Effect.succeed({ matches: [] }));

      await matchesCommand(mockCtx as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining("don't have any matches"),
        expect.any(Object),
      );
    });

    it('should display matches list when matches exist', async () => {
      const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

      vi.mocked(matchService.getMatchList).mockReturnValue(
        Effect.succeed({
          matches: [
            {
              id: 'match1',
              user1Id: '12345',
              user2Id: 'user2',
              status: 'matched',
              matchedAt: { seconds: nowSeconds },
            },
          ],
        }),
      );

      vi.mocked(userService.getUser).mockReturnValue(
        Effect.succeed({
          user: {
            id: 'user2',
            firstName: 'Jane',
            age: 25,
          },
        }),
      );

      await matchesCommand(mockCtx as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Your Matches'),
        expect.any(Object),
      );
    });

    it('should not process if no user ID', async () => {
      mockCtx.from = undefined;

      await matchesCommand(mockCtx as Context);

      expect(matchService.getMatchList).not.toHaveBeenCalled();
    });
  });

  describe('matchesCallbacks', () => {
    it('should handle matches_close callback', async () => {
      mockCtx.callbackQuery = { data: 'matches_close' } as any;

      await matchesCallbacks(mockCtx as Context);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalled();
      expect(mockCtx.deleteMessage).toHaveBeenCalled();
    });

    it('should show user profile on view_match_user_', async () => {
      mockCtx.callbackQuery = { data: 'view_match_user_user2' } as any;

      vi.mocked(userService.getUser).mockReturnValue(
        Effect.succeed({
          user: {
            id: 'user2',
            firstName: 'Jane',
            age: 25,
            gender: 'female',
            bio: 'Hello!',
            interests: ['music'],
            location: { city: 'Seoul', country: 'South Korea' },
          },
        }),
      );

      await matchesCallbacks(mockCtx as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Jane'),
        expect.any(Object),
      );
    });

    it("should show not found message if user doesn't exist", async () => {
      mockCtx.callbackQuery = { data: 'view_match_user_unknown' } as any;

      vi.mocked(userService.getUser).mockReturnValue(Effect.succeed({ user: null }));

      await matchesCallbacks(mockCtx as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith('User not found.');
    });

    it('should handle back_to_matches callback', async () => {
      mockCtx.callbackQuery = { data: 'back_to_matches' } as any;

      vi.mocked(matchService.getMatchList).mockReturnValue(Effect.succeed({ matches: [] }));

      await matchesCallbacks(mockCtx as Context);

      expect(mockCtx.deleteMessage).toHaveBeenCalled();
    });
  });
});
