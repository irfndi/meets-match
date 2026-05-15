import { describe, it, expect } from "vitest";
import { Config, ConfigProvider, Effect, Layer } from "effect";
import { AppConfig } from "../config.js";

describe("Config", () => {
  describe("AppConfig", () => {
    it("should parse a valid environment", async () => {
      const program = Effect.gen(function* () {
        const config = yield* AppConfig;
        return config;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(
            Layer.setConfigProvider(
              ConfigProvider.fromMap(
                new Map([
                  ["ENVIRONMENT", "production"],
                  ["ENABLE_SENTRY", "true"],
                  ["SENTRY_DSN", "https://example@sentry.io/1"],
                  ["SENTRY_ENVIRONMENT", "production"],
                  ["SENTRY_RELEASE", "v1.0.0"],
                ]),
              ),
            ),
          ),
        ),
      );

      expect(result.environment).toBe("production");
      expect(result.enableSentry).toBe(true);
      expect(result.sentryDsn._tag).toBe("Some");
      if (result.sentryDsn._tag === "Some") {
        expect(result.sentryDsn.value).toBe("https://example@sentry.io/1");
      }
      expect(result.sentryEnvironment).toBe("production");
      expect(result.sentryRelease).toBe("v1.0.0");
    });

    it("should apply defaults when env vars are missing", async () => {
      const program = Effect.gen(function* () {
        const config = yield* AppConfig;
        return config;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(
            Layer.setConfigProvider(ConfigProvider.fromMap(new Map())),
          ),
        ),
      );

      expect(result.environment).toBe("development");
      expect(result.enableSentry).toBe(false);
      expect(result.sentryDsn._tag).toBe("None");
      expect(result.sentryEnvironment).toBe("development");
      expect(result.sentryRelease).toBe("meetsmatch@dev");
    });

    it("should treat SENTRY_DSN as optional (None when missing)", async () => {
      const program = Effect.gen(function* () {
        const config = yield* AppConfig;
        return config;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(
            Layer.setConfigProvider(
              ConfigProvider.fromMap(new Map([["ENABLE_SENTRY", "true"]])),
            ),
          ),
        ),
      );

      expect(result.sentryDsn._tag).toBe("None");
    });

    it("should parse boolean false correctly", async () => {
      const program = Effect.gen(function* () {
        const config = yield* AppConfig;
        return config;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(
            Layer.setConfigProvider(
              ConfigProvider.fromMap(new Map([["ENABLE_SENTRY", "false"]])),
            ),
          ),
        ),
      );

      expect(result.enableSentry).toBe(false);
    });

    it("should fail if ENABLE_SENTRY is not a boolean string", async () => {
      const program = Effect.gen(function* () {
        const config = yield* AppConfig;
        return config;
      });

      await expect(
        Effect.runPromise(
          program.pipe(
            Effect.provide(
              Layer.setConfigProvider(
                ConfigProvider.fromMap(new Map([["ENABLE_SENTRY", "maybe"]])),
              ),
            ),
          ),
        ),
      ).rejects.toThrow();
    });

    it("should reject non-boolean string for ENABLE_SENTRY", async () => {
      const program = Effect.gen(function* () {
        const config = yield* AppConfig;
        return config;
      });

      await expect(
        Effect.runPromise(
          program.pipe(
            Effect.provide(
              Layer.setConfigProvider(
                ConfigProvider.fromMap(new Map([["ENABLE_SENTRY", "TRUE"]])),
              ),
            ),
          ),
        ),
      ).rejects.toThrow();
    });
  });
});
