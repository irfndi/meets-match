import { Effect } from 'effect';
import { addBreadcrumb, captureError } from './sentry.js';

/**
 * Wraps an Effect-based service call with Sentry error capture.
 * Use this to wrap API calls to capture errors with context.
 */
export const withSentryCapture = <A, E, R>(
  serviceName: string,
  methodName: string,
  effect: Effect.Effect<A, E, R>,
  context?: { userId?: string; extras?: Record<string, unknown> },
): Effect.Effect<A, E, R> => {
  return effect.pipe(
    Effect.tap(() =>
      Effect.sync(() => {
        addBreadcrumb('api', `${serviceName}.${methodName} succeeded`, 'info');
      }),
    ),
    Effect.tapError((error) =>
      Effect.sync(() => {
        addBreadcrumb('api', `${serviceName}.${methodName} failed`, 'error', {
          error: String(error),
        });
        captureError(error, {
          tags: {
            'service.name': serviceName,
            'service.method': methodName,
          },
          extras: context?.extras,
          userId: context?.userId,
        });
      }),
    ),
  );
};
