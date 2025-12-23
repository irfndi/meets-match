import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sentry.js', () => ({
  captureError: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

import { addBreadcrumb, captureError } from './sentry.js';
import { withSentryCapture } from './sentryServiceWrapper.js';

describe('Sentry Service Wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withSentryCapture', () => {
    it('should add success breadcrumb on successful effect', async () => {
      const effect = Effect.succeed('success');
      const wrapped = withSentryCapture('TestService', 'testMethod', effect);

      const result = await Effect.runPromise(wrapped);

      expect(result).toBe('success');
      expect(addBreadcrumb).toHaveBeenCalledWith('api', 'TestService.testMethod succeeded', 'info');
    });

    it('should capture error and add breadcrumb on failure', async () => {
      const error = new Error('test error');
      const effect = Effect.fail(error);
      const wrapped = withSentryCapture('TestService', 'testMethod', effect, {
        userId: 'user123',
      });

      await expect(Effect.runPromise(wrapped)).rejects.toThrow('test error');

      expect(addBreadcrumb).toHaveBeenCalledWith(
        'api',
        'TestService.testMethod failed',
        'error',
        expect.objectContaining({ error: expect.any(String) }),
      );

      expect(captureError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: {
            'service.name': 'TestService',
            'service.method': 'testMethod',
          },
          userId: 'user123',
        }),
      );
    });

    it('should pass through extras to captureError', async () => {
      const error = new Error('test error');
      const effect = Effect.fail(error);
      const wrapped = withSentryCapture('TestService', 'testMethod', effect, {
        extras: { requestId: 'req-123' },
      });

      await expect(Effect.runPromise(wrapped)).rejects.toThrow('test error');

      expect(captureError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          extras: { requestId: 'req-123' },
        }),
      );
    });
  });
});
