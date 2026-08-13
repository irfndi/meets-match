/**
 * Structured logging utility for consistent error reporting across workers.
 *
 * All log entries include:
 * - timestamp (ISO 8601)
 * - level (error, warn, info)
 * - service (api, bot, worker)
 * - operation (handler name or function)
 * - message
 * - optional context (userId, extra metadata)
 *
 * Logs are automatically captured by Cloudflare Workers observability
 * and can be exported via OpenTelemetry to any OTLP-compatible
 * backend (Sentry, Honeycomb, Datadog, etc.). See wrangler.toml.
 */

declare const console: {
  error(...args: LogValue[]): void;
  warn(...args: LogValue[]): void;
  log(...args: LogValue[]): void;
  debug(...args: LogValue[]): void;
};

export type LogLevel = "error" | "warn" | "info" | "debug";
type LogValue = string | number | boolean | null | undefined | object;

export type LogContext = object & { userId?: string };

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  service: string;
  operation: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

function serializeError(cause: unknown): StructuredLogEntry["error"] {
  if (cause instanceof Error) {
    return {
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    };
  }
  return {
    name: "Unknown",
    message: String(cause),
  };
}

function buildLogEntry(
  level: LogLevel,
  service: string,
  operation: string,
  message: string,
  context?: LogContext,
  cause?: unknown,
): StructuredLogEntry {
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    operation,
    message,
    context,
  };
  if (cause !== undefined) {
    entry.error = serializeError(cause);
  }
  return entry;
}

function output(level: LogLevel, entry: StructuredLogEntry): void {
  const json = JSON.stringify(entry);
  switch (level) {
    case "error":
      console.error(json);
      break;
    case "warn":
      console.warn(json);
      break;
    case "info":
      console.log(json);
      break;
    case "debug":
      console.debug(json);
      break;
  }
}

export function createLogger(service: string) {
  return {
    error: (
      operation: string,
      message: string,
      context?: LogContext,
      cause?: unknown,
    ) =>
      output(
        "error",
        buildLogEntry("error", service, operation, message, context, cause),
      ),
    warn: (
      operation: string,
      message: string,
      context?: LogContext,
      cause?: unknown,
    ) =>
      output(
        "warn",
        buildLogEntry("warn", service, operation, message, context, cause),
      ),
    info: (operation: string, message: string, context?: LogContext) =>
      output(
        "info",
        buildLogEntry("info", service, operation, message, context),
      ),
    debug: (operation: string, message: string, context?: LogContext) =>
      output(
        "debug",
        buildLogEntry("debug", service, operation, message, context),
      ),
  };
}

export type StructuredLogger = ReturnType<typeof createLogger>;
