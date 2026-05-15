import { Config, Effect } from "effect";

export const AppConfig = Config.all({
  environment: Config.string("ENVIRONMENT").pipe(
    Config.withDefault("development"),
  ),
  enableSentry: Config.boolean("ENABLE_SENTRY").pipe(Config.withDefault(false)),
  sentryDsn: Config.string("SENTRY_DSN").pipe(Config.option),
  sentryEnvironment: Config.string("SENTRY_ENVIRONMENT").pipe(
    Config.withDefault("development"),
  ),
  sentryRelease: Config.string("SENTRY_RELEASE").pipe(
    Config.withDefault("meetsmatch@dev"),
  ),
});

export type AppConfig = Effect.Effect.Success<typeof AppConfig>;
