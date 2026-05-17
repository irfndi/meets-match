import { Config, Effect } from "effect";

export const AppConfig = Config.all({
  environment: Config.string("ENVIRONMENT").pipe(
    Config.withDefault("development"),
  ),
});

export type AppConfig = Effect.Effect.Success<typeof AppConfig>;
