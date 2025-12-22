import { createClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-node';
import { MatchService } from '@meetsmatch/contracts/proto/meetsmatch/v1/match_connect.js';
import {
  GetPotentialMatchesResponse,
  CreateMatchResponse,
  LikeMatchResponse,
  DislikeMatchResponse,
  GetMatchResponse,
  GetMatchListResponse,
} from '@meetsmatch/contracts/proto/meetsmatch/v1/match_pb.js';
import { Effect } from 'effect';

const transport = createConnectTransport({
  baseUrl: process.env.API_URL || 'http://localhost:8080',
  httpVersion: '1.1',
});

const client = createClient(MatchService, transport);

export const matchService = {
  getPotentialMatches: (
    userId: string,
    limit: number = 10,
  ): Effect.Effect<GetPotentialMatchesResponse, unknown> =>
    Effect.tryPromise({
      try: () =>
        client.getPotentialMatches({ userId, limit }) as Promise<GetPotentialMatchesResponse>,
      catch: (e) => e,
    }),

  createMatch: (user1Id: string, user2Id: string): Effect.Effect<CreateMatchResponse, unknown> =>
    Effect.tryPromise({
      try: () => client.createMatch({ user1Id, user2Id }) as Promise<CreateMatchResponse>,
      catch: (e) => e,
    }),

  likeMatch: (matchId: string, userId: string): Effect.Effect<LikeMatchResponse, unknown> =>
    Effect.tryPromise({
      try: () => client.likeMatch({ matchId, userId }) as Promise<LikeMatchResponse>,
      catch: (e) => e,
    }),

  dislikeMatch: (matchId: string, userId: string): Effect.Effect<DislikeMatchResponse, unknown> =>
    Effect.tryPromise({
      try: () => client.dislikeMatch({ matchId, userId }) as Promise<DislikeMatchResponse>,
      catch: (e) => e,
    }),

  getMatch: (matchId: string): Effect.Effect<GetMatchResponse, unknown> =>
    Effect.tryPromise({
      try: () => client.getMatch({ matchId }) as Promise<GetMatchResponse>,
      catch: (e) => e,
    }),

  getMatchList: (
    userId: string,
    limit: number = 50,
  ): Effect.Effect<GetMatchListResponse, unknown> =>
    Effect.tryPromise({
      try: () => client.getMatchList({ userId, limit }) as Promise<GetMatchListResponse>,
      catch: (e) => e,
    }),
};
