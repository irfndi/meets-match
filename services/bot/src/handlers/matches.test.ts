import { Effect } from 'effect';
import type { Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGetMatchListResponse,
  createGetUserResponse,
  createMockContext,
  createMockLocation,
  createMockMatch,
  createMockTimestamp,
  createMockUser,
} from '../test/fixtures.js';

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
import { matchesCallbacks, matchesCommand } from './matches.js';

describe('Matches List Handler', () => {
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = createMockContext();
  });

  describe('matchesCommand', () => {
    it('should show no matches message when list is empty', async () => {
      vi.mocked(matchService.getMatchList).mockReturnValue(
        Effect.succeed(createGetMatchListResponse([])),
      );

      await matchesCommand(mockCtx as unknown as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining("don't have any matches"),
        expect.any(Object),
      );
    });

    it('should display matches list when matches exist', async () => {
      const matchedAt = createMockTimestamp(new Date());
      const match = createMockMatch({
        id: 'match1',
        user1Id: '12345',
        user2Id: 'user2',
        status: 'matched',
        matchedAt: matchedAt,
      });

      vi.mocked(matchService.getMatchList).mockReturnValue(
        Effect.succeed(createGetMatchListResponse([match])),
      );

      const otherUser = createMockUser({
        id: 'user2',
        firstName: 'Jane',
        age: 25,
      });

      vi.mocked(userService.getUser).mockReturnValue(
        Effect.succeed(createGetUserResponse(otherUser)),
      );

      await matchesCommand(mockCtx as unknown as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Your Matches'),
        expect.any(Object),
      );
    });

    it('should not process if no user ID', async () => {
      mockCtx.from = undefined;

      await matchesCommand(mockCtx as unknown as Context);

      expect(matchService.getMatchList).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(matchService.getMatchList).mockReturnValue(Effect.fail(new Error('Network error')));

      await matchesCommand(mockCtx as unknown as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('something went wrong'),
        expect.any(Object),
      );
    });

    it('should show no matches when user fetches fail', async () => {
      const match = createMockMatch({
        id: 'match1',
        user1Id: '12345',
        user2Id: 'user2',
        status: 'matched',
        matchedAt: createMockTimestamp(),
      });

      vi.mocked(matchService.getMatchList).mockReturnValue(
        Effect.succeed(createGetMatchListResponse([match])),
      );

      vi.mocked(userService.getUser).mockReturnValue(Effect.fail(new Error('User not found')));

      await matchesCommand(mockCtx as unknown as Context);

      // Should still render, but without the user info
      expect(mockCtx.reply).toHaveBeenCalled();
    });
  });

  describe('matchesCallbacks', () => {
    it('should handle matches_close callback', async () => {
      mockCtx.callbackQuery = { data: 'matches_close' } as any;

      await matchesCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalled();
      expect(mockCtx.deleteMessage).toHaveBeenCalled();
    });

    it('should show user profile on view_match_user_', async () => {
      mockCtx.callbackQuery = { data: 'view_match_user_user2' } as any;

      const otherUser = createMockUser({
        id: 'user2',
        firstName: 'Jane',
        age: 25,
        gender: 'female',
        bio: 'Hello!',
        interests: ['music'],
        location: createMockLocation({ city: 'Seoul', country: 'South Korea' }),
      });

      vi.mocked(userService.getUser).mockReturnValue(
        Effect.succeed(createGetUserResponse(otherUser)),
      );

      await matchesCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Jane'),
        expect.any(Object),
      );
    });

    it("should show not found message if user doesn't exist", async () => {
      mockCtx.callbackQuery = { data: 'view_match_user_unknown' } as any;

      vi.mocked(userService.getUser).mockReturnValue(Effect.succeed(createGetUserResponse(null)));

      await matchesCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith('User not found.');
    });

    it('should handle back_to_matches callback', async () => {
      mockCtx.callbackQuery = { data: 'back_to_matches' } as any;

      vi.mocked(matchService.getMatchList).mockReturnValue(
        Effect.succeed(createGetMatchListResponse([])),
      );

      await matchesCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.deleteMessage).toHaveBeenCalled();
    });

    it('should do nothing if no callback data', async () => {
      mockCtx.callbackQuery = undefined;

      await matchesCallbacks(mockCtx as unknown as Context);

      expect(userService.getUser).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully when viewing user', async () => {
      mockCtx.callbackQuery = { data: 'view_match_user_user2' } as any;

      vi.mocked(userService.getUser).mockReturnValue(Effect.fail(new Error('Network error')));

      await matchesCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalledWith('Something went wrong');
    });
  });
});
