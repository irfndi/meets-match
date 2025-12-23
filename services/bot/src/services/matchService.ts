import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { MatchService } from '@meetsmatch/contracts/proto/meetsmatch/v1/match_connect.js';
import type {
  CreateMatchResponse,
  DislikeMatchResponse,
  GetMatchListResponse,
  GetMatchResponse,
  GetPotentialMatchesResponse,
  LikeMatchResponse,
} from '@meetsmatch/contracts/proto/meetsmatch/v1/match_pb.js';
import { Effect } from 'effect';

const transport = createConnectTransport({
  baseUrl: process.env.API_URL || 'http://localhost:8080',
  httpVersion: '1.1',
});

// Cast to bypass version mismatch between generated code and connect client
const client = createClient(MatchService as any, transport) as any;

export const matchService = {
  getPotentialMatches: (
    userId: string,
    limit: number = 10,
  ): Effect.Effect<GetPotentialMatchesResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<GetPotentialMatchesResponse> =>
        client.getPotentialMatches({ userId, limit }),
      catch: (e) => e,
    }),

  createMatch: (user1Id: string, user2Id: string): Effect.Effect<CreateMatchResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<CreateMatchResponse> => client.createMatch({ user1Id, user2Id }),
      catch: (e) => e,
    }),

  likeMatch: (matchId: string, userId: string): Effect.Effect<LikeMatchResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<LikeMatchResponse> => client.likeMatch({ matchId, userId }),
      catch: (e) => e,
    }),

  dislikeMatch: (matchId: string, userId: string): Effect.Effect<DislikeMatchResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<DislikeMatchResponse> => client.dislikeMatch({ matchId, userId }),
      catch: (e) => e,
    }),

  getMatch: (matchId: string): Effect.Effect<GetMatchResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<GetMatchResponse> => client.getMatch({ matchId }),
      catch: (e) => e,
    }),

  getMatchList: (
    userId: string,
    limit: number = 50,
  ): Effect.Effect<GetMatchListResponse, unknown> =>
    Effect.tryPromise({
      try: async (): Promise<GetMatchListResponse> => client.getMatchList({ userId, limit }),
      catch: (e) => e,
    }),
};
