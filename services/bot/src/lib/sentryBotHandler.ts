import type { Bot, BotError, Context } from 'grammy';
import { addBreadcrumb, captureError } from './sentry.js';

/**
 * Creates a bot error handler that captures errors to Sentry.
 */
export const createSentryErrorHandler = <C extends Context>() => {
  return (err: BotError<C>): void => {
    const ctx = err.ctx;
    const userId = ctx.from?.id?.toString();

    addBreadcrumb('telegram', 'Bot error occurred', 'error', {
      updateId: ctx.update.update_id,
      userId,
      chatId: ctx.chat?.id,
    });

    captureError(err.error, {
      tags: {
        'telegram.update_type': getUpdateType(ctx),
        'bot.handler': 'error_handler',
      },
      extras: {
        updateId: ctx.update.update_id,
        chatId: ctx.chat?.id,
        messageText: ctx.message?.text?.substring(0, 100),
      },
      userId,
    });

    console.error(`Error while handling update ${ctx.update.update_id}:`, err.error);
  };
};

/**
 * Attaches the Sentry error handler to a bot instance.
 */
export const attachSentryErrorHandler = <C extends Context>(bot: Bot<C>): void => {
  bot.catch(createSentryErrorHandler<C>());
};

const getUpdateType = (ctx: Context): string => {
  if (ctx.message) return 'message';
  if (ctx.callbackQuery) return 'callback_query';
  if (ctx.inlineQuery) return 'inline_query';
  return 'unknown';
};
