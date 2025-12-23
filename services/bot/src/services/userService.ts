import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { UserService } from '@meetsmatch/contracts/proto/meetsmatch/v1/user_connect.js';
import type {
  GetUserResponse,
  CreateUserResponse,
  UpdateUserResponse,
} from '@meetsmatch/contracts/proto/meetsmatch/v1/user_pb.js';
import { Effect } from 'effect';

const transport = createConnectTransport({
  baseUrl: process.env.API_URL || 'http://localhost:8080',
  httpVersion: '1.1',
});

// Cast to bypass version mismatch between generated code and connect client
const client = createClient(UserService as any, transport) as any;

export const userService = {
  getUser: (userId: string): Effect.Effect<GetUserResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<GetUserResponse> => client.getUser({ userId }),
      catch: (e) => e,
    }),

  createUser: (user: any): Effect.Effect<CreateUserResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<CreateUserResponse> => client.createUser({ user }),
      catch: (e) => e,
    }),

  updateUser: (userId: string, user: any): Effect.Effect<UpdateUserResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<UpdateUserResponse> => client.updateUser({ userId, user }),
      catch: (e) => e,
    }),
};
