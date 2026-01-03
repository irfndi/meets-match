import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { NotificationService } from '@meetsmatch/contracts/proto/meetsmatch/v1/notification_connect.js';
import {
  type EnqueueNotificationResponse,
  type GetDLQStatsResponse,
  type GetNotificationResponse,
  type GetQueueStatsResponse,
  NotificationChannel,
  NotificationType,
  type ReplayDLQResponse,
} from '@meetsmatch/contracts/proto/meetsmatch/v1/notification_pb.js';
import { Effect } from 'effect';

/**
 * Notification service client for the bot.
 *
 * Instead of sending Telegram messages directly, the bot can enqueue
 * notifications through the API, which handles delivery with retries.
 *
 * Example usage:
 * ```typescript
 * yield* _(notificationService.enqueueMutualMatch({
 *   userId: '123',
 *   chatId: '123',
 *   matchName: 'Jane',
 *   matchId: 'match-456',
 * }));
 * ```
 */

// Lazy initialization to avoid module-load-time errors
let _client: any = null;

const getApiUrl = (): string => {
  return process.env.API_URL || 'http://localhost:8080';
};

const getClient = (): any => {
  if (!_client) {
    const transport = createConnectTransport({
      baseUrl: getApiUrl(),
      httpVersion: '1.1',
    });
    _client = createClient(NotificationService as any, transport);
  }
  return _client;
};

// Reset client for testing purposes
export const _resetClient = (): void => {
  _client = null;
};

/**
 * Parameters for mutual match notification.
 */
interface MutualMatchParams {
  userId: string;
  chatId: string;
  matchName: string;
  matchId: string;
}

/**
 * Parameters for generic Telegram notification.
 */
interface TelegramNotificationParams {
  userId: string;
  chatId: string;
  type:
    | 'mutual_match'
    | 'new_like'
    | 'match_reminder'
    | 'profile_incomplete'
    | 'welcome'
    | 'system'
    | 'reengagement_gentle'
    | 'reengagement_urgent'
    | 'reengagement_last_chance';
  text: string;
  parseMode?: 'Markdown' | 'HTML';
  replyMarkup?: object;
  priority?: number;
  idempotencyKey?: string;
  relatedMatchId?: string;
  relatedUserId?: string;
}

// Map string type to proto enum
const typeMap: Record<string, NotificationType> = {
  mutual_match: NotificationType.MUTUAL_MATCH,
  new_like: NotificationType.NEW_LIKE,
  match_reminder: NotificationType.MATCH_REMINDER,
  profile_incomplete: NotificationType.PROFILE_INCOMPLETE,
  welcome: NotificationType.WELCOME,
  system: NotificationType.SYSTEM,
  reengagement_gentle: NotificationType.REENGAGEMENT_GENTLE,
  reengagement_urgent: NotificationType.REENGAGEMENT_URGENT,
  reengagement_last_chance: NotificationType.REENGAGEMENT_LAST_CHANCE,
};

export const notificationService = {
  /**
   * Enqueue a mutual match notification.
   * Called when two users like each other.
   */
  enqueueMutualMatch: (
    params: MutualMatchParams,
  ): Effect.Effect<EnqueueNotificationResponse, unknown> => {
    const text = `
🎉 *It's a Match!*

You and *${params.matchName}* liked each other!

Start a conversation now 👋
`;

    return notificationService.enqueueTelegram({
      userId: params.userId,
      chatId: params.chatId,
      type: 'mutual_match',
      text,
      parseMode: 'Markdown',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🔥 Find More Matches', callback_data: 'next_match' }],
          [{ text: '📋 View Matches', callback_data: 'view_matches' }],
        ],
      },
      priority: 8, // High priority for mutual matches
      idempotencyKey: `mutual_match:${params.matchId}:${params.userId}`,
      relatedMatchId: params.matchId,
    });
  },

  /**
   * Enqueue a generic Telegram notification.
   * Use this for custom notifications.
   */
  enqueueTelegram: (
    params: TelegramNotificationParams,
  ): Effect.Effect<EnqueueNotificationResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<EnqueueNotificationResponse> => {
        const request = {
          userId: params.userId,
          type: typeMap[params.type] || NotificationType.SYSTEM,
          channel: NotificationChannel.TELEGRAM,
          payload: {
            payload: {
              case: 'telegram' as const,
              value: {
                chatId: params.chatId,
                text: params.text,
                parseMode: params.parseMode || 'Markdown',
                replyMarkup: params.replyMarkup ? JSON.stringify(params.replyMarkup) : '',
              },
            },
          },
          priority: params.priority || 0,
          idempotencyKey: params.idempotencyKey || '',
          relatedMatchId: params.relatedMatchId || '',
          relatedUserId: params.relatedUserId || '',
        };

        return getClient().enqueueNotification(request);
      },
      catch: (e) => e,
    }),

  /**
   * Enqueue a welcome notification for new users.
   */
  enqueueWelcome: (
    userId: string,
    chatId: string,
    firstName: string,
  ): Effect.Effect<EnqueueNotificationResponse, unknown> => {
    const text = `
👋 Welcome to MeetMatch, *${firstName}*!

I'm here to help you find meaningful connections.

Get started by completing your profile with /profile, then use /match to start meeting people!

Use /help to see all available commands.
`;

    return notificationService.enqueueTelegram({
      userId,
      chatId,
      type: 'welcome',
      text,
      parseMode: 'Markdown',
      priority: 5,
      idempotencyKey: `welcome:${userId}`,
    });
  },

  /**
   * Get notification by ID (for debugging/monitoring).
   */
  getNotification: (notificationId: string): Effect.Effect<GetNotificationResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<GetNotificationResponse> =>
        getClient().getNotification({ notificationId }),
      catch: (e) => e,
    }),

  /**
   * Get DLQ statistics.
   */
  getDLQStats: (): Effect.Effect<GetDLQStatsResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<GetDLQStatsResponse> => getClient().getDLQStats({}),
      catch: (e) => e,
    }),

  /**
   * Replay notifications from DLQ.
   */
  replayDLQ: (
    type?: NotificationType,
    errorCode?: string,
    limit?: number,
  ): Effect.Effect<ReplayDLQResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<ReplayDLQResponse> =>
        getClient().replayDLQ({
          type: type || NotificationType.UNSPECIFIED,
          errorCode: errorCode || '',
          limit: limit || 100,
        }),
      catch: (e) => e,
    }),

  /**
   * Get queue statistics.
   */
  getQueueStats: (): Effect.Effect<GetQueueStatsResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<GetQueueStatsResponse> => getClient().getQueueStats({}),
      catch: (e) => e,
    }),
};
