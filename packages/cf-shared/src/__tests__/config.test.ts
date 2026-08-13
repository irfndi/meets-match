import { describe, it, expect } from "vitest";
import { ConfigProvider, Effect } from "effect";
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
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ ENVIRONMENT: "production" }),
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
          Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
        ),
      );

      expect(result.environment).toBe("development");
    });

    it("should parse staging environment", async () => {
      const program = Effect.gen(function* () {
        const config = yield* AppConfig;
        return config;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ ENVIRONMENT: "staging" }),
            ),
          ),
        ),
      );

      expect(result.environment).toBe("staging");
    });

    it("should use default when ENVIRONMENT is empty string", async () => {
      const program = Effect.gen(function* () {
        const config = yield* AppConfig;
        return config;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown(
                { ENVIRONMENT: "" },
                { preserveEmptyStrings: true },
              ),
            ),
          ),
        ),
      );

      expect(result.environment).toBe("");
    });

    it("should handle multiple env vars in map", async () => {
      const program = Effect.gen(function* () {
        const config = yield* AppConfig;
        return config;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                ENVIRONMENT: "test",
                OTHER_VAR: "ignored",
              }),
            ),
          ),
        ),
      );

      expect(result.environment).toBe("test");
    });

    it("should return an object with environment key", async () => {
      const program = Effect.gen(function* () {
        const config = yield* AppConfig;
        return config;
      });

      const result = await Effect.runPromise(
        program.pipe(
          Effect.provide(
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({ ENVIRONMENT: "production" }),
            ),
          ),
        ),
      );

      expect(result).toHaveProperty("environment");
      expect(Object.keys(result)).toEqual(["environment"]);
    });
  });
});
