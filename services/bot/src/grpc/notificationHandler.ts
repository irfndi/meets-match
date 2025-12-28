/**
 * Notification gRPC Handler
 *
 * Implements the SendNotification RPC for receiving notification requests from the Worker.
 * Sends Telegram messages using the bot's API.
 */
import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';

import type {
  SendNotificationRequest,
  SendNotificationResponse,
} from '@meetsmatch/contracts/proto/meetsmatch/v1/notification_pb.js';
import type { MyContext } from '../types.js';

// Error codes for notification failures
export type NotificationErrorCode =
  | 'blocked_by_user'
  | 'bot_blocked'
  | 'rate_limited'
  | 'network_error'
  | 'invalid_chat'
  | 'unknown';

/**
 * Creates a notification handler bound to a bot instance.
 */
export function createNotificationHandler(bot: Bot<MyContext>) {
  return async (
    req: SendNotificationRequest,
  ): Promise<SendNotificationResponse> => {
    const userId = req.userId;

    if (!userId) {
      return {
        success: false,
        telegramMessageId: BigInt(0),
        error: 'user_id is required',
        errorCode: 'invalid_chat',
      };
    }

    try {
      // Build inline keyboard if buttons are provided
      let replyMarkup: InlineKeyboard | undefined;
      if (req.buttons && req.buttons.length > 0) {
        replyMarkup = new InlineKeyboard();
        for (const button of req.buttons) {
          replyMarkup.text(button.text, button.callbackData);
        }
      }

      // Send message via Telegram
      const message = await bot.api.sendMessage(userId, req.message, {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup,
      });

      return {
        success: true,
        telegramMessageId: BigInt(message.message_id),
        error: '',
        errorCode: '',
      };
    } catch (error) {
      const { errorCode, errorMessage } = categorizeError(error);

      return {
        success: false,
        telegramMessageId: BigInt(0),
        error: errorMessage,
        errorCode,
      };
    }
  };
}

/**
 * Categorizes Telegram API errors into our error codes.
 */
function categorizeError(error: unknown): {
  errorCode: NotificationErrorCode;
  errorMessage: string;
} {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Telegram Bot API error codes and messages
  if (errorMessage.includes('bot was blocked by the user')) {
    return { errorCode: 'bot_blocked', errorMessage };
  }

  if (
    errorMessage.includes('user is deactivated') ||
    errorMessage.includes('chat not found')
  ) {
    return { errorCode: 'invalid_chat', errorMessage };
  }

  if (errorMessage.includes('Too Many Requests')) {
    return { errorCode: 'rate_limited', errorMessage };
  }

  if (
    errorMessage.includes('ETIMEDOUT') ||
    errorMessage.includes('ECONNRESET') ||
    errorMessage.includes('network')
  ) {
    return { errorCode: 'network_error', errorMessage };
  }

  if (errorMessage.includes('Forbidden')) {
    return { errorCode: 'blocked_by_user', errorMessage };
  }

  return { errorCode: 'unknown', errorMessage };
}
