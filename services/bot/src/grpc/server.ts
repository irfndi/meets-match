/**
 * gRPC Server for Bot Service
 *
 * Exposes the NotificationService.SendNotification RPC for receiving
 * notification requests from the Worker service.
 */
import { createServer } from 'node:http2';
import type { ConnectRouter } from '@connectrpc/connect';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { NotificationService } from '@meetsmatch/contracts/proto/meetsmatch/v1/notification_connect.js';
import type { SendNotificationRequest } from '@meetsmatch/contracts/proto/meetsmatch/v1/notification_pb.js';
import type { Bot } from 'grammy';
import type { MyContext } from '../types.js';
import { createNotificationHandler } from './notificationHandler.js';

/**
 * Runtime type guard for SendNotificationRequest.
 * Validates that the request has the required fields before processing.
 */
function isValidSendNotificationRequest(req: unknown): req is SendNotificationRequest {
  if (typeof req !== 'object' || req === null) {
    return false;
  }

  const r = req as Record<string, unknown>;

  // Check required fields
  if (typeof r.notificationId !== 'string' || r.notificationId.length === 0) {
    return false;
  }

  if (typeof r.userId !== 'string' || r.userId.length === 0) {
    return false;
  }

  // Payload should exist and have a telegram field for our use case
  if (typeof r.payload !== 'object' || r.payload === null) {
    return false;
  }

  // Validate telegram payload exists with required fields
  const payload = r.payload as Record<string, unknown>;
  if (typeof payload.telegram !== 'object' || payload.telegram === null) {
    return false;
  }

  // Validate telegram has required chatId and text fields
  const telegram = payload.telegram as Record<string, unknown>;
  if (typeof telegram.chatId !== 'string' || telegram.chatId.length === 0) {
    return false;
  }
  if (typeof telegram.text !== 'string' || telegram.text.length === 0) {
    return false;
  }

  return true;
}

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

  // Create route definition function for Connect adapter.
  //
  // TYPE SAFETY NOTE: We use 'as any' casts here due to a version mismatch between
  // the generated protobuf types (@meetsmatch/contracts) and @connectrpc/connect.
  // The generated types use a different internal type structure than what connect
  // expects at runtime. This is safe because:
  // 1. The proto definitions are shared between API and Bot services
  // 2. Runtime behavior is validated through integration tests
  // 3. The underlying protobuf serialization is handled by the connect library
  //
  // To resolve this properly, both packages should use the same version of
  // @connectrpc/connect and regenerate types with matching buf plugins.
  const routes = (router: ConnectRouter) =>
    router.service(
      // Cast service definition - generated types use different internal structure
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      NotificationService as any,
      {
        // Only implement SendNotification - other methods are handled by API service.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sendNotification: async (req: any) => {
          // Runtime validation before processing
          if (!isValidSendNotificationRequest(req)) {
            throw new Error('Invalid SendNotificationRequest: missing required fields');
          }
          return notificationHandler(req);
        },

        // Stub implementations for methods not used by Bot service.
        // These throw errors to clearly indicate they should be called on API service instead.
        enqueueNotification: async () => {
          throw new Error('enqueueNotification is not implemented - use API service');
        },
        getNotification: async () => {
          throw new Error('getNotification is not implemented - use API service');
        },
        getDLQStats: async () => {
          throw new Error('getDLQStats is not implemented - use API service');
        },
        replayDLQ: async () => {
          throw new Error('replayDLQ is not implemented - use API service');
        },
        getQueueStats: async () => {
          throw new Error('getQueueStats is not implemented - use API service');
        },
        getReengagementCandidates: async () => {
          throw new Error('getReengagementCandidates is not implemented - use API service');
        },
        logNotificationResult: async () => {
          throw new Error('logNotificationResult is not implemented - use API service');
        },
        // Cast implementation object - allows TypeScript to accept partial implementation
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    );

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
