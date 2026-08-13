import * as Cloudflare from "alchemy/Cloudflare";
import { Stack, Stage } from "alchemy";
import { Config, Effect, Redacted } from "effect";

/**
 * MeetMatch — Infrastructure as Effects.
 *
 * Declares the four Workers (cf-api, cf-bot, cf-worker, cf-tail) and every
 * Cloudflare resource they use (D1, KV, R2, Queues, Analytics Engine),
 * replacing the per-service `wrangler.toml` files.
 *
 * Workers are declared in async mode (`env` props + classic
 * `(request, env, ctx)` entry shapes), so the service source code keeps its
 * existing `Env` interfaces and handler wiring unchanged.
 *
 * Stage model mirrors the old wrangler environments:
 *   - `dev`  — meetsmatch-dev resources, no cron triggers
 *   - `prod` — production resources; adopts the pre-existing physical
 *     resources on first deploy
 *
 * Adoption: existing cloud resources (D1 `meetsmatch`, R2
 * `meetsmatch-media`, queues, datasets) are taken over with
 * `pnpm alchemy deploy --stage prod --adopt` — run `alchemy plan` first.
 * KV namespaces get fresh unique titles (see README "Alchemy migration").
 */
export default Stack(
  "meetsmatch",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const stage = yield* Stage;
    const isProd = stage === "prod";
    const environment = isProd ? "production" : "development";

    // ── Shared data resources ────────────────────────────────────────────
    const DB = yield* Cloudflare.D1.Database("DB", {
      name: isProd ? "meetsmatch" : "meetsmatch-dev",
      migrationsDir: "./services/cf-api/migrations",
    });
    const KV = yield* Cloudflare.KV.Namespace("KV", {
      // Unique titles: the old wrangler namespaces are not adopted (their
      // titles are ambiguous); fresh namespaces are created per stage.
      title: isProd ? "meetsmatch-kv" : "meetsmatch-kv-dev",
    });
    const MEDIA = yield* Cloudflare.R2.Bucket("Media", {
      name: "meetsmatch-media",
    });
    const NOTIFICATIONS = yield* Cloudflare.Queues.Queue("Notifications", {
      name: isProd ? "notification-queue" : "notification-queue-dev",
    });
    const DLQ = yield* Cloudflare.Queues.Queue("Dlq", {
      name: isProd ? "dlq" : "dlq-dev",
    });
    const BOT_ERRORS = yield* Cloudflare.AnalyticsEngine.Dataset("BotErrors", {
      dataset: "bot_errors",
    });
    const BOT_METRICS = yield* Cloudflare.AnalyticsEngine.Dataset(
      "BotMetrics",
      {
        dataset: "bot_metrics",
      },
    );

    // Optional shared secret; empty when unset (mirrors old behavior where
    // an unset secret let requests through locally).
    const apiSecret = Config.redacted("API_SECRET").pipe(
      Config.withDefault(Redacted.make("")),
    );

    // ── Workers ──────────────────────────────────────────────────────────
    const Api = yield* Cloudflare.Worker("Api", {
      main: "./services/cf-api/src/index.ts",
      env: {
        DB,
        KV,
        NOTIFICATION_QUEUE: NOTIFICATIONS,
        MEDIA_BUCKET: MEDIA,
        ENVIRONMENT: environment,
        API_SECRET: apiSecret,
      },
    });

    const Tail = yield* Cloudflare.Worker("Tail", {
      main: "./services/cf-tail/src/index.ts",
      env: { ANALYTICS: BOT_METRICS },
    });

    const botEnv = {
      DB,
      KV,
      API_SERVICE: Api,
      MEDIA_BUCKET: MEDIA,
      ERROR_ANALYTICS: BOT_ERRORS,
      ENVIRONMENT: environment,
      BOT_TOKEN: Config.redacted("BOT_TOKEN"),
      TELEGRAM_WEBHOOK_SECRET: Config.redacted(
        "TELEGRAM_WEBHOOK_SECRET",
      ).pipe(Config.withDefault(Redacted.make(""))),
      API_SECRET: apiSecret,
    };
    if (!isProd) botEnv.ADMIN_CHAT_ID = "1082762347";

    const Bot = yield* Cloudflare.Worker("Bot", {
      main: "./services/cf-bot/src/index.ts",
      crons: ["0 */6 * * *"],
      tailConsumers: [Tail],
      env: botEnv,
    });

    const Worker = yield* Cloudflare.Worker("Worker", {
      main: "./services/cf-worker/src/index.ts",
      // Dev has no cron triggers (Cloudflare free-plan limit), as before.
      crons: isProd
        ? [
            "0 8 * * *",
            "0 9 * * *",
            "0 10 * * *",
            "0 11 * * *",
            "0 12 * * *",
            "*/5 * * * *",
            "0 0 * * *",
          ]
        : [],
      env: {
        DB,
        KV,
        NOTIFICATION_QUEUE: NOTIFICATIONS,
        API_SERVICE: Api,
        BOT_SERVICE: Bot,
        API_SECRET: apiSecret,
      },
    });

    // ── Queue consumers (async worker: `queue` handler in cf-worker) ────
    yield* Cloudflare.Queues.Consumer("NotificationConsumer", {
      queueId: NOTIFICATIONS.queueId,
      scriptName: Worker.workerName,
      deadLetterQueue: DLQ.queueName,
      settings: { batchSize: 10, maxRetries: 3, maxWaitTimeMs: 30_000 },
    });
    yield* Cloudflare.Queues.Consumer("DlqConsumer", {
      queueId: DLQ.queueId,
      scriptName: Worker.workerName,
      settings: { batchSize: 1, maxRetries: 0 },
    });
  }),
);
