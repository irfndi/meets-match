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
import { aboutCommand, helpCommand } from './handlers/help.js';
import { matchCallbacks, matchCommand } from './handlers/match.js';
import { matchesCallbacks, matchesCommand } from './handlers/matches.js';
import { profileCommand } from './handlers/profile.js';
import { settingsCallbacks, settingsCommand } from './handlers/settings.js';
import { startCommand } from './handlers/start.js';
import { createHealthServer } from './lib/health.js';
import { flushSentry, initSentry, loadSentryConfig } from './lib/sentry.js';
import { attachSentryErrorHandler } from './lib/sentryBotHandler.js';
import { startBotWithRetry } from './lib/startup.js';
import { profileMenu } from './menus/profile.js';
import type { MyContext } from './types.js';

// Initialize Sentry first (before anything else that might fail)
const sentryConfig = loadSentryConfig();
initSentry(sentryConfig);

// Health check HTTP server for container orchestration (Coolify/K8s)
const HEALTH_PORT = Number(process.env.HEALTH_PORT) || 3000;
const healthServer = createHealthServer({ port: HEALTH_PORT });
console.log(`Health server listening on port ${HEALTH_PORT}`);

// Support both BOT_TOKEN and TELEGRAM_TOKEN for backwards compatibility
const token = process.env.BOT_TOKEN || process.env.TELEGRAM_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN or TELEGRAM_TOKEN is required');
}

const bot = new Bot<MyContext>(token);

// Attach Sentry error handler for unhandled bot errors
attachSentryErrorHandler(bot);

bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

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
