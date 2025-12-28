import 'dotenv/config';
import { conversations, createConversation } from '@grammyjs/conversations';
import { Effect } from 'effect';
import { Bot, session } from 'grammy';
import {
  editAge,
  editBio,
  editGender,
  editInterests,
  editLocation,
  editName,
} from './conversations/profile.js';
import { startGrpcServer } from './grpc/server.js';
import { aboutCommand, helpCommand } from './handlers/help.js';
import { matchCallbacks, matchCommand } from './handlers/match.js';
import { matchesCallbacks, matchesCommand } from './handlers/matches.js';
import { profileCommand } from './handlers/profile.js';
import { settingsCallbacks, settingsCommand } from './handlers/settings.js';
import { startCommand } from './handlers/start.js';
import { activityTrackerMiddleware } from './lib/activityTracker.js';
import { loadConfig } from './lib/config.js';
import { createHealthServer } from './lib/health.js';
import { flushSentry, initSentry } from './lib/sentry.js';
import { attachSentryErrorHandler } from './lib/sentryBotHandler.js';
import { startBotWithRetry } from './lib/startup.js';
import { profileMenu } from './menus/profile.js';
import type { MyContext } from './types.js';

// Load and validate configuration first (fails fast with helpful errors)
const config = loadConfig();

// Initialize Sentry for error tracking
initSentry({
  dsn: config.sentryDsn,
  environment: config.sentryEnvironment,
  release: config.sentryRelease,
  enabled: config.enableSentry,
  tracesSampleRate: config.tracesSampleRate,
});

// Health check HTTP server for container orchestration (Coolify/K8s)
const healthServer = createHealthServer({ port: config.healthPort });
console.log(`Health server listening on port ${config.healthPort}`);

const bot = new Bot<MyContext>(config.botToken);

// Attach Sentry error handler for unhandled bot errors
attachSentryErrorHandler(bot);

bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

// Track user activity on every interaction (fire-and-forget)
bot.use(activityTrackerMiddleware);

// Register all profile conversations
bot.use(createConversation(editBio));
bot.use(createConversation(editAge));
bot.use(createConversation(editName));
bot.use(createConversation(editGender));
bot.use(createConversation(editInterests));
bot.use(createConversation(editLocation));

bot.use(profileMenu);

// Commands
bot.command('start', startCommand);
bot.command('help', helpCommand);
bot.command('about', aboutCommand);
bot.command('profile', profileCommand);
bot.command('match', matchCommand);
bot.command('matches', matchesCommand);
bot.command('settings', settingsCommand);

// Callback queries router
bot.on('callback_query:data', (ctx) => {
  const data = ctx.callbackQuery.data;

  // Match-related callbacks
  if (
    data === 'next_match' ||
    data === 'view_matches' ||
    data.startsWith('like_') ||
    data.startsWith('dislike_')
  ) {
    return matchCallbacks(ctx);
  }

  // Matches list callbacks
  if (
    data === 'matches_close' ||
    data === 'back_to_matches' ||
    data.startsWith('view_match_user_')
  ) {
    return matchesCallbacks(ctx);
  }

  // Settings callbacks
  if (
    data.startsWith('settings_') ||
    data.startsWith('age_') ||
    data.startsWith('dist_') ||
    data.startsWith('gender_pref_') ||
    data.startsWith('lang_')
  ) {
    return settingsCallbacks(ctx);
  }

  // Other callbacks are handled by menus
});

// Fallback for unhandled text messages
bot.on('message:text', (ctx) =>
  Effect.runPromise(
    Effect.tryPromise({
      try: () => ctx.reply('Got it. Use /help to see available commands.'),
      catch: (error) => error as Error,
    }),
  ),
);

// Graceful shutdown handlers
const shutdown = async () => {
  if (healthServer.isShuttingDown) return;
  healthServer.setShuttingDown(true);

  console.log('Shutting down...');
  healthServer.setHealthy(false);

  // Give load balancers time to stop routing traffic (drain period)
  await new Promise((resolve) => setTimeout(resolve, 2000));

  bot.stop();
  healthServer.stop();
  await flushSentry();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the bot with retry logic for handling 409 conflicts during deployment
startBotWithRetry(bot, {
  maxRetries: 3,
  retryDelayMs: 5000,
  onStart: () => {
    healthServer.setHealthy(true);
    console.log('Bot started successfully');

    // Start gRPC server for receiving notification requests from Worker
    startGrpcServer(bot, { port: config.grpcPort });
  },
  onRetry: (attempt) => {
    console.warn(
      `409 Conflict detected (attempt ${attempt}/3). ` +
        `Another bot instance may be running. Retrying in 5s...`,
    );
  },
  onFatalError: async (error) => {
    console.error('Failed to start bot:', error);
    healthServer.stop();
    await flushSentry();
    process.exit(1);
  },
});
