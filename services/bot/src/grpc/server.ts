/**
 * gRPC Server for Bot Service
 *
 * Exposes the NotificationService.SendNotification RPC for receiving
 * notification requests from the Worker service.
 */
import { createServer } from 'node:http2';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import type { ConnectRouter } from '@connectrpc/connect';
import type { Bot } from 'grammy';

import { NotificationService } from '@meetsmatch/contracts/proto/meetsmatch/v1/notification_connect.js';
import type { SendNotificationRequest } from '@meetsmatch/contracts/proto/meetsmatch/v1/notification_pb.js';
import type { MyContext } from '../types.js';
import { createNotificationHandler } from './notificationHandler.js';

export interface GrpcServerOptions {
  port: number;
}

/**
 * Starts the gRPC server for receiving notification requests.
 *
 * @param bot - The Grammy bot instance for sending Telegram messages
 * @param options - Server configuration
 */
export function startGrpcServer(bot: Bot<MyContext>, options: GrpcServerOptions): void {
  const notificationHandler = createNotificationHandler(bot);

  // Create route definition function for Connect adapter
  // Note: Using 'as any' casts due to version mismatch between generated proto
  // types and @connectrpc/connect. This is safe as long as the proto definitions match.
  const routes = (router: ConnectRouter) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.service(NotificationService as any, {
      // Only implement SendNotification - other methods are handled by API service
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sendNotification: async (req: any) => notificationHandler(req as SendNotificationRequest),

      // Stub implementations for other methods (not used by Bot)
      enqueueNotification: async () => {
        throw new Error('Not implemented in Bot service');
      },
      getNotification: async () => {
        throw new Error('Not implemented in Bot service');
      },
      getDLQStats: async () => {
        throw new Error('Not implemented in Bot service');
      },
      replayDLQ: async () => {
        throw new Error('Not implemented in Bot service');
      },
      getQueueStats: async () => {
        throw new Error('Not implemented in Bot service');
      },
      getReengagementCandidates: async () => {
        throw new Error('Not implemented in Bot service');
      },
      logNotificationResult: async () => {
        throw new Error('Not implemented in Bot service');
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

  // Create HTTP/2 server with Connect adapter
  const server = createServer(
    connectNodeAdapter({
      routes,
    }),
  );

  server.listen(options.port, () => {
    console.log(`gRPC server listening on port ${options.port}`);
  });
}
