import * as Sentry from '@sentry/node';
import { Effect } from 'effect';

export interface SentryConfig {
  dsn: string;
  environment: string;
  tracesSampleRate: number;
  release: string;
  enabled: boolean;
}

/**
 * Parse and validate a sample rate to ensure it's between 0 and 1.
 */
const parseSampleRate = (value: string | undefined, defaultValue: number): number => {
  const parsed = Number.parseFloat(value || String(defaultValue));
  if (Number.isNaN(parsed)) {
    console.warn(`Invalid sample rate "${value}", using default ${defaultValue}`);
    return defaultValue;
  }
  // Clamp to valid range [0, 1]
  return Math.max(0, Math.min(1, parsed));
};

/**
 * Load Sentry configuration from environment variables.
 * Returns disabled config if SENTRY_DSN is not set (graceful degradation).
 */
export const loadSentryConfig = (): SentryConfig => ({
  dsn: process.env.SENTRY_DSN || '',
  environment: process.env.SENTRY_ENVIRONMENT || 'development',
  tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE, 0.2),
  release: process.env.SENTRY_RELEASE || 'meetsmatch-bot@dev',
  enabled: process.env.ENABLE_SENTRY === 'true' && !!process.env.SENTRY_DSN,
});

/**
 * Initialize Sentry with the given configuration.
 * Does nothing if disabled (graceful degradation).
 */
export const initSentry = (config: SentryConfig): void => {
  if (!config.enabled) {
    console.log('Sentry is disabled or SENTRY_DSN not set');
    return;
  }

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    tracesSampleRate: config.tracesSampleRate,
    release: config.release,
    beforeSend(event) {
      // Sanitize sensitive data
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      return event;
    },
  });

  console.log(`Sentry initialized for environment: ${config.environment}`);
};

/**
 * Capture an error with optional context.
 */
export const captureError = (
  error: unknown,
  context?: {
    tags?: Record<string, string>;
    extras?: Record<string, unknown>;
    userId?: string;
  },
): void => {
  if (!error) return;

  Sentry.withScope((scope) => {
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }
    if (context?.extras) {
      for (const [key, value] of Object.entries(context.extras)) {
        scope.setExtra(key, value);
      }
    }
    if (context?.userId) {
      scope.setUser({ id: context.userId });
    }

    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      // Wrap non-Error types in an Error to preserve call stack
      const wrappedError = new Error(String(error));
      wrappedError.name = 'NonErrorException';
      Sentry.captureException(wrappedError);
    }
  });
};

/**
 * Add a breadcrumb for debugging.
 */
export const addBreadcrumb = (
  category: string,
  message: string,
  level: 'debug' | 'info' | 'warning' | 'error' = 'info',
  data?: Record<string, unknown>,
): void => {
  Sentry.addBreadcrumb({
    category,
    message,
    level,
    data,
  });
};

/**
 * Flush pending events (call before shutdown).
 */
export const flushSentry = async (timeout = 2000): Promise<void> => {
  await Sentry.flush(timeout);
};

/**
 * Effect-based error capture that logs and reports to Sentry.
 * Replaces console.error in Effect.catchAll handlers.
 */
export const captureEffectError =
  <E>(context: string, userId?: string) =>
  (error: E): Effect.Effect<void, never> =>
    Effect.sync(() => {
      console.error(`${context}:`, error);
      captureError(error, {
        tags: { context },
        userId,
      });
    });
