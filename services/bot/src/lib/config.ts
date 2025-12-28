/**
 * Configuration loader with validation and helpful error messages.
 * Validates required environment variables at startup to fail fast with clear errors.
 */

export interface BotConfig {
  /** Telegram bot token from @BotFather */
  botToken: string;
  /** API URL for backend service */
  apiUrl: string;
  /** Port for health check HTTP server */
  healthPort: number;
  /** Port for gRPC server (notifications from Worker) */
  grpcPort: number;
  /** Sentry/GlitchTip DSN for error tracking */
  sentryDsn: string;
  /** Environment name for Sentry */
  sentryEnvironment: string;
  /** Whether Sentry is enabled */
  enableSentry: boolean;
  /** Sentry release version */
  sentryRelease: string;
  /** Traces sample rate for Sentry */
  tracesSampleRate: number;
}

export class ConfigurationError extends Error {
  constructor(
    message: string,
    public readonly missingVars: string[],
  ) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Load and validate bot configuration from environment variables.
 * Throws ConfigurationError with helpful messages if required vars are missing.
 */
export function loadConfig(): BotConfig {
  const errors: string[] = [];
  const missingVars: string[] = [];

  // BOT_TOKEN is required - support both names for backwards compatibility
  const botToken = process.env.BOT_TOKEN || process.env.TELEGRAM_TOKEN;
  if (!botToken) {
    errors.push(
      'BOT_TOKEN is required. Get one from @BotFather on Telegram: https://t.me/BotFather',
    );
    missingVars.push('BOT_TOKEN');
  }

  // Optional with defaults
  const apiUrl = process.env.API_URL || 'http://localhost:8080';
  const healthPort = Number(process.env.HEALTH_PORT) || 3000;
  const grpcPort = Number(process.env.GRPC_PORT) || 50052;

  // Sentry configuration
  const sentryDsn = process.env.SENTRY_DSN || '';
  const sentryEnvironment = process.env.SENTRY_ENVIRONMENT || 'development';
  const sentryRelease = process.env.SENTRY_RELEASE || 'meetsmatch-bot@dev';
  const enableSentry = process.env.ENABLE_SENTRY === 'true' && sentryDsn.length > 0;
  const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.2;

  if (errors.length > 0) {
    console.error('\n=== CONFIGURATION ERRORS ===');
    for (let i = 0; i < errors.length; i++) {
      console.error(`${i + 1}. ${errors[i]}`);
    }
    console.error('============================\n');
    throw new ConfigurationError(
      `Missing required configuration: ${missingVars.join(', ')}`,
      missingVars,
    );
  }

  return {
    botToken: botToken as string,
    apiUrl,
    healthPort,
    grpcPort,
    sentryDsn,
    sentryEnvironment,
    sentryRelease,
    enableSentry,
    tracesSampleRate,
  };
}

/**
 * Check if the API service is reachable.
 * Useful for startup health checks.
 */
export async function validateApiConnection(config: BotConfig): Promise<boolean> {
  try {
    const response = await fetch(`${config.apiUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
