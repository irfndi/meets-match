import { Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @sentry/node before importing sentry module
vi.mock('@sentry/node', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  withScope: vi.fn((callback) =>
    callback({
      setTag: vi.fn(),
      setExtra: vi.fn(),
      setUser: vi.fn(),
    }),
  ),
  addBreadcrumb: vi.fn(),
  flush: vi.fn().mockResolvedValue(true),
}));

import * as Sentry from '@sentry/node';
import {
  addBreadcrumb,
  captureEffectError,
  captureError,
  flushSentry,
  initSentry,
  loadSentryConfig,
} from './sentry.js';

describe('Sentry Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.ENABLE_SENTRY;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadSentryConfig', () => {
    it('should return disabled config when SENTRY_DSN is not set', () => {
      const config = loadSentryConfig();
      expect(config.enabled).toBe(false);
      expect(config.dsn).toBe('');
    });

    it('should return enabled config when SENTRY_DSN and ENABLE_SENTRY are set', () => {
      process.env.SENTRY_DSN = 'https://test@sentry.io/123';
      process.env.ENABLE_SENTRY = 'true';
      process.env.SENTRY_ENVIRONMENT = 'test';

      const config = loadSentryConfig();
      expect(config.enabled).toBe(true);
      expect(config.dsn).toBe('https://test@sentry.io/123');
      expect(config.environment).toBe('test');
    });

    it('should use default values for missing env vars', () => {
      const config = loadSentryConfig();
      expect(config.environment).toBe('development');
      expect(config.tracesSampleRate).toBe(0.2);
      expect(config.release).toBe('meetsmatch-bot@dev');
    });
  });

  describe('initSentry', () => {
    it('should not initialize when disabled', () => {
      initSentry({
        dsn: '',
        environment: 'test',
        tracesSampleRate: 0.2,
        release: 'test@1.0.0',
        enabled: false,
      });
      expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('should initialize when enabled', () => {
      initSentry({
        dsn: 'https://test@sentry.io/123',
        environment: 'test',
        tracesSampleRate: 0.2,
        release: 'test@1.0.0',
        enabled: true,
      });
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dsn: 'https://test@sentry.io/123',
          environment: 'test',
          release: 'test@1.0.0',
        }),
      );
    });
  });

  describe('captureError', () => {
    it('should not capture null/undefined errors', () => {
      captureError(null);
      captureError(undefined);
      expect(Sentry.withScope).not.toHaveBeenCalled();
    });

    it('should capture Error instances', () => {
      captureError(new Error('test error'));
      expect(Sentry.withScope).toHaveBeenCalled();
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('should capture string errors as wrapped Error', () => {
      captureError('test string error');
      expect(Sentry.withScope).toHaveBeenCalled();
      // Non-Error types are now wrapped in an Error for better stack traces
      expect(Sentry.captureException).toHaveBeenCalled();
    });

    it('should set tags and extras when provided', () => {
      const mockScope = {
        setTag: vi.fn(),
        setExtra: vi.fn(),
        setUser: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Sentry.withScope as any).mockImplementation((callback: (scope: any) => void) =>
        callback(mockScope),
      );

      captureError(new Error('test'), {
        tags: { key: 'value' },
        extras: { data: 123 },
        userId: 'user123',
      });

      expect(mockScope.setTag).toHaveBeenCalledWith('key', 'value');
      expect(mockScope.setExtra).toHaveBeenCalledWith('data', 123);
      expect(mockScope.setUser).toHaveBeenCalledWith({ id: 'user123' });
    });
  });

  describe('addBreadcrumb', () => {
    it('should add breadcrumb with correct parameters', () => {
      addBreadcrumb('test-category', 'test message', 'warning', { key: 'value' });
      expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
        category: 'test-category',
        message: 'test message',
        level: 'warning',
        data: { key: 'value' },
      });
    });
  });

  describe('flushSentry', () => {
    it('should call Sentry.flush with timeout', async () => {
      await flushSentry(5000);
      expect(Sentry.flush).toHaveBeenCalledWith(5000);
    });
  });

  describe('captureEffectError', () => {
    it('should return an Effect that captures error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('test error');

      const effect = captureEffectError('testContext', 'user123')(error);
      await Effect.runPromise(effect);

      expect(consoleSpy).toHaveBeenCalledWith('testContext:', error);
      expect(Sentry.withScope).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
