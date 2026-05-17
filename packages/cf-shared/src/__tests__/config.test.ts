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
              ConfigProvider.fromMap(new Map([["ENVIRONMENT", "production"]])),
            ),
          ),
        ),
      );

      expect(result.environment).toBe("production");
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
    });
  });
});
