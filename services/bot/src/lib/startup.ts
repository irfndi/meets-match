/**
 * Bot startup utilities with retry logic for handling deployment conflicts.
 * Handles 409 errors that occur when multiple bot instances try to poll simultaneously.
 */
import { type Bot, type Context, GrammyError } from 'grammy';

export interface StartupOptions {
  maxRetries: number;
  retryDelayMs: number;
  dropPendingUpdates: boolean;
  onStart?: () => void;
  onRetry?: (attempt: number, error: GrammyError) => void;
  onFatalError?: (error: Error) => void;
}

export const DEFAULT_STARTUP_OPTIONS: StartupOptions = {
  maxRetries: 3,
  retryDelayMs: 5000,
  dropPendingUpdates: true,
};

/**
 * Checks if an error is a 409 Conflict error from Telegram API.
 * This typically happens when another bot instance is already polling.
 */
export function isConflictError(error: unknown): error is GrammyError {
  return error instanceof GrammyError && error.error_code === 409;
}

/**
 * Starts a grammY bot with retry logic to handle 409 conflicts during deployment.
 * This is particularly useful when deploying to platforms like Coolify where
 * the old container might not have stopped before the new one starts.
 *
 * @param bot - The grammY bot instance
 * @param options - Startup options including retry configuration
 * @returns Promise that resolves when bot starts successfully, or rejects on fatal error
 */
export async function startBotWithRetry<C extends Context>(
  bot: Bot<C>,
  options: Partial<StartupOptions> = {},
): Promise<void> {
  const config = { ...DEFAULT_STARTUP_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      // Delete any existing webhook and optionally drop pending updates
      await bot.api.deleteWebhook({ drop_pending_updates: config.dropPendingUpdates });

      // Start bot with long polling
      await bot.start({
        drop_pending_updates: config.dropPendingUpdates,
        onStart: config.onStart,
      });

      // If we get here, bot started successfully
      return;
    } catch (error) {
      lastError = error as Error;

      // Only retry on 409 Conflict errors
      if (isConflictError(error) && attempt < config.maxRetries) {
        config.onRetry?.(attempt, error);
        await delay(config.retryDelayMs);
        continue;
      }

      // For other errors or max retries exceeded, throw
      break;
    }
  }

  if (lastError) {
    config.onFatalError?.(lastError);
    throw lastError;
  }
  throw new Error('Unexpected: no error captured during startup retry loop');
}

/**
 * Utility function for async delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
