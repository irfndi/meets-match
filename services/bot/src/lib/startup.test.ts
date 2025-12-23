import { GrammyError } from 'grammy';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STARTUP_OPTIONS, delay, isConflictError, startBotWithRetry } from './startup.js';

describe('startup utilities', () => {
  describe('isConflictError', () => {
    it('should return true for 409 GrammyError', () => {
      const error = new GrammyError(
        'Conflict: terminated by other getUpdates request',
        {
          ok: false,
          error_code: 409,
          description: 'Conflict: terminated by other getUpdates request',
        },
        'getUpdates',
        {},
      );
      expect(isConflictError(error)).toBe(true);
    });

    it('should return false for non-409 GrammyError', () => {
      const error = new GrammyError(
        'Not Found',
        {
          ok: false,
          error_code: 404,
          description: 'Not Found',
        },
        'getUpdates',
        {},
      );
      expect(isConflictError(error)).toBe(false);
    });

    it('should return false for generic Error', () => {
      const error = new Error('Some error');
      expect(isConflictError(error)).toBe(false);
    });

    it('should return false for non-error values', () => {
      expect(isConflictError(null)).toBe(false);
      expect(isConflictError(undefined)).toBe(false);
      expect(isConflictError('error')).toBe(false);
      expect(isConflictError({ error_code: 409 })).toBe(false);
    });
  });

  describe('delay', () => {
    it('should resolve after specified time', async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small variance
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('DEFAULT_STARTUP_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_STARTUP_OPTIONS.maxRetries).toBe(3);
      expect(DEFAULT_STARTUP_OPTIONS.retryDelayMs).toBe(5000);
      expect(DEFAULT_STARTUP_OPTIONS.dropPendingUpdates).toBe(true);
    });
  });

  describe('startBotWithRetry', () => {
    let mockBot: {
      api: { deleteWebhook: ReturnType<typeof vi.fn> };
      start: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockBot = {
        api: {
          deleteWebhook: vi.fn().mockResolvedValue(true),
        },
        start: vi.fn().mockResolvedValue(undefined),
      };
    });

    it('should start bot successfully on first attempt', async () => {
      const onStart = vi.fn();

      await startBotWithRetry(mockBot as unknown as Parameters<typeof startBotWithRetry>[0], {
        onStart,
        maxRetries: 3,
        retryDelayMs: 10,
      });

      expect(mockBot.api.deleteWebhook).toHaveBeenCalledWith({ drop_pending_updates: true });
      expect(mockBot.start).toHaveBeenCalledWith({
        drop_pending_updates: true,
        onStart,
      });
    });

    it('should retry on 409 conflict error', async () => {
      const conflictError = new GrammyError(
        'Conflict',
        { ok: false, error_code: 409, description: 'Conflict' },
        'getUpdates',
        {},
      );

      mockBot.api.deleteWebhook.mockRejectedValueOnce(conflictError).mockResolvedValueOnce(true);

      const onRetry = vi.fn();

      await startBotWithRetry(mockBot as unknown as Parameters<typeof startBotWithRetry>[0], {
        maxRetries: 3,
        retryDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledWith(1, conflictError);
      expect(mockBot.api.deleteWebhook).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries exceeded', async () => {
      const conflictError = new GrammyError(
        'Conflict',
        { ok: false, error_code: 409, description: 'Conflict' },
        'getUpdates',
        {},
      );

      mockBot.api.deleteWebhook.mockRejectedValue(conflictError);

      const onFatalError = vi.fn();
      const onRetry = vi.fn();

      await expect(
        startBotWithRetry(mockBot as unknown as Parameters<typeof startBotWithRetry>[0], {
          maxRetries: 2,
          retryDelayMs: 10,
          onRetry,
          onFatalError,
        }),
      ).rejects.toThrow();

      expect(onRetry).toHaveBeenCalledTimes(1); // Only retry once (2 attempts total)
      expect(onFatalError).toHaveBeenCalledWith(conflictError);
    });

    it('should not retry on non-409 errors', async () => {
      const notFoundError = new GrammyError(
        'Not Found',
        { ok: false, error_code: 404, description: 'Not Found' },
        'getUpdates',
        {},
      );

      mockBot.api.deleteWebhook.mockRejectedValue(notFoundError);

      const onRetry = vi.fn();

      await expect(
        startBotWithRetry(mockBot as unknown as Parameters<typeof startBotWithRetry>[0], {
          maxRetries: 3,
          retryDelayMs: 10,
          onRetry,
        }),
      ).rejects.toThrow();

      expect(onRetry).not.toHaveBeenCalled();
      expect(mockBot.api.deleteWebhook).toHaveBeenCalledTimes(1);
    });

    it('should handle error during bot.start()', async () => {
      const conflictError = new GrammyError(
        'Conflict',
        { ok: false, error_code: 409, description: 'Conflict' },
        'getUpdates',
        {},
      );

      mockBot.start.mockRejectedValueOnce(conflictError).mockResolvedValueOnce(undefined);

      const onRetry = vi.fn();

      await startBotWithRetry(mockBot as unknown as Parameters<typeof startBotWithRetry>[0], {
        maxRetries: 3,
        retryDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(mockBot.start).toHaveBeenCalledTimes(2);
    });

    it('should use provided dropPendingUpdates option', async () => {
      await startBotWithRetry(mockBot as unknown as Parameters<typeof startBotWithRetry>[0], {
        dropPendingUpdates: false,
        maxRetries: 1,
      });

      expect(mockBot.api.deleteWebhook).toHaveBeenCalledWith({ drop_pending_updates: false });
      expect(mockBot.start).toHaveBeenCalledWith(
        expect.objectContaining({ drop_pending_updates: false }),
      );
    });
  });
});
