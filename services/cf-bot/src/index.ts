import { Bot, session } from 'grammy';
import type { MyContext } from './types.js';
import { startCommand } from './handlers/start.js';
import { helpCommand, aboutCommand } from './handlers/help.js';
import { profileCommand } from './handlers/profile.js';
import { matchCommand, matchCallbacks } from './handlers/match.js';
import { matchesCommand, matchesCallbacks } from './handlers/matches.js';
import { settingsCommand, settingsCallbacks } from './handlers/settings.js';
import { activityTrackerMiddleware } from './lib/activityTracker.js';
import { handleConversationMessage } from './lib/conversations.js';
import { handleProfileCallback } from './menus/profile.js';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  API_SERVICE: Fetcher;
  BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  ENVIRONMENT?: string;
}

function createBot(env: Env): Bot<MyContext> {
  const bot = new Bot<MyContext>(env.BOT_TOKEN);

  bot.use(session({
    initial: () => ({}),
    storage: {
      read: async (key) => {
        const value = await env.KV.get(`session:${key}`);
        return value ? JSON.parse(value) : {};
      },
      write: async (key, value) => {
        await env.KV.put(`session:${key}`, JSON.stringify(value));
      },
      delete: async (key) => {
        await env.KV.delete(`session:${key}`);
      },
    },
  }));

  bot.use(activityTrackerMiddleware(env));

  bot.command('start', startCommand);
  bot.command('help', helpCommand);
  bot.command('about', aboutCommand);
  bot.command('profile', (ctx) => profileCommand(ctx, env));
  bot.command('match', matchCommand);
  bot.command('matches', matchesCommand);
  bot.command('settings', settingsCommand);

  bot.on('callback_query:data', async (ctx) => {
    const data = ctx.callbackQuery.data;

    if (data.startsWith('profile:')) {
      const handled = await handleProfileCallback(ctx, env, data);
      if (handled) return;
    }

    if (
      data === 'next_match' ||
      data === 'view_matches' ||
      data.startsWith('like_') ||
      data.startsWith('dislike_')
    ) {
      return matchCallbacks(ctx);
    }

    if (
      data === 'matches_close' ||
      data === 'back_to_matches' ||
      data.startsWith('view_match_user_')
    ) {
      return matchesCallbacks(ctx);
    }

    if (
      data.startsWith('settings_') ||
      data.startsWith('age_') ||
      data.startsWith('dist_') ||
      data.startsWith('gender_pref_') ||
      data.startsWith('lang_')
    ) {
      return settingsCallbacks(ctx);
    }
  });

  bot.on('message:text', async (ctx) => {
    const handled = await handleConversationMessage(ctx, env);
    if (handled) return;
    await ctx.reply('Got it. Use /help to see available commands.');
  });

  return bot;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/health' || url.pathname === '/') {
      return new Response(JSON.stringify({ status: 'ok', service: 'cf-bot' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/webhook') {
      if (env.TELEGRAM_WEBHOOK_SECRET) {
        const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }

      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      try {
        const update = await request.json();
        const bot = createBot(env);
        await bot.handleUpdate(update);
        return new Response('OK', { status: 200 });
      } catch (error) {
        console.error('Webhook error:', error);
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
