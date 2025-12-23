import { Effect } from 'effect';
import type { Context } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createGetUserResponse,
  createMockContext,
  createMockPreferences,
  createMockUser,
  createUpdateUserResponse,
} from '../test/fixtures.js';

// Mock the services to return Effect values
vi.mock('../services/userService.js', () => ({
  userService: {
    getUser: vi.fn(),
    updateUser: vi.fn(),
  },
}));

import { userService } from '../services/userService.js';
import { settingsCallbacks, settingsCommand } from './settings.js';

describe('Settings Handler', () => {
  let mockCtx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCtx = createMockContext();
  });

  describe('settingsCommand', () => {
    it('should display settings menu', async () => {
      const user = createMockUser({
        id: '12345',
        preferences: createMockPreferences({
          minAge: 20,
          maxAge: 30,
          maxDistance: 25,
          notificationsEnabled: true,
        }),
      });

      vi.mocked(userService.getUser).mockReturnValue(Effect.succeed(createGetUserResponse(user)));

      await settingsCommand(mockCtx as unknown as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Settings'),
        expect.objectContaining({
          parse_mode: 'Markdown',
        }),
      );
    });

    it('should show no preferences message when empty', async () => {
      const user = createMockUser({
        id: '12345',
        preferences: createMockPreferences({
          minAge: 0,
          maxAge: 0,
          maxDistance: 0,
          notificationsEnabled: false,
          genderPreference: [],
          preferredLanguage: '',
        }),
      });

      vi.mocked(userService.getUser).mockReturnValue(Effect.succeed(createGetUserResponse(user)));

      await settingsCommand(mockCtx as unknown as Context);

      expect(mockCtx.reply).toHaveBeenCalled();
    });

    it('should not process if no user ID', async () => {
      mockCtx.from = undefined;

      await settingsCommand(mockCtx as unknown as Context);

      expect(userService.getUser).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      vi.mocked(userService.getUser).mockReturnValue(Effect.fail(new Error('Network error')));

      await settingsCommand(mockCtx as unknown as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(expect.stringContaining('something went wrong'));
    });
  });

  describe('settingsCallbacks', () => {
    it('should handle settings_close callback', async () => {
      mockCtx.callbackQuery = { data: 'settings_close' } as any;

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalled();
      expect(mockCtx.deleteMessage).toHaveBeenCalled();
    });

    it('should toggle notifications', async () => {
      mockCtx.callbackQuery = { data: 'settings_notifications' } as any;

      const user = createMockUser({
        id: '12345',
        preferences: createMockPreferences({ notificationsEnabled: true }),
      });

      vi.mocked(userService.getUser).mockReturnValue(Effect.succeed(createGetUserResponse(user)));

      vi.mocked(userService.updateUser).mockReturnValue(
        Effect.succeed(createUpdateUserResponse(user)),
      );

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(userService.updateUser).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          preferences: { notificationsEnabled: false },
        }),
      );
    });

    it('should show age range options', async () => {
      mockCtx.callbackQuery = { data: 'settings_age_range' } as any;

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Age Range'),
        expect.any(Object),
      );
    });

    it('should update age range', async () => {
      mockCtx.callbackQuery = { data: 'age_25_35' } as any;

      const user = createMockUser({ id: '12345' });
      vi.mocked(userService.updateUser).mockReturnValue(
        Effect.succeed(createUpdateUserResponse(user)),
      );

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(userService.updateUser).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          preferences: { minAge: 25, maxAge: 35 },
        }),
      );
    });

    it('should show distance options', async () => {
      mockCtx.callbackQuery = { data: 'settings_distance' } as any;

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Distance'),
        expect.any(Object),
      );
    });

    it('should update distance', async () => {
      mockCtx.callbackQuery = { data: 'dist_50' } as any;

      const user = createMockUser({ id: '12345' });
      vi.mocked(userService.updateUser).mockReturnValue(
        Effect.succeed(createUpdateUserResponse(user)),
      );

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(userService.updateUser).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          preferences: { maxDistance: 50 },
        }),
      );
    });

    it('should show gender preference options', async () => {
      mockCtx.callbackQuery = { data: 'settings_gender' } as any;

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Gender Preference'),
        expect.any(Object),
      );
    });

    it('should update gender preference', async () => {
      mockCtx.callbackQuery = { data: 'gender_pref_all' } as any;

      const user = createMockUser({ id: '12345' });
      vi.mocked(userService.updateUser).mockReturnValue(
        Effect.succeed(createUpdateUserResponse(user)),
      );

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(userService.updateUser).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          preferences: { genderPreference: ['male', 'female'] },
        }),
      );
    });

    it('should show language options', async () => {
      mockCtx.callbackQuery = { data: 'settings_language' } as any;

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Language'),
        expect.any(Object),
      );
    });

    it('should update language', async () => {
      mockCtx.callbackQuery = { data: 'lang_id' } as any;

      const user = createMockUser({ id: '12345' });
      vi.mocked(userService.updateUser).mockReturnValue(
        Effect.succeed(createUpdateUserResponse(user)),
      );

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(userService.updateUser).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          preferences: { preferredLanguage: 'id' },
        }),
      );
    });

    it('should handle settings_back callback', async () => {
      mockCtx.callbackQuery = { data: 'settings_back' } as any;

      const user = createMockUser({ id: '12345' });
      vi.mocked(userService.getUser).mockReturnValue(Effect.succeed(createGetUserResponse(user)));

      await settingsCallbacks(mockCtx as unknown as Context);

      // Should trigger settingsCommand and delete old message
      expect(mockCtx.reply).toHaveBeenCalled();
    });

    it('should do nothing if no callback data', async () => {
      mockCtx.callbackQuery = undefined;

      await settingsCallbacks(mockCtx as unknown as Context);

      expect(userService.updateUser).not.toHaveBeenCalled();
    });
  });
});
