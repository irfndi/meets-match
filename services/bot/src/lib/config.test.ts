import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigurationError, loadConfig, validateApiConnection } from './config.js';

describe('Config Loader', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars before each test
    delete process.env.BOT_TOKEN;
    delete process.env.TELEGRAM_TOKEN;
    delete process.env.API_URL;
    delete process.env.HEALTH_PORT;
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_RELEASE;
    delete process.env.ENABLE_SENTRY;
    delete process.env.SENTRY_TRACES_SAMPLE_RATE;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('loadConfig', () => {
    it('should throw ConfigurationError when BOT_TOKEN is missing', () => {
      expect(() => loadConfig()).toThrow(ConfigurationError);
      expect(() => loadConfig()).toThrow('Missing required configuration');
    });

    it('should include missing vars in ConfigurationError', () => {
      try {
        loadConfig();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError);
        expect((error as ConfigurationError).missingVars).toContain('BOT_TOKEN');
      }
    });

    it('should accept BOT_TOKEN', () => {
      process.env.BOT_TOKEN = 'test-token-123';

      const config = loadConfig();
      expect(config.botToken).toBe('test-token-123');
    });

    it('should accept TELEGRAM_TOKEN as fallback', () => {
      process.env.TELEGRAM_TOKEN = 'telegram-token-456';

      const config = loadConfig();
      expect(config.botToken).toBe('telegram-token-456');
    });

    it('should prefer BOT_TOKEN over TELEGRAM_TOKEN', () => {
      process.env.BOT_TOKEN = 'bot-token';
      process.env.TELEGRAM_TOKEN = 'telegram-token';

      const config = loadConfig();
      expect(config.botToken).toBe('bot-token');
    });

    it('should use defaults for optional values', () => {
      process.env.BOT_TOKEN = 'test-token';

      const config = loadConfig();
      expect(config.apiUrl).toBe('http://localhost:8080');
      expect(config.healthPort).toBe(3000);
      expect(config.sentryDsn).toBe('');
      expect(config.sentryEnvironment).toBe('development');
      expect(config.sentryRelease).toBe('meetsmatch-bot@dev');
      expect(config.enableSentry).toBe(false);
      expect(config.tracesSampleRate).toBe(0.2);
    });

    it('should use custom API_URL when provided', () => {
      process.env.BOT_TOKEN = 'test-token';
      process.env.API_URL = 'http://custom-api:9000';

      const config = loadConfig();
      expect(config.apiUrl).toBe('http://custom-api:9000');
    });

    it('should use custom HEALTH_PORT when provided', () => {
      process.env.BOT_TOKEN = 'test-token';
      process.env.HEALTH_PORT = '4000';

      const config = loadConfig();
      expect(config.healthPort).toBe(4000);
    });

    it('should enable Sentry only when both DSN and flag are set', () => {
      process.env.BOT_TOKEN = 'test-token';
      process.env.SENTRY_DSN = 'https://example.sentry.io/123';
      process.env.ENABLE_SENTRY = 'true';

      const config = loadConfig();
      expect(config.enableSentry).toBe(true);
    });

    it('should not enable Sentry when only DSN is set', () => {
      process.env.BOT_TOKEN = 'test-token';
      process.env.SENTRY_DSN = 'https://example.sentry.io/123';
      // ENABLE_SENTRY not set

      const config = loadConfig();
      expect(config.enableSentry).toBe(false);
    });

    it('should not enable Sentry when only flag is set without DSN', () => {
      process.env.BOT_TOKEN = 'test-token';
      process.env.ENABLE_SENTRY = 'true';
      // SENTRY_DSN not set

      const config = loadConfig();
      expect(config.enableSentry).toBe(false);
    });

    it('should use custom Sentry values when provided', () => {
      process.env.BOT_TOKEN = 'test-token';
      process.env.SENTRY_DSN = 'https://custom.sentry.io/456';
      process.env.SENTRY_ENVIRONMENT = 'production';
      process.env.SENTRY_RELEASE = 'meetsmatch-bot@1.0.0';
      process.env.ENABLE_SENTRY = 'true';
      process.env.SENTRY_TRACES_SAMPLE_RATE = '0.5';

      const config = loadConfig();
      expect(config.sentryDsn).toBe('https://custom.sentry.io/456');
      expect(config.sentryEnvironment).toBe('production');
      expect(config.sentryRelease).toBe('meetsmatch-bot@1.0.0');
      expect(config.enableSentry).toBe(true);
      expect(config.tracesSampleRate).toBe(0.5);
    });
  });

  describe('validateApiConnection', () => {
    it('should return true when API is healthy', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const result = await validateApiConnection({
        botToken: 'test',
        apiUrl: 'http://localhost:8080',
        healthPort: 3000,
        grpcPort: 50052,
        sentryDsn: '',
        sentryEnvironment: 'test',
        sentryRelease: 'test',
        enableSentry: false,
        tracesSampleRate: 0.2,
      });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8080/health',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('should return false when API returns non-ok status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: false });
      vi.stubGlobal('fetch', mockFetch);

      const result = await validateApiConnection({
        botToken: 'test',
        apiUrl: 'http://localhost:8080',
        healthPort: 3000,
        grpcPort: 50052,
        sentryDsn: '',
        sentryEnvironment: 'test',
        sentryRelease: 'test',
        enableSentry: false,
        tracesSampleRate: 0.2,
      });

      expect(result).toBe(false);
    });

    it('should return false when API is unreachable', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      vi.stubGlobal('fetch', mockFetch);

      const result = await validateApiConnection({
        botToken: 'test',
        apiUrl: 'http://localhost:8080',
        healthPort: 3000,
        grpcPort: 50052,
        sentryDsn: '',
        sentryEnvironment: 'test',
        sentryRelease: 'test',
        enableSentry: false,
        tracesSampleRate: 0.2,
      });

      expect(result).toBe(false);
    });

    it('should use the correct API URL from config', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      await validateApiConnection({
        botToken: 'test',
        apiUrl: 'http://custom-api:9000',
        healthPort: 3000,
        grpcPort: 50052,
        sentryDsn: '',
        sentryEnvironment: 'test',
        sentryRelease: 'test',
        enableSentry: false,
        tracesSampleRate: 0.2,
      });

      expect(mockFetch).toHaveBeenCalledWith('http://custom-api:9000/health', expect.any(Object));
    });
  });
});
