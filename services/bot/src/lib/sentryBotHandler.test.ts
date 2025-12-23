import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sentry.js', () => ({
  captureError: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { addBreadcrumb, captureError } from './sentry.js';
import { createSentryErrorHandler } from './sentryBotHandler.js';

describe('Sentry Bot Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createSentryErrorHandler', () => {
    it('should capture error with context', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const handler = createSentryErrorHandler();
      const mockError = new Error('test bot error');
      const mockCtx = {
        update: { update_id: 123 },
        from: { id: 456 },
        chat: { id: 789 },
        message: { text: 'test message' },
      };

      handler({ error: mockError, ctx: mockCtx } as any);

      expect(addBreadcrumb).toHaveBeenCalledWith('telegram', 'Bot error occurred', 'error', {
        updateId: 123,
        userId: '456',
        chatId: 789,
      });

      expect(captureError).toHaveBeenCalledWith(
        mockError,
        expect.objectContaining({
          tags: expect.objectContaining({
            'telegram.update_type': 'message',
          }),
          userId: '456',
        }),
      );

      consoleSpy.mockRestore();
    });

    it('should handle missing user context', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const handler = createSentryErrorHandler();
      const mockError = new Error('test error');
      const mockCtx = {
        update: { update_id: 123 },
        from: undefined,
        chat: undefined,
        message: undefined,
      };

      handler({ error: mockError, ctx: mockCtx } as any);

      expect(captureError).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should detect callback_query update type', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const handler = createSentryErrorHandler();
      const mockError = new Error('test error');
      const mockCtx = {
        update: { update_id: 123 },
        from: { id: 456 },
        callbackQuery: { data: 'test' },
      };

      handler({ error: mockError, ctx: mockCtx } as any);

      expect(captureError).toHaveBeenCalledWith(
        mockError,
        expect.objectContaining({
          tags: expect.objectContaining({
            'telegram.update_type': 'callback_query',
          }),
        }),
      );

      consoleSpy.mockRestore();
    });
  });
});
