/**
 * Structured logger utility with sanitization for sensitive data.
 * Replaces direct console usage to prevent secret leakage and ensure consistent log formatting.
 */

// Keys that should be redacted from logs
// Using strict equality or specific patterns to avoid false positives (e.g. "keyboard" containing "key")
const SENSITIVE_KEYS = new Set([
  'token',
  'password',
  'secret',
  'authorization',
  'bearer',
  'sentrydsn',
  'bottoken',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'api_key',
  'client_secret',
  'clientsecret',
]);

/**
 * Safely sanitizes an object, handling circular references and redacting sensitive keys.
 */
const sanitize = (obj: unknown, seen = new WeakSet<object>()): unknown => {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'string') return obj;
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'boolean') return obj;
  if (typeof obj === 'function') return '[Function]';
  if (typeof obj === 'symbol') return '[Symbol]';

  // Handle circular references
  if (typeof obj === 'object') {
    if (seen.has(obj)) {
      return '[Circular]';
    }
    seen.add(obj);
  }

  if (obj instanceof Error) {
    // Handle Error objects specifically as they are not plain objects
    return {
      name: obj.name,
      message: obj.message,
      stack: obj.stack,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(sanitize({ ...obj } as any, seen) as object),
    };
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitize(item, seen));
  }

  // Handle plain objects
  // biome-ignore lint/suspicious/noExplicitAny: Generic object handling
  const newObj: any = {};
  for (const key in obj as object) {
    if (Object.hasOwn(obj, key)) {
      const lowerKey = key.toLowerCase();

      // Strict matching for sensitive keys
      if (SENSITIVE_KEYS.has(lowerKey)) {
        newObj[key] = '[REDACTED]';
      }
      // Partial matching for "token" or "secret" but being careful
      else if (
        (lowerKey.includes('token') && !lowerKey.includes('tokens')) || // avoid "tokens" count fields if any
        (lowerKey.includes('secret') && !lowerKey.includes('secretary')) ||
        lowerKey.includes('password')
      ) {
        // Fallback for compound keys like "githubToken", "userPassword"
        newObj[key] = '[REDACTED]';
      } else {
        // biome-ignore lint/suspicious/noExplicitAny: Generic object handling
        newObj[key] = sanitize((obj as any)[key], seen);
      }
    }
  }

  return newObj;
};

export const logger = {
  info: (message: string, meta?: unknown) => {
    try {
      console.log(
        JSON.stringify({
          level: 'info',
          message,
          timestamp: new Date().toISOString(),
          ...(meta ? { meta: sanitize(meta) } : {}),
        }),
      );
    } catch (_e) {
      console.log(`[Logger Error] Failed to log info: ${message}`);
    }
  },

  warn: (message: string, meta?: unknown) => {
    try {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message,
          timestamp: new Date().toISOString(),
          ...(meta ? { meta: sanitize(meta) } : {}),
        }),
      );
    } catch (_e) {
      console.warn(`[Logger Error] Failed to log warn: ${message}`);
    }
  },

  error: (message: string, error?: unknown) => {
    try {
      console.error(
        JSON.stringify({
          level: 'error',
          message,
          timestamp: new Date().toISOString(),
          ...(error ? { error: sanitize(error) } : {}),
        }),
      );
    } catch (_e) {
      console.error(`[Logger Error] Failed to log error: ${message}`);
    }
  },
};
