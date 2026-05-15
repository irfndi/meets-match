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
 * Future: wire to Sentry when ENABLE_SENTRY=true.
 */

declare const console: {
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  log(...args: unknown[]): void;
  debug(...args: unknown[]): void;
};

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogContext {
  userId?: string;
  [key: string]: unknown;
}

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

function serializeError(error: unknown): StructuredLogEntry["error"] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: "Unknown",
    message: String(error),
  };
}

function buildLogEntry(
  level: LogLevel,
  service: string,
  operation: string,
  message: string,
  context?: LogContext,
  error?: unknown,
): StructuredLogEntry {
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    service,
    operation,
    message,
    context,
  };
  if (error !== undefined) {
    entry.error = serializeError(error);
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
      error?: unknown,
    ) =>
      output(
        "error",
        buildLogEntry("error", service, operation, message, context, error),
      ),
    warn: (
      operation: string,
      message: string,
      context?: LogContext,
      error?: unknown,
    ) =>
      output(
        "warn",
        buildLogEntry("warn", service, operation, message, context, error),
      ),
    info: (
      operation: string,
      message: string,
      context?: LogContext,
    ) =>
      output(
        "info",
        buildLogEntry("info", service, operation, message, context),
      ),
    debug: (
      operation: string,
      message: string,
      context?: LogContext,
    ) =>
      output(
        "debug",
        buildLogEntry("debug", service, operation, message, context),
      ),
  };
}

export type StructuredLogger = ReturnType<typeof createLogger>;
