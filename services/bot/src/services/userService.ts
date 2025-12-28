import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { UserService } from '@meetsmatch/contracts/proto/meetsmatch/v1/user_connect.js';
import type {
  CreateUserResponse,
  GetUserResponse,
  UpdateUserResponse,
} from '@meetsmatch/contracts/proto/meetsmatch/v1/user_pb.js';
import { Effect } from 'effect';

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
    // Cast to bypass version mismatch between generated code and connect client
    _client = createClient(UserService as any, transport);
  }
  return _client;
};

// Reset client for testing purposes
export const _resetClient = (): void => {
  _client = null;
};

export const userService = {
  getUser: (userId: string): Effect.Effect<GetUserResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<GetUserResponse> => getClient().getUser({ userId }),
      catch: (e) => e,
    }),

  createUser: (user: any): Effect.Effect<CreateUserResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<CreateUserResponse> => getClient().createUser({ user }),
      catch: (e) => e,
    }),

  updateUser: (userId: string, user: any): Effect.Effect<UpdateUserResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<UpdateUserResponse> => getClient().updateUser({ userId, user }),
      catch: (e) => e,
    }),
};
