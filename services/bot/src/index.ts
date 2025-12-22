import 'dotenv/config';
import { Effect } from 'effect';
import { Bot, session } from 'grammy';
import { conversations, createConversation } from '@grammyjs/conversations';

import { helpCommand, aboutCommand } from './handlers/help.js';
import { startCommand } from './handlers/start.js';
import { profileCommand } from './handlers/profile.js';
import { matchCommand, matchCallbacks } from './handlers/match.js';
import { matchesCommand, matchesCallbacks } from './handlers/matches.js';
import { settingsCommand, settingsCallbacks } from './handlers/settings.js';
import {
  editBio,
  editAge,
  editName,
  editGender,
  editInterests,
  editLocation,
} from './conversations/profile.js';
import { profileMenu } from './menus/profile.js';
import type { MyContext } from './types.js';

const token = process.env.BOT_TOKEN;
if (!token) {
  throw new Error('BOT_TOKEN is required');
}

const bot = new Bot<MyContext>(token);

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

console.log('Bot starting...');
bot.start();
