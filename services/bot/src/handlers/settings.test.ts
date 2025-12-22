import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Context } from 'grammy';
import { Effect } from 'effect';

// Mock the services to return Effect values
vi.mock('../services/userService.js', () => ({
  userService: {
    getUser: vi.fn(),
    updateUser: vi.fn(),
  },
}));

import { userService } from '../services/userService.js';
import { settingsCommand, settingsCallbacks } from './settings.js';

describe('Settings Handler', () => {
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

  describe('settingsCommand', () => {
    it('should display settings menu', async () => {
      vi.mocked(userService.getUser).mockReturnValue(
        Effect.succeed({
          user: {
            id: '12345',
            preferences: {
              minAge: 20,
              maxAge: 30,
              maxDistance: 25,
              notificationsEnabled: true,
            },
          },
        }),
      );

      await settingsCommand(mockCtx as Context);

      expect(mockCtx.reply).toHaveBeenCalledWith(
        expect.stringContaining('Settings'),
        expect.objectContaining({
          parse_mode: 'Markdown',
        }),
      );
    });

    it('should show no preferences message when empty', async () => {
      vi.mocked(userService.getUser).mockReturnValue(
        Effect.succeed({
          user: {
            id: '12345',
            preferences: {},
          },
        }),
      );

      await settingsCommand(mockCtx as Context);

      expect(mockCtx.reply).toHaveBeenCalled();
    });
  });

  describe('settingsCallbacks', () => {
    it('should handle settings_close callback', async () => {
      mockCtx.callbackQuery = { data: 'settings_close' } as any;

      await settingsCallbacks(mockCtx as Context);

      expect(mockCtx.answerCallbackQuery).toHaveBeenCalled();
      expect(mockCtx.deleteMessage).toHaveBeenCalled();
    });

    it('should toggle notifications', async () => {
      mockCtx.callbackQuery = { data: 'settings_notifications' } as any;

      vi.mocked(userService.getUser).mockReturnValue(
        Effect.succeed({
          user: {
            id: '12345',
            preferences: { notificationsEnabled: true },
          },
        }),
      );

      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: { id: '12345' } }));

      await settingsCallbacks(mockCtx as Context);

      expect(userService.updateUser).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          preferences: { notificationsEnabled: false },
        }),
      );
    });

    it('should show age range options', async () => {
      mockCtx.callbackQuery = { data: 'settings_age_range' } as any;

      await settingsCallbacks(mockCtx as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Age Range'),
        expect.any(Object),
      );
    });

    it('should update age range', async () => {
      mockCtx.callbackQuery = { data: 'age_25_35' } as any;

      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: { id: '12345' } }));

      await settingsCallbacks(mockCtx as Context);

      expect(userService.updateUser).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          preferences: { minAge: 25, maxAge: 35 },
        }),
      );
    });

    it('should show distance options', async () => {
      mockCtx.callbackQuery = { data: 'settings_distance' } as any;

      await settingsCallbacks(mockCtx as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Distance'),
        expect.any(Object),
      );
    });

    it('should update distance', async () => {
      mockCtx.callbackQuery = { data: 'dist_50' } as any;

      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: { id: '12345' } }));

      await settingsCallbacks(mockCtx as Context);

      expect(userService.updateUser).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          preferences: { maxDistance: 50 },
        }),
      );
    });

    it('should show gender preference options', async () => {
      mockCtx.callbackQuery = { data: 'settings_gender' } as any;

      await settingsCallbacks(mockCtx as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Gender Preference'),
        expect.any(Object),
      );
    });

    it('should update gender preference', async () => {
      mockCtx.callbackQuery = { data: 'gender_pref_all' } as any;

      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: { id: '12345' } }));

      await settingsCallbacks(mockCtx as Context);

      expect(userService.updateUser).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          preferences: { genderPreference: ['male', 'female'] },
        }),
      );
    });

    it('should show language options', async () => {
      mockCtx.callbackQuery = { data: 'settings_language' } as any;

      await settingsCallbacks(mockCtx as Context);

      expect(mockCtx.editMessageText).toHaveBeenCalledWith(
        expect.stringContaining('Language'),
        expect.any(Object),
      );
    });

    it('should update language', async () => {
      mockCtx.callbackQuery = { data: 'lang_id' } as any;

      vi.mocked(userService.updateUser).mockReturnValue(Effect.succeed({ user: { id: '12345' } }));

      await settingsCallbacks(mockCtx as Context);

      expect(userService.updateUser).toHaveBeenCalledWith(
        '12345',
        expect.objectContaining({
          preferences: { preferredLanguage: 'id' },
        }),
      );
    });
  });
});
