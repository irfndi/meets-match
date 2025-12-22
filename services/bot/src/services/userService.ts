import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { UserService } from '@meetsmatch/contracts/proto/meetsmatch/v1/user_connect.js';
import {
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
const client = createClient(UserService as any, transport);

export const userService = {
  getUser: (userId: string): Effect.Effect<GetUserResponse, unknown> =>
    Effect.tryPromise({
      try: () => client.getUser({ userId }) as Promise<GetUserResponse>,
      catch: (e) => e,
    }),

  createUser: (user: any): Effect.Effect<CreateUserResponse, unknown> =>
    Effect.tryPromise({
      try: () => client.createUser({ user }) as Promise<CreateUserResponse>,
      catch: (e) => e,
    }),

  updateUser: (userId: string, user: any): Effect.Effect<UpdateUserResponse, unknown> =>
    Effect.tryPromise({
      try: () => client.updateUser({ userId, user }) as Promise<UpdateUserResponse>,
      catch: (e) => e,
    }),
};
